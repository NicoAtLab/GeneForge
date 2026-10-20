import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError } from './validation.ts';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundledPython = join(
  homedir(),
  '.cache',
  'codex-runtimes',
  'codex-primary-runtime',
  'dependencies',
  'python',
  process.platform === 'win32' ? 'python.exe' : 'bin/python3',
);
const python =
  process.env.GENEFORGE_PYTHON ??
  (existsSync(bundledPython)
    ? bundledPython
    : process.platform === 'win32'
      ? 'python.exe'
      : 'python3');
const environment = {
  ...process.env,
  PYTHONPATH: join(workspaceRoot, '.python-deps'),
  PYTHONDONTWRITEBYTECODE: '1',
};
let activeChildren = 0;

export interface AnalysisParameters {
  sequence: string;
  mv_conc: number;
  dv_conc: number;
  dntp_conc: number;
  dna_conc: number;
}

export function validateAnalysis(value: unknown): AnalysisParameters {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ApiError(400, 'INVALID_ANALYSIS', 'Paramètres d’analyse invalides.');
  const input = value as Record<string, unknown>;
  const keys = ['sequence', 'mv_conc', 'dv_conc', 'dntp_conc', 'dna_conc'];
  if (Object.keys(input).length !== keys.length || keys.some((key) => !Object.hasOwn(input, key)))
    throw new ApiError(400, 'INVALID_ANALYSIS', 'Les cinq paramètres d’analyse sont requis.');
  if (
    typeof input.sequence !== 'string' ||
    input.sequence.length > 2_000 ||
    !/^[ACGTacgt\s]+$/.test(input.sequence)
  )
    throw new ApiError(
      400,
      'INVALID_ANALYSIS',
      'L’analyse thermodynamique requiert un ADN A/C/G/T de 2 à 60 bases.',
    );
  const sequence = input.sequence.replace(/\s/g, '').toUpperCase();
  if (sequence.length < 2 || sequence.length > 60)
    throw new ApiError(
      400,
      'INVALID_ANALYSIS',
      'L’analyse thermodynamique requiert un ADN A/C/G/T de 2 à 60 bases.',
    );
  for (const [key, maximum] of [
    ['mv_conc', 1_000],
    ['dv_conc', 100],
    ['dntp_conc', 100],
    ['dna_conc', 100_000],
  ] as const) {
    const number = input[key];
    if (
      typeof number !== 'number' ||
      !Number.isFinite(number) ||
      number < 0 ||
      number > maximum ||
      (key === 'dna_conc' && number === 0)
    )
      throw new ApiError(400, 'INVALID_ANALYSIS', `Concentration invalide : ${key}.`);
  }
  if (input.mv_conc === 0 && (input.dv_conc as number) <= (input.dntp_conc as number))
    throw new ApiError(
      400,
      'INVALID_ANALYSIS',
      'Une concentration effective en sels strictement positive est requise.',
    );
  return {
    sequence,
    mv_conc: input.mv_conc as number,
    dv_conc: input.dv_conc as number,
    dntp_conc: input.dntp_conc as number,
    dna_conc: input.dna_conc as number,
  };
}

function runPython(args: string[], input = ''): Promise<unknown> {
  if (activeChildren >= 2)
    return Promise.reject(
      new ApiError(429, 'ANALYSIS_BUSY', 'Le moteur est occupé. Réessayez dans quelques secondes.'),
    );
  activeChildren += 1;
  return new Promise((resolveResult, reject) => {
    const child = spawn(python, args, {
      cwd: workspaceRoot,
      env: environment,
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let completed = false;
    let stdout = '';
    let outputBytes = 0;
    const finish = (error?: ApiError, result?: unknown) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      activeChildren -= 1;
      if (error) {
        child.kill();
        reject(error);
      } else resolveResult(result);
    };
    const timer = setTimeout(
      () =>
        finish(
          new ApiError(504, 'ANALYSIS_TIMEOUT', 'Le moteur a dépassé le délai de dix secondes.'),
        ),
      10_000,
    );
    const receive = (data: Buffer, isStdout: boolean) => {
      outputBytes += data.length;
      if (outputBytes > 16_384) {
        finish(new ApiError(502, 'ANALYSIS_FAILED', 'Réponse du moteur invalide.'));
        return;
      }
      if (isStdout) stdout += data.toString('utf8');
    };
    child.stdout.on('data', (data: Buffer) => receive(data, true));
    child.stderr.on('data', (data: Buffer) => receive(data, false));
    child.on('error', () =>
      finish(
        new ApiError(
          503,
          'ENGINE_UNAVAILABLE',
          'Primer3 est indisponible. Installez les dépendances scientifiques locales.',
        ),
      ),
    );
    child.stdin.on('error', () => {
      /* Exit/error listeners own failure reporting. */
    });
    child.on('close', (code) => {
      if (completed) return;
      if (code !== 0) {
        finish(
          new ApiError(
            503,
            'ENGINE_UNAVAILABLE',
            'Le moteur Primer3 est indisponible ou a refusé ce calcul.',
          ),
        );
        return;
      }
      try {
        finish(undefined, JSON.parse(stdout));
      } catch {
        finish(new ApiError(502, 'ANALYSIS_FAILED', 'Réponse du moteur invalide.'));
      }
    });
    child.stdin.end(input);
  });
}

export async function analyze(input: unknown): Promise<unknown> {
  const parameters = validateAnalysis(input);
  const result = await runPython(
    [join(workspaceRoot, 'src', 'core', 'primer3_adapter.py')],
    JSON.stringify(parameters),
  );
  if (
    !result ||
    typeof result !== 'object' ||
    !('tm' in result) ||
    typeof result.tm !== 'number' ||
    !Number.isFinite(result.tm) ||
    !('engine' in result) ||
    result.engine !== 'primer3-py'
  )
    throw new ApiError(502, 'ANALYSIS_FAILED', 'Réponse du moteur invalide.');
  return result;
}

export interface EngineHealth {
  available: boolean;
  engine: 'primer3-py';
  version: string | null;
}
let healthCache: { checkedAt: number; value: EngineHealth } | undefined;
export async function engineHealth(): Promise<EngineHealth> {
  if (healthCache && Date.now() - healthCache.checkedAt < 30_000) return healthCache.value;
  let value: EngineHealth = { available: false, engine: 'primer3-py', version: null };
  try {
    const probe = await runPython([
      '-c',
      'import json,primer3; print(json.dumps({"version":primer3.__version__}))',
    ]);
    if (
      existsSync(join(workspaceRoot, 'src', 'core', 'primer3_adapter.py')) &&
      probe &&
      typeof probe === 'object' &&
      'version' in probe &&
      typeof probe.version === 'string'
    )
      value = { available: true, engine: 'primer3-py', version: probe.version };
  } catch {
    /* Missing scientific runtime must not prevent local data management. */
  }
  healthCache = { checkedAt: Date.now(), value };
  return value;
}
