const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
export function naturalNames(a: { name: string }, b: { name: string }) {
  return collator.compare(a.name, b.name) || a.name.localeCompare(b.name);
}
