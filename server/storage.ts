import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorkspaceState } from '../src/types.ts';
import { ApiError, makeBackup, validateState } from './validation.ts';

export function emptyState(): WorkspaceState {
  return {
    schemaVersion: 1,
    revision: 0,
    projects: [],
    sequences: [],
    primers: [],
    settings: { name: '', organization: '', theme: 'dark', basesPerLine: 60 },
  };
}

export class WorkspaceStore {
  private readonly db: DatabaseSync;
  readonly dataDir: string;
  private closed = false;

  constructor(dataDir: string) {
    this.dataDir = resolve(dataDir);
    mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(this.dataDir, 'geneforge.sqlite'));
    try {
      this.db.exec(
        'PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;',
      );
      const version = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
      if (version.user_version > 1) throw new Error('Version de base de données incompatible.');
      if (version.user_version === 0) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
          this.db.exec(
            'CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL CHECK(revision >= 0), state_json TEXT NOT NULL, updated_at TEXT NOT NULL); PRAGMA user_version = 1;',
          );
          this.db
            .prepare(
              'INSERT OR IGNORE INTO workspace (id, revision, state_json, updated_at) VALUES (1, 0, ?, ?)',
            )
            .run(JSON.stringify(emptyState()), new Date().toISOString());
          this.db.exec('COMMIT');
        } catch (error) {
          this.db.exec('ROLLBACK');
          throw error;
        }
      }
      this.read(); // Fail closed if persisted data is inconsistent.
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  read(): WorkspaceState {
    const row = this.db.prepare('SELECT revision, state_json FROM workspace WHERE id = 1').get() as
      | { revision: number; state_json: string }
      | undefined;
    if (!row) throw new Error('Espace de travail introuvable.');
    const state = validateState(JSON.parse(row.state_json));
    if (state.revision !== row.revision)
      throw new Error('Révision de base de données incohérente.');
    return state;
  }

  save(input: WorkspaceState): WorkspaceState {
    const state = validateState(input);
    return this.replace(state, false);
  }

  restore(input: WorkspaceState): WorkspaceState {
    const state = validateState(input);
    return this.replace(state, true);
  }

  private replace(state: WorkspaceState, restore: boolean): WorkspaceState {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.read();
      if (!restore && state.revision !== previous.revision)
        throw new ApiError(
          409,
          'REVISION_CONFLICT',
          'Cet espace a été modifié dans une autre fenêtre. Rechargez avant de réessayer.',
        );
      if (previous.revision >= Number.MAX_SAFE_INTEGER - 1)
        throw new ApiError(409, 'REVISION_LIMIT', 'La limite de révision est atteinte.');
      if (restore) this.backupBeforeRestore(previous);
      const next = { ...state, revision: previous.revision + 1 };
      this.db
        .prepare('UPDATE workspace SET revision = ?, state_json = ?, updated_at = ? WHERE id = 1')
        .run(next.revision, JSON.stringify(next), new Date().toISOString());
      this.db.exec('COMMIT');
      return next;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private backupBeforeRestore(state: WorkspaceState): void {
    const directory = join(this.dataDir, 'backups');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const filename = `before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.geneforge.json`;
    const destination = join(directory, filename);
    const temporary = `${destination}.tmp`;
    writeFileSync(temporary, JSON.stringify(makeBackup(state), null, 2), {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    renameSync(temporary, destination);
  }

  close(): void {
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
  }
}
