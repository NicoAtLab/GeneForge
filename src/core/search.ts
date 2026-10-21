import { normalizeSequence, reverseComplement, validateSequence } from './sequence.ts';

export interface SequenceMatch {
  start: number;
  end: number;
  strand: '+' | '-' | 'both';
}
export interface SearchResult {
  matches: SequenceMatch[];
  total: number;
  truncated: boolean;
  queryLength: number;
}
export function searchDna(value: string): string {
  const normalized = normalizeSequence(value);
  if (!validateSequence(normalized).valid)
    throw new Error('Caractères invalides : alphabet ADN IUPAC attendu.');
  return normalized;
}
// KMP keeps repetitive genomes and long queries linear in target + query length.
function scan(target: string, query: string, visit: (offset: number) => void) {
  const prefix = new Int32Array(query.length);
  for (let i = 1, j = 0; i < query.length; i++) {
    while (j && query[i] !== query[j]) j = prefix[j - 1];
    if (query[i] === query[j]) j++;
    prefix[i] = j;
  }
  for (let i = 0, j = 0; i < target.length; i++) {
    while (j && target[i] !== query[j]) j = prefix[j - 1];
    if (target[i] === query[j]) j++;
    if (j === query.length) {
      visit(i - query.length + 1);
      j = prefix[j - 1];
    }
  }
}
/** Target must already be validated with searchDna; all positions are inclusive and one-based. */
export function searchNormalized(
  target: string,
  inputQuery: string,
  bothStrands = true,
  limit = 2000,
): SearchResult {
  const query = searchDna(inputQuery);
  if (!query.length) throw new Error('Saisis une séquence à rechercher.');
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 5000)
    throw new Error('Limite de résultats invalide.');
  const matches: SequenceMatch[] = [];
  let total = 0;
  if (query.length <= target.length) {
    const reverse = bothStrands ? reverseComplement(query) : '';
    const palindrome = bothStrands && reverse === query;
    const collect = (strand: SequenceMatch['strand']) => (offset: number) => {
      total++;
      if (matches.length < limit)
        matches.push({ start: offset + 1, end: offset + query.length, strand });
    };
    scan(target, query, collect(palindrome ? 'both' : '+'));
    if (bothStrands && !palindrome) scan(target, reverse, collect('-'));
  }
  matches.sort((a, b) => a.start - b.start || a.strand.localeCompare(b.strand));
  return { matches, total, truncated: total > matches.length, queryLength: query.length };
}
export function searchExact(target: string, query: string, bothStrands = true, limit = 2000) {
  return searchNormalized(searchDna(target), query, bothStrands, limit);
}
