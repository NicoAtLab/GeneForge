import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_SEQUENCE_LENGTH,
  normalizeSequence,
  validateSequence,
  sequenceStats,
  complement,
  reverseComplement,
  findMotifs,
  analyzeOligo,
} from '../src/core/sequence.ts';
import { parseFasta, exportFasta, parsePrimerCsv, exportPrimerCsv } from '../src/core/formats.ts';

test('TSV preserves quoted tabs and deduplicates tags', () => {
  assert.deepEqual(
    parsePrimerCsv(
      'name\tsequence\tnotes\ttags\r\nExemple\tacgt\t"texte\tconservé"\ttest;test\r\n',
    ),
    [{ name: 'Exemple', sequence: 'ACGT', notes: 'texte\tconservé', tags: ['test'] }],
  );
});

test('normalization removes whitespace but never discards invalid symbols', () => {
  assert.equal(normalizeSequence(' a c\r\ng\tt n-1ßſ '), 'ACGTN-1ßſ');
  assert.deepEqual(validateSequence('a c\tU-9'), {
    valid: false,
    invalid: [
      { character: 'U', position: 3 },
      { character: '-', position: 4 },
      { character: '9', position: 5 },
    ],
  });
  assert.equal(validateSequence('ßſ').valid, false);
  assert.equal(validateSequence('acgtryswkmbdhvn').valid, true);
});

test('all computations reject invalid DNA instead of returning partial statistics', () => {
  for (const operation of [sequenceStats, complement, reverseComplement, analyzeOligo]) {
    assert.throws(() => operation('ACG1T'), /position 4/);
  }
  assert.throws(() => findMotifs('ACGT', 'U'), /ADN invalide/);
});

test('GC and AT exclude ambiguous bases from their denominator and report their count', () => {
  assert.deepEqual(sequenceStats('ACGTNNRY'), {
    length: 8,
    a: 1,
    t: 1,
    g: 1,
    c: 1,
    n: 2,
    ambiguous: 4,
    canonical: 4,
    gc: 50,
    at: 50,
  });
  assert.equal(sequenceStats('CCAN').gc, 200 / 3);
  assert.equal(sequenceStats('NNRY').gc, null);
  assert.equal(sequenceStats('').at, null);
});

test('IUPAC complement pairs and orientation are correct for the complete alphabet', () => {
  const alphabet = 'ACGTRYSWKMBDHVN';
  assert.equal(complement(alphabet), 'TGCAYRSWMKVHDBN');
  assert.equal(reverseComplement(alphabet), 'NBDHVKMWSRYACGT');
  assert.equal(reverseComplement(reverseComplement(alphabet)), alphabet);
  assert.equal(complement('ATGC'), 'TACG');
  assert.equal(reverseComplement('ATGC'), 'GCAT');
});

test('motif coordinates are one-based and include overlapping literal-symbol matches', () => {
  assert.deepEqual(findMotifs('AA AAA', 'aaa'), [1, 2, 3]);
  assert.deepEqual(findMotifs('ACNAGN', 'N'), [3, 6]);
  assert.deepEqual(findMotifs('ACGT', 'N'), []);
  assert.deepEqual(findMotifs('ACGT', ''), []);
  assert.deepEqual(findMotifs('AC', 'ACG'), []);
});

test('Wallace values follow 2AT+4GC only for canonical 14–20 nt oligos', () => {
  assert.equal(analyzeOligo('AT'.repeat(7)).wallaceTm, 28);
  assert.equal(analyzeOligo('ACGT'.repeat(4)).wallaceTm, 48);
  assert.equal(analyzeOligo('GC'.repeat(10)).wallaceTm, 80);
  for (const sequence of ['A'.repeat(13), 'A'.repeat(21), 'ACGT'.repeat(4) + 'N', '']) {
    assert.equal(analyzeOligo(sequence).wallaceTm, null);
  }
  assert.match(analyzeOligo('ACGT'.repeat(4)).warnings.join(' '), /estimation indicative/);
});

test('homopolymers report full canonical runs and normalized coordinates', () => {
  assert.deepEqual(analyzeOligo('NNNN AAAA TTT CC CCC').homopolymers, [
    { base: 'A', start: 5, length: 4 },
    { base: 'C', start: 12, length: 5 },
  ]);
});

test('sequence size limit applies at its exact normalized boundary', () => {
  assert.equal(
    normalizeSequence('A'.repeat(MAX_SEQUENCE_LENGTH) + '\n').length,
    MAX_SEQUENCE_LENGTH,
  );
  assert.throws(() => normalizeSequence('A'.repeat(MAX_SEQUENCE_LENGTH + 1)), RangeError);
});

test('FASTA parser preserves complete headers and reads multiple CRLF records', () => {
  assert.deepEqual(parseFasta('\uFEFF>toy A description\r\nac gt\r\nNN\r\n\r\n>toy B\r\nRYSW'), [
    { name: 'toy A description', sequence: 'ACGTNN' },
    { name: 'toy B', sequence: 'RYSW' },
  ]);
});

test('FASTA rejects missing headers, empty records, and biological corruption', () => {
  for (const invalid of ['', 'ACGT', '>\nACGT', '>a\n>b\nACGT', '>a\n', '>a\nACG2T', '>a\nACGU']) {
    assert.throws(() => parseFasta(invalid));
  }
  assert.throws(() => parseFasta('>a\nACGT\nU'), /ligne 3/);
});

test('FASTA export wraps lines and roundtrips full normalized records', () => {
  const records = [{ name: 'toy', sequence: 'ACGT'.repeat(23) }];
  const fasta = exportFasta(records);
  assert.equal(fasta.split('\n')[1].length, 80);
  assert.deepEqual(parseFasta(fasta), records);
  assert.throws(() => exportFasta([{ name: 'one\n>two', sequence: 'ACGT' }]), /contrôle/);
  assert.throws(() => exportFasta([{ name: 'toy', sequence: '' }]), /vide/);
});

test('CSV roundtrips quoted comma, quote and newline metadata', () => {
  const records = [
    {
      name: 'toy, "A"',
      sequence: 'ACGTACGTACGTACGT',
      notes: 'ligne 1\r\nligne 2, "essai"',
      tags: ['demo', 'test'],
    },
  ];
  assert.deepEqual(parsePrimerCsv(exportPrimerCsv(records)), records);
});

test('CSV accepts BOM, reordered headers and omitted optional columns', () => {
  assert.deepEqual(parsePrimerCsv('\uFEFFsequence,name\nac gt,oligo démo\n'), [
    { name: 'oligo démo', sequence: 'ACGT', notes: '', tags: [] },
  ]);
  assert.deepEqual(parsePrimerCsv('name,sequence\n'), []);
});

test('CSV rejects malformed quotes, inconsistent columns, missing and duplicate headers', () => {
  for (const invalid of [
    '',
    'name,name\na,b',
    'name\na',
    'name,sequence,extra\na,ACGT,x',
    'name,sequence\na,ACGT,extra',
    'name,sequence\na',
    'name,sequence\n"a,ACGT',
    'name,sequence\n"a"x,ACGT',
    'name,sequence\na"b,ACGT',
    'name,sequence\n,ACGT',
    'name,sequence\na,ACGU',
    'name;sequence\na;ACGT',
  ])
    assert.throws(() => parsePrimerCsv(invalid), invalid);
});

test('CSV diagnostics retain physical line numbers after multiline quoted fields', () => {
  assert.throws(
    () => parsePrimerCsv('name,sequence,notes\na,ACGT,"one\ntwo"\nb,ACGU,no'),
    /ligne 4/,
  );
});

test('CSV export protects formula-like metadata before quoting', () => {
  for (const value of ['=1+1', '+1+1', '-1+1', '@SUM(1)', '  =1+1', '\t=1+1', '\n=1+1']) {
    const csv = exportPrimerCsv([{ name: 'toy', sequence: 'ACGT', notes: value }]);
    assert.equal(parsePrimerCsv(csv)[0].notes, `'${value}`);
  }
  assert.equal(
    parsePrimerCsv(exportPrimerCsv([{ name: '=1+1', sequence: 'ACGT' }]))[0].name,
    "'=1+1",
  );
  assert.throws(
    () => exportPrimerCsv([{ name: 'toy', sequence: 'ACGT', tags: ['one;two'] }]),
    /tags/,
  );
});
