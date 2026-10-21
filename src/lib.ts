import type { WorkspaceState } from './types.ts';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message || result.error || `Erreur locale (${response.status})`);
  return result as T;
}
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const number = (n: number) => n.toLocaleString('fr-FR');
export const percent = (n: number | null) =>
  n === null ? '—' : `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
export const date = (value: string) =>
  new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
export function download(content: string, filename: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function filename(name: string) {
  return name.replace(/[^\p{L}\p{N}_.-]/gu, '_').slice(0, 100) || 'geneforge';
}
export async function readFile(file: File): Promise<string> {
  if (file.size > 16 * 1024 * 1024) throw new Error('Le fichier dépasse la limite de 16 Mo.');
  return file.text();
}
export type Commit = (
  update: (state: WorkspaceState) => WorkspaceState,
  message?: string,
) => Promise<boolean>;
