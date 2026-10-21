import type { SequenceAnnotation } from '../types.ts';

export interface EditRange {
  start: number;
  end: number;
}

// Offsets describe the normalized OLD sequence, zero-based and end-exclusive.
// Prefer the browser's edit range: repeated bases make a diff alone ambiguous.
export function locateEdit(before: string, after: string, hint?: EditRange) {
  if (hint && hint.start >= 0 && hint.end >= hint.start && hint.end <= before.length) {
    const inserted = after.length - (before.length - (hint.end - hint.start));
    if (
      inserted >= 0 &&
      before.slice(0, hint.start) === after.slice(0, hint.start) &&
      before.slice(hint.end) === after.slice(hint.start + inserted)
    ) {
      return { ...hint, inserted };
    }
  }
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = before.length,
    afterEnd = after.length;
  while (end > start && afterEnd > start && before[end - 1] === after[afterEnd - 1]) {
    end--;
    afterEnd--;
  }
  return { start, end, inserted: afterEnd - start };
}

export function remapAnnotations(
  annotations: SequenceAnnotation[],
  before: string,
  after: string,
  hint?: EditRange,
): SequenceAnnotation[] {
  if (before === after) return annotations;
  const edit = locateEdit(before, after, hint);
  const delta = edit.inserted - (edit.end - edit.start);
  return annotations.map((a) => {
    if (a.start === null || a.end === null) return a;
    const left = a.start - 1,
      right = a.end;
    if (right <= edit.start) return a;
    if (left >= edit.end) return { ...a, start: a.start + delta, end: a.end + delta };
    const start = Math.min(left, edit.start);
    const end = right > edit.end ? right + delta : edit.start + edit.inserted;
    return {
      ...a,
      start: end > start ? start + 1 : null,
      end: end > start ? end : null,
      needsReview: true,
    };
  });
}

export function reverseAnnotations(annotations: SequenceAnnotation[], length: number) {
  return annotations.map((a) =>
    a.start === null || a.end === null
      ? a
      : {
          ...a,
          start: length - a.end + 1,
          end: length - a.start + 1,
          strand: a.strand === '+' ? ('-' as const) : a.strand === '-' ? ('+' as const) : a.strand,
        },
  );
}
