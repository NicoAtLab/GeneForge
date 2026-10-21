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
  annotationSources: AnnotationSource[];
  sourceFile: string | null;
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
  role: 'region' | 'up' | 'down' | 'primer' | 'fragment';
  strand: '+' | '-' | 'both' | null;
  sourceId: string | null;
}
export interface AnnotationSource {
  id: string;
  kind: 'sequence' | 'primer';
  recordId: string;
  name: string;
  fileName: string | null;
  sequence: string;
  notes: string;
  capturedAt: string;
}
export interface Primer {
  id: string;
  name: string;
  sequence: string;
  orientation: 'forward' | 'reverse' | 'other';
  notes: string;
  sourceFile: string | null;
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
  schemaVersion: 4;
  revision: number;
  projects: Project[];
  sequences: SequenceRecord[];
  primers: Primer[];
  notes: WorkNote[];
  gels: GelRecord[];
  settings: Settings;
}
export interface WorkNote {
  id: string;
  name: string;
  projectId: string | null;
  body: string;
  elabUrl: string;
  fileReferences: string;
  gelIds: string[];
  createdAt: string;
  updatedAt: string;
}
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface GelImage {
  dataUrl: string;
  fileName: string;
  width: number;
  height: number;
  sha256: string;
}
export interface GelPrimer {
  recordId: string;
  name: string;
  sequence: string;
  orientation: Primer['orientation'];
  notes: string;
  sourceFile: string | null;
  capturedAt: string;
}
export interface GelLane {
  id: string;
  label: string;
  description: string;
  primers: GelPrimer[];
}
export interface GelBand extends PixelRect {
  id: string;
  laneId: string;
  label: string;
  color: string;
}
export interface GelRecord {
  id: string;
  name: string;
  projectId: string | null;
  notes: string;
  elabUrl: string;
  image: GelImage;
  crop: PixelRect;
  lanes: GelLane[];
  bands: GelBand[];
  polarity: 'dark' | 'light';
  figureBackground: 'black' | 'white';
  createdAt: string;
  updatedAt: string;
}
export type Page =
  | 'dashboard'
  | 'projects'
  | 'sequences'
  | 'primers'
  | 'oligo'
  | 'notes'
  | 'gels'
  | 'assistant'
  | 'settings';
