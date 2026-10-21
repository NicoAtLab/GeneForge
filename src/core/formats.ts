import { MAX_SEQUENCE_LENGTH, normalizeSequence, validateSequence } from './sequence.ts';

export type FastaRecord = { name: string; sequence: string };
export type PrimerRecord = { name: string; sequence: string; notes: string; tags: string[] };
const MAX_FILE_CHARACTERS = 20_000_000;

function fileText(input: string): string {
  if (typeof input !== 'string') throw new TypeError('Le fichier doit contenir du texte.');
  if (input.length > MAX_FILE_CHARACTERS)
    throw new RangeError('Le fichier dépasse la limite de 20 millions de caractères.');
  return input.replace(/^\uFEFF/, '');
}

function recordName(input: string, context: string): string {
  if (typeof input !== 'string' || !input.trim()) throw new Error(`${context} : nom manquant.`);
  if (/[\u0000-\u001f\u007f]/.test(input))
    throw new Error(`${context} : le nom contient un caractère de contrôle.`);
  return input.trim();
}

function recordSequence(input: string, context: string): string {
  const sequence = normalizeSequence(input);
  if (!sequence.length) throw new Error(`${context} : séquence vide.`);
  const { invalid } = validateSequence(sequence);
  if (invalid.length) {
    const first = invalid[0];
    throw new Error(
      `${context} : caractère ADN invalide ${JSON.stringify(first.character)} en position ${first.position}.`,
    );
  }
  return sequence;
}

export function parseFasta(text: string): FastaRecord[] {
  const lines = fileText(text).split(/\r\n|\n|\r/);
  const records: FastaRecord[] = [];
  let name: string | null = null;
  let headerLine = 0;
  let chunks: string[] = [];
  let length = 0;
  const finish = () => {
    if (name === null) return;
    if (!length) throw new Error(`FASTA ligne ${headerLine} (${name}) : séquence vide.`);
    records.push({ name, sequence: chunks.join('') });
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (line.startsWith('>')) {
      finish();
      name = recordName(line.slice(1), `FASTA ligne ${index + 1}`);
      headerLine = index + 1;
      chunks = [];
      length = 0;
    } else {
      if (name === null)
        throw new Error(`FASTA ligne ${index + 1} : en-tête « >nom » attendu avant la séquence.`);
      const chunk = recordSequence(line, `FASTA ligne ${index + 1} (${name})`);
      length += chunk.length;
      if (length > MAX_SEQUENCE_LENGTH)
        throw new RangeError(
          `FASTA (${name}) : séquence supérieure à ${MAX_SEQUENCE_LENGTH} bases.`,
        );
      chunks.push(chunk);
    }
  }
  finish();
  if (!records.length) throw new Error('Le fichier ne contient aucun enregistrement FASTA.');
  return records;
}

export function exportFasta(records: FastaRecord[]): string {
  return records
    .map((record, index) => {
      const context = `FASTA enregistrement ${index + 1}`;
      const name = recordName(record.name, context);
      const sequence = recordSequence(record.sequence, context);
      const lines: string[] = [];
      for (let start = 0; start < sequence.length; start += 80)
        lines.push(sequence.slice(start, start + 80));
      return `>${name}\n${lines.join('\n')}\n`;
    })
    .join('');
}

type CsvRow = { cells: string[]; line: number };

/** RFC 4180-style comma CSV, with strict quote syntax and physical line errors. */
function csvRows(input: string): CsvRow[] {
  const text = fileText(input);
  const delimiter = text.split(/\r?\n/, 1)[0].includes('\t') ? '\t' : ',';
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let field = '';
  let state: 'start' | 'plain' | 'quoted' | 'closed' = 'start';
  let line = 1;
  let rowLine = 1;
  let hasContent = false;
  const endField = () => {
    cells.push(field);
    field = '';
    state = 'start';
  };
  const endRow = () => {
    endField();
    if (hasContent) rows.push({ cells, line: rowLine });
    cells = [];
    hasContent = false;
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (state === 'quoted') {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else state = 'closed';
      } else if (char === '\r' || char === '\n') {
        if (char === '\r' && text[index + 1] === '\n') {
          field += '\r\n';
          index += 1;
        } else field += char;
        line += 1;
      } else field += char;
      continue;
    }
    if (char === delimiter) {
      endField();
      hasContent = true;
      continue;
    }
    if (char === '\r' || char === '\n') {
      endRow();
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      line += 1;
      rowLine = line;
      continue;
    }
    if (state === 'closed')
      throw new Error(`CSV ligne ${line} : caractère inattendu après un guillemet fermant.`);
    if (char === '"') {
      if (state !== 'start')
        throw new Error(`CSV ligne ${line} : guillemet inattendu dans un champ non délimité.`);
      state = 'quoted';
    } else {
      field += char;
      state = 'plain';
    }
    hasContent = true;
  }
  if (state === 'quoted')
    throw new Error(`CSV ligne ${rowLine} : champ entre guillemets non fermé.`);
  if (hasContent || cells.length || field.length) endRow();
  return rows;
}

export function parsePrimerCsv(text: string): PrimerRecord[] {
  const rows = csvRows(text);
  if (!rows.length) throw new Error('Le fichier CSV est vide.');
  const headers = rows[0].cells.map((cell) => cell.trim().toLowerCase());
  const allowed = new Set(['name', 'sequence', 'notes', 'tags']);
  if (new Set(headers).size !== headers.length) throw new Error('CSV : en-têtes en double.');
  if (headers.some((header) => !allowed.has(header)))
    throw new Error('CSV : colonnes acceptées : name, sequence, notes, tags (séparateur virgule).');
  if (!headers.includes('name') || !headers.includes('sequence'))
    throw new Error('CSV : colonnes obligatoires name et sequence.');
  const column = (row: CsvRow, key: string) => {
    const index = headers.indexOf(key);
    return index === -1 ? '' : row.cells[index];
  };
  return rows.slice(1).map((row) => {
    const context = `CSV ligne ${row.line}`;
    if (row.cells.length !== headers.length)
      throw new Error(
        `${context} : ${headers.length} colonne(s) attendue(s), ${row.cells.length} reçue(s).`,
      );
    const notes = column(row, 'notes');
    if (notes.includes('\u0000'))
      throw new Error(`${context} : les notes contiennent un caractère nul.`);
    return {
      name: recordName(column(row, 'name'), context),
      sequence: recordSequence(column(row, 'sequence'), context),
      notes,
      tags: [
        ...new Set(
          column(row, 'tags')
            .split(';')
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ],
    };
  });
}

/** Prefix formula-like cells before CSV quoting to protect spreadsheet exports. */
function csvCell(value: string): string {
  const guarded = /^\s*[=+\-@]/u.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function exportPrimerCsv(
  records: { name: string; sequence: string; notes?: string; tags?: string[] }[],
): string {
  const rows = [['name', 'sequence', 'notes', 'tags']];
  for (const [index, record] of records.entries()) {
    const context = `CSV enregistrement ${index + 1}`;
    const name = recordName(record.name, context);
    const sequence = recordSequence(record.sequence, context);
    const notes = record.notes ?? '';
    if (typeof notes !== 'string' || notes.includes('\u0000'))
      throw new Error(`${context} : notes invalides.`);
    const tags = record.tags ?? [];
    if (
      !Array.isArray(tags) ||
      tags.some((tag) => typeof tag !== 'string' || /[;\u0000-\u001f\u007f]/.test(tag))
    ) {
      throw new Error(
        `${context} : les tags doivent être des textes sans point-virgule ni caractère de contrôle.`,
      );
    }
    rows.push([
      name,
      sequence,
      notes,
      tags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .join(';'),
    ]);
  }
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
