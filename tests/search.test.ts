import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchExact } from '../src/core/search.ts';
import { createAutomaticAnnotations } from '../src/core/automaticAnnotations.ts';
import type { SourceChoice } from '../src/core/automaticAnnotations.ts';
import { reverseAnnotations } from '../src/core/annotations.ts';

test('exact search normalizes case/whitespace and returns inclusive coordinates and overlaps', () => {
  assert.deepEqual(searchExact('aaa aa', 'aAa', false).matches, [
    { start: 1, end: 3, strand: '+' },
    { start: 2, end: 4, strand: '+' },
    { start: 3, end: 5, strand: '+' },
  ]);
  assert.equal(searchExact('ACGT', 'ACGTA').total, 0);
  assert.equal(searchExact('ACGT', 'NN', true).total, 0);
  assert.equal(searchExact('ACNN', 'nN', false).total, 1);
  assert.throws(() => searchExact('ACGU', 'AC'), /invalides/);
  assert.throws(() => searchExact('ACGT', ''), /Saisis/);
  assert.throws(() => searchExact('ACGT', '!'), /invalides/);
});
test('reverse complement matches have their own direction, palindromes are counted once', () => {
  assert.deepEqual(searchExact('AACGGGTT', 'AAC').matches, [
    { start: 1, end: 3, strand: '+' },
    { start: 6, end: 8, strand: '-' },
  ]);
  assert.deepEqual(searchExact('ACGT', 'ACGT').matches, [{ start: 1, end: 4, strand: 'both' }]);
  assert.equal(searchExact('GGTT', 'AAC', false).total, 0);
});
test('long repetitive queries use bounded result storage and a complete hit count', () => {
  const result = searchExact('A'.repeat(1_000_000), 'A'.repeat(100_000), false, 20);
  assert.equal(result.total, 900001);
  assert.equal(result.matches.length, 20);
  assert.equal(result.truncated, true);
  assert.equal(searchExact('A'.repeat(1_000_000), 'A'.repeat(1_000_000), false).total, 1);
});
test('search coordinates agree with a simple exact matcher over generated short strings', () => {
  let seed = 93;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };
  for (let trial = 0; trial < 150; trial++) {
    const target = Array.from({ length: 80 }, () => 'ACGTN'[random() % 5]).join('');
    const query = target.slice(random() % 60, 70).slice(0, 1 + (random() % 8));
    const expected = [];
    for (let i = 0; i <= target.length - query.length; i++)
      if (target.slice(i, i + query.length) === query) expected.push(i + 1);
    assert.deepEqual(
      searchExact(target, query, false).matches.map((m) => m.start),
      expected,
    );
  }
});
const choice: SourceChoice = {
  key: 'sequence:up',
  kind: 'sequence',
  recordId: 'up',
  name: 'Fragment UP',
  fileName: 'fragments.fasta',
  sequence: 'AAC',
  notes: 'Artificiel',
  role: 'up',
};
let counter = 0;
const id = () => 'id-' + ++counter;
const stamp = '2026-10-20T10:00:00.000Z';
test('automatic annotations share an immutable source snapshot and deduplicate repeated analyses', () => {
  const results = [{ key: choice.key, result: searchExact('AACGGGTT', choice.sequence) }];
  const first = createAutomaticAnnotations([], [], [choice], results, id, stamp);
  assert.equal(first.added, 2);
  assert.equal(first.annotationSources.length, 1);
  assert.equal(first.annotationSources[0].fileName, 'fragments.fasta');
  assert.deepEqual(
    first.annotations.map((a) => [a.start, a.end, a.role, a.strand]),
    [
      [1, 3, 'up', '+'],
      [6, 8, 'up', '-'],
    ],
  );
  const again = createAutomaticAnnotations(
    first.annotations,
    first.annotationSources,
    [choice],
    results,
    id,
    stamp,
  );
  assert.equal(again.added, 0);
  assert.equal(again.skipped, 2);
  assert.deepEqual(
    reverseAnnotations(reverseAnnotations(first.annotations, 8), 8),
    first.annotations,
  );
  const changedChoice = { ...choice, sequence: 'CCC' };
  const changed = createAutomaticAnnotations(
    first.annotations,
    first.annotationSources,
    [changedChoice],
    [{ key: choice.key, result: searchExact('ACCC', 'CCC') }],
    id,
    stamp,
  );
  assert.equal(changed.annotationSources.length, 2);
  assert.equal(changed.annotationSources[0].sequence, 'AAC');
});
test('absent sources add nothing and truncated previews cannot create incomplete annotations', () => {
  const absent = createAutomaticAnnotations(
    [],
    [],
    [choice],
    [{ key: choice.key, result: searchExact('CCCC', 'AAC') }],
    id,
    stamp,
  );
  assert.equal(absent.added, 0);
  assert.equal(absent.annotationSources.length, 0);
  assert.throws(
    () =>
      createAutomaticAnnotations(
        [],
        [],
        [choice],
        [{ key: choice.key, result: searchExact('AACAAC', 'AAC', false, 1) }],
        id,
        stamp,
      ),
    /incomplet/,
  );
});
