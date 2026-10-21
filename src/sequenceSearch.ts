import type { SearchRequest, SearchResponse } from './search.worker.ts';

export function runSequenceSearch(
  request: SearchRequest,
  signal: AbortSignal,
): Promise<Extract<SearchResponse, { results: unknown }>> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Recherche annulée', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => {
      worker.terminate();
      signal.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      cleanup();
      reject(new DOMException('Recherche annulée', 'AbortError'));
    };
    signal.addEventListener('abort', cancel, { once: true });
    worker.onmessage = (event: MessageEvent<SearchResponse>) => {
      cleanup();
      if ('error' in event.data) reject(new Error(event.data.error));
      else resolve(event.data);
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error('La recherche locale a échoué. Réessaie.'));
    };
    worker.postMessage(request);
  });
}
