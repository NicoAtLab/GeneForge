import { searchDna, searchNormalized } from './core/search.ts';
import type { SearchResult } from './core/search.ts';

export interface SearchRequest {
  target: string;
  queries: { key: string; sequence: string }[];
  bothStrands: boolean;
  limit: number;
}
export type SearchResponse =
  | { results: { key: string; result: SearchResult }[] }
  | { error: string };

self.addEventListener('message', (event: MessageEvent<SearchRequest>) => {
  try {
    const { queries, bothStrands, limit } = event.data;
    if (queries.length > 200) throw new Error('Choisis au plus 200 sources par analyse.');
    const target = searchDna(event.data.target);
    let remaining = limit;
    const results = queries.map((query) => {
      const result = searchNormalized(target, query.sequence, bothStrands, remaining);
      remaining -= result.matches.length;
      return { key: query.key, result };
    });
    self.postMessage({ results } satisfies SearchResponse);
  } catch (error) {
    self.postMessage({ error: (error as Error).message } satisfies SearchResponse);
  }
});
