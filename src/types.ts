export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface SequenceRecord {
  id: string;
  projectId: string;
  name: string;
  sequence: string;
  topology: 'linear' | 'circular';
  notes: string;
  annotations: SequenceAnnotation[];
  createdAt: string;
  updatedAt: string;
}
export interface SequenceAnnotation {
  id: string;
  name: string;
  start: number | null;
  end: number | null;
  color: string;
  notes: string;
  needsReview: boolean;
}
export interface Primer {
  id: string;
  name: string;
  sequence: string;
  orientation: 'forward' | 'reverse' | 'other';
  notes: string;
  tags: string[];
  projectIds: string[];
  favorite: boolean;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}
export interface Settings {
  name: string;
  organization: string;
  theme: 'dark' | 'light' | 'system';
  basesPerLine: number;
  accent: 'mint' | 'blue' | 'violet' | 'amber';
  density: 'comfortable' | 'compact';
  sequenceFontSize: number;
  basePalette: 'classic' | 'contrast' | 'mono';
  groupBases: boolean;
  defaultSequenceView: 'edit' | 'colored';
}
export interface WorkspaceState {
  schemaVersion: 2;
  revision: number;
  projects: Project[];
  sequences: SequenceRecord[];
  primers: Primer[];
  settings: Settings;
}
export type Page = 'dashboard' | 'projects' | 'sequences' | 'primers' | 'oligo' | 'settings';
