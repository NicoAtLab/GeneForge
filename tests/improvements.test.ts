import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectGelLanes } from '../src/core/laneDetection.ts';
import { naturalNames } from '../src/core/ordering.ts';
import { validatePairAnalysis } from '../server/primer3.ts';

function artificialGel(count: number, light = false, skip = -1) {
  const width = 1200,
    height = 260,
    pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = pixels[i + 1] = pixels[i + 2] = light ? 245 : 10;
    pixels[i + 3] = 255;
  }
  const laneWidth = width / count;
  for (let lane = 0; lane < count; lane++) {
    if (lane === skip) continue;
    for (let b = 0; b < 3; b++)
      for (let y = 35 + b * 60 + (lane % 3) * 4; y < 43 + b * 60 + (lane % 3) * 4; y++)
        for (let x = Math.round(laneWidth * (lane + 0.22)); x < laneWidth * (lane + 0.78); x++) {
          const i = (y * width + x) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = light ? 20 : 235;
        }
  }
  return { pixels, width, height, crop: { x: 0, y: 0, width, height } };
}
test('lane detection finds 5, 12 and 24 equal lanes on dark or light backgrounds', () => {
  for (const count of [5, 12, 24])
    for (const light of [false, true]) {
      const g = artificialGel(count, light);
      const result = detectGelLanes(g.pixels, g.width, g.height, g.crop);
      assert.equal(result.count, count);
      assert.equal(result.polarity, light ? 'light' : 'dark');
      assert.equal(result.confidence, 'high');
    }
});
test('lane detection infers an internal empty position and refuses blank images', () => {
  const g = artificialGel(12, false, 5),
    result = detectGelLanes(g.pixels, g.width, g.height, g.crop);
  assert.equal(result.count, 12);
  assert.equal(result.confidence, 'medium');
  const blank = new Uint8ClampedArray(300 * 200 * 4);
  assert.equal(
    detectGelLanes(blank, 300, 200, { x: 0, y: 0, width: 300, height: 200 }).count,
    null,
  );
  assert.throws(() => detectGelLanes(blank, 300, 200, { x: 300, y: 0, width: 3, height: 20 }));
});
test('natural oligo ordering compares numeric groups without changing names', () => {
  const entries = ['N60', 'N2', 'NX10', 'N10', 'N1', 'NX2'].map((name) => ({ name }));
  assert.deepEqual(
    entries.sort(naturalNames).map((e) => e.name),
    ['N1', 'N2', 'N10', 'N60', 'NX2', 'NX10'],
  );
});
test('pair validation normalizes both strands and rejects unsupported requests before invoking Python', () => {
  const request = {
    sequence1: 'acgt acgt',
    sequence2: 'GCATGCAT',
    mv_conc: 50,
    dv_conc: 1.5,
    dntp_conc: 0.6,
    dna_conc: 50,
    temp_c: 37,
  };
  assert.equal(validatePairAnalysis(request).sequence1, 'ACGTACGT');
  for (const changes of [
    { sequence2: 'ACGN' },
    { sequence1: 'A' },
    { sequence1: 'A'.repeat(60), sequence2: 'T'.repeat(60) },
    { temp_c: NaN },
    { temp_c: 101 },
    { dna_conc: 0 },
    { extra: true },
  ])
    assert.throws(() => validatePairAnalysis({ ...request, ...changes }));
});
