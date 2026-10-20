import assert from 'node:assert/strict';
import { test } from 'node:test';
import { remapAnnotations, reverseAnnotations } from '../src/core/annotations.ts';
import { sequenceStats } from '../src/core/sequence.ts';
import type { SequenceAnnotation } from '../src/types.ts';

const a: SequenceAnnotation = {
  id: 'a',
  name: 'Région',
  start: 3,
  end: 6,
  color: '#f4ca64',
  notes: 'Information à conserver',
  needsReview: false,
};
test('insertion before and at region boundaries shifts without changing the annotated bases', () => {
  assert.deepEqual(remapAnnotations([a], 'ACGTACGT', 'TTACGTACGT')[0], { ...a, start: 5, end: 8 });
  assert.deepEqual(remapAnnotations([a], 'ACGTACGT', 'ACTTGTACGT', { start: 2, end: 2 })[0], {
    ...a,
    start: 5,
    end: 8,
  });
  assert.deepEqual(remapAnnotations([a], 'ACGTACGT', 'ACGTACTTGT', { start: 6, end: 6 })[0], a);
});
test('an edit inside a region adjusts its span and flags it for review', () => {
  const result = remapAnnotations([a], 'ACGTACGT', 'ACGTTTACGT', { start: 4, end: 4 })[0];
  assert.deepEqual(result, { ...a, end: 8, needsReview: true });
  assert.deepEqual(remapAnnotations([a], 'ACGTACGT', 'ACGCGT', { start: 3, end: 5 })[0], {
    ...a,
    end: 4,
    needsReview: true,
  });
});
test('deleting the whole region retains notes as an annotation without coordinates', () => {
  assert.deepEqual(remapAnnotations([a], 'ACGTACGT', 'ACGT', { start: 2, end: 6 })[0], {
    ...a,
    start: null,
    end: null,
    needsReview: true,
  });
  assert.deepEqual(remapAnnotations([a], 'ACGTACGT', '')[0], {
    ...a,
    start: null,
    end: null,
    needsReview: true,
  });
});
test('explicit edit offsets disambiguate repeated bases', () => {
  assert.deepEqual(remapAnnotations([a], 'AAAAAAAA', 'AAAAAAA', { start: 0, end: 1 })[0], {
    ...a,
    start: 2,
    end: 5,
  });
  assert.deepEqual(remapAnnotations([a], 'AAAAAAAA', 'AAAAAAA', { start: 3, end: 4 })[0], {
    ...a,
    end: 5,
    needsReview: true,
  });
});
test('overlapping regions remap independently and reversing twice restores their positions', () => {
  const annotations = [
    a,
    { ...a, id: 'b', start: 5, end: 8 },
    { ...a, id: 'c', start: null, end: null, needsReview: true },
  ];
  const remapped = remapAnnotations(annotations, 'ACGTACGT', 'ACGTCGT', { start: 4, end: 5 });
  assert.equal(remapped[0].needsReview, true);
  assert.equal(remapped[1].needsReview, true);
  assert.deepEqual(remapped[2], annotations[2]);
  assert.deepEqual(reverseAnnotations(reverseAnnotations(annotations, 8), 8), annotations);
  assert.deepEqual(reverseAnnotations([{ ...a, start: 1, end: 3 }], 8)[0], {
    ...a,
    start: 6,
    end: 8,
  });
});
test('normalized whitespace-only edits leave annotations unchanged', () => {
  assert.deepEqual(remapAnnotations([a], 'ACGTACGT', 'ACGTACGT'), [a]);
});
test('selection statistics count ambiguous bases without inflating GC or AT', () => {
  const stats = sequenceStats('AACTGNNR');
  assert.deepEqual(
    [stats.length, stats.a, stats.t, stats.g, stats.c, stats.ambiguous],
    [8, 2, 1, 1, 1, 3],
  );
  assert.equal(stats.gc, 40);
  assert.equal(stats.at, 60);
  assert.equal(sequenceStats('NNR').gc, null);
});
