import type { Settings } from './types.ts';

export const displayDefaults = {
  accent: 'mint',
  density: 'comfortable',
  sequenceFontSize: 14,
  basePalette: 'classic',
  groupBases: true,
  defaultSequenceView: 'edit',
} as const satisfies Partial<Settings>;

export const highlightColors = [
  { value: '#f4ca64', label: 'Jaune' },
  { value: '#7ed6a5', label: 'Vert' },
  { value: '#79bdfa', label: 'Bleu' },
  { value: '#c4a2ef', label: 'Violet' },
  { value: '#f5a4bb', label: 'Rose' },
  { value: '#f1a56b', label: 'Orange' },
];
