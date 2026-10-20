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
  createdAt: string;
  updatedAt: string;
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
}
export interface WorkspaceState {
  schemaVersion: 1;
  revision: number;
  projects: Project[];
  sequences: SequenceRecord[];
  primers: Primer[];
  settings: Settings;
}
export type Page = 'dashboard' | 'projects' | 'sequences' | 'primers' | 'oligo' | 'settings';
