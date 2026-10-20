/** Pure DNA helpers. Coordinates are 1-based after whitespace removal. */
export const MAX_SEQUENCE_LENGTH = 1_000_000;

const DNA_ALPHABET = new Set('ACGTRYSWKMBDHVN');
const COMPLEMENTS: Record<string, string> = {
  A: 'T',
  T: 'A',
  C: 'G',
  G: 'C',
  R: 'Y',
  Y: 'R',
  S: 'S',
  W: 'W',
  K: 'M',
  M: 'K',
  B: 'V',
  V: 'B',
  D: 'H',
  H: 'D',
  N: 'N',
};

export type InvalidBase = { character: string; position: number };

/** Only whitespace is removed. Non-ASCII symbols are retained for validation. */
export function normalizeSequence(input: string): string {
  if (typeof input !== 'string')
    throw new TypeError('La séquence doit être une chaîne de caractères.');
  const compact = input.replace(/\s/g, '');
  if (compact.length > MAX_SEQUENCE_LENGTH) {
    throw new RangeError(
      `La séquence dépasse la limite de ${MAX_SEQUENCE_LENGTH.toLocaleString('fr-FR')} bases.`,
    );
  }
  // Do not uppercase Unicode lookalikes (e.g. ß → SS) into valid DNA symbols.
  return compact.replace(/[a-z]/g, (letter) => letter.toUpperCase());
}

export function validateSequence(input: string): { valid: boolean; invalid: InvalidBase[] } {
  const sequence = normalizeSequence(input);
  const invalid: InvalidBase[] = [];
  let position = 0;
  for (const character of sequence) {
    position += 1;
    if (!DNA_ALPHABET.has(character)) invalid.push({ character, position });
  }
  return { valid: invalid.length === 0, invalid };
}

function validDna(input: string): string {
  const sequence = normalizeSequence(input);
  const { invalid } = validateSequence(sequence);
  if (invalid.length) {
    const details = invalid
      .slice(0, 8)
      .map(({ character, position }) => `${JSON.stringify(character)} en position ${position}`)
      .join(', ');
    throw new Error(
      `ADN invalide : ${details}${invalid.length > 8 ? ` et ${invalid.length - 8} autre(s)` : ''}. Alphabet accepté : ACGTRYSWKMBDHVN.`,
    );
  }
  return sequence;
}

export function sequenceStats(input: string): {
  length: number;
  a: number;
  t: number;
  g: number;
  c: number;
  n: number;
  ambiguous: number;
  canonical: number;
  gc: number | null;
  at: number | null;
} {
  const sequence = validDna(input);
  const counts = { A: 0, T: 0, G: 0, C: 0, N: 0 };
  for (const base of sequence) {
    if (Object.hasOwn(counts, base)) counts[base as keyof typeof counts] += 1;
  }
  const canonical = counts.A + counts.T + counts.G + counts.C;
  return {
    length: sequence.length,
    a: counts.A,
    t: counts.T,
    g: counts.G,
    c: counts.C,
    n: counts.N,
    ambiguous: sequence.length - canonical,
    canonical,
    gc: canonical ? (100 * (counts.G + counts.C)) / canonical : null,
    at: canonical ? (100 * (counts.A + counts.T)) / canonical : null,
  };
}

/** Complement in the original order: 5′→3′ input yields 3′→5′ output. */
export function complement(input: string): string {
  return validDna(input).replace(/./g, (base) => COMPLEMENTS[base]);
}

/** Reverse complement: both input and output are written 5′→3′. */
export function reverseComplement(input: string): string {
  const sequence = validDna(input);
  const output = new Array<string>(sequence.length);
  for (let index = 0; index < sequence.length; index += 1) {
    output[index] = COMPLEMENTS[sequence[sequence.length - 1 - index]];
  }
  return output.join('');
}

/** Literal IUPAC-symbol search on the displayed strand; overlaps included. */
export function findMotifs(input: string, inputMotif: string): number[] {
  const sequence = validDna(input);
  const motif = validDna(inputMotif);
  if (!motif) return [];
  const positions: number[] = [];
  let from = 0;
  while (from <= sequence.length - motif.length) {
    const match = sequence.indexOf(motif, from);
    if (match === -1) break;
    positions.push(match + 1);
    from = match + 1;
  }
  return positions;
}

export function analyzeOligo(input: string): {
  stats: ReturnType<typeof sequenceStats>;
  wallaceTm: number | null;
  complement: string;
  reverseComplement: string;
  homopolymers: { base: string; start: number; length: number }[];
  warnings: string[];
} {
  const sequence = validDna(input);
  const stats = sequenceStats(sequence);
  const homopolymers: { base: string; start: number; length: number }[] = [];
  for (const match of sequence.matchAll(/([ACGT])\1{3,}/g)) {
    homopolymers.push({ base: match[1], start: match.index + 1, length: match[0].length });
  }
  const eligible = stats.length >= 14 && stats.length <= 20 && stats.ambiguous === 0;
  const warnings: string[] = [];
  if (!stats.length) warnings.push('La séquence est vide.');
  if (stats.ambiguous)
    warnings.push(
      'Bases ambiguës présentes : %GC et %AT calculés uniquement sur A, C, G et T ; Tm de Wallace indisponible.',
    );
  if (stats.length && (stats.length < 14 || stats.length > 20)) {
    warnings.push(
      'Tm de Wallace indisponible : cette estimation est limitée aux oligos de 14 à 20 nucléotides.',
    );
  }
  if (eligible)
    warnings.push(
      'Tm de Wallace : estimation indicative sans correction de sels ni de concentration.',
    );
  if (homopolymers.length)
    warnings.push('Présence de segments homopolymères de 4 bases identiques ou plus.');
  return {
    stats,
    wallaceTm: eligible ? 2 * (stats.a + stats.t) + 4 * (stats.g + stats.c) : null,
    complement: complement(sequence),
    reverseComplement: reverseComplement(sequence),
    homopolymers,
    warnings,
  };
}
