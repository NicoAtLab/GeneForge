import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkspaceStore } from './storage.ts';
import {
  ApiError,
  makeBackup,
  MAX_REQUEST_BYTES,
  validateBackup,
  validateState,
} from './validation.ts';
import { analyze, engineHealth } from './primer3.ts';

export interface ServerOptions {
  dataDir?: string;
  staticDir?: string;
  allowedOrigins?: string[];
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

function securityHeaders(response: ServerResponse): void {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
}

function checkOrigin(request: IncomingMessage, options: ServerOptions): void {
  const port = request.socket.localPort;
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (port === 80) hosts.push('127.0.0.1', 'localhost');
  if (!request.headers.host || !hosts.includes(request.headers.host.toLowerCase()))
    throw new ApiError(403, 'HOST_REJECTED', 'Adresse locale requise.');
  const origin = request.headers.origin;
  const origins = [...hosts.map((host) => `http://${host}`), ...(options.allowedOrigins ?? [])];
  if (origin && !origins.includes(origin))
    throw new ApiError(403, 'ORIGIN_REJECTED', 'Origine de la requête non autorisée.');
  if (!origin && request.headers['sec-fetch-site'] === 'cross-site')
    throw new ApiError(403, 'ORIGIN_REJECTED', 'Origine de la requête non autorisée.');
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
  if (contentType !== 'application/json')
    throw new ApiError(415, 'JSON_REQUIRED', 'Le contenu doit être au format application/json.');
  if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity')
    throw new ApiError(415, 'ENCODING_UNSUPPORTED', 'Contenu compressé non accepté.');
  const contentLength = Number(request.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES)
    throw new ApiError(413, 'REQUEST_TOO_LARGE', 'Le fichier dépasse la limite de 16 Mo.');
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_REQUEST_BYTES)
      throw new ApiError(413, 'REQUEST_TOO_LARGE', 'Le fichier dépasse la limite de 16 Mo.');
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Le contenu JSON est invalide.');
  }
}

function isWithin(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function serveStatic(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  directory: string,
): void {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new ApiError(400, 'INVALID_PATH', 'Chemin invalide.');
  }
  if (
    decoded.includes('\0') ||
    decoded.includes('\\') ||
    decoded.split('/').some((part) => part === '..' || part.startsWith('.'))
  )
    throw new ApiError(404, 'NOT_FOUND', 'Ressource introuvable.');
  const root = resolve(directory);
  let filename = resolve(root, `.${decoded}`);
  if (!isWithin(root, filename)) throw new ApiError(404, 'NOT_FOUND', 'Ressource introuvable.');
  if (!existsSync(filename) || !statSync(filename).isFile()) {
    if (extname(decoded)) throw new ApiError(404, 'NOT_FOUND', 'Ressource introuvable.');
    filename = resolve(root, 'index.html');
  }
  if (!existsSync(filename) || !statSync(filename).isFile())
    throw new ApiError(
      503,
      'BUILD_REQUIRED',
      'Interface indisponible. Exécutez npm run build puis redémarrez GeneForge.',
    );
  if (!isWithin(realpathSync(root), realpathSync(filename)))
    throw new ApiError(404, 'NOT_FOUND', 'Ressource introuvable.');
  response.writeHead(200, {
    'Content-Type': MIME_TYPES[extname(filename)] ?? 'application/octet-stream',
    'Content-Length': statSync(filename).size,
    'Cache-Control': extname(filename) === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  const stream = createReadStream(filename);
  stream.on('error', () => response.destroy());
  stream.pipe(response);
}

export function createGeneForgeServer(options: ServerOptions = {}): {
  server: Server;
  store: WorkspaceStore;
  close: () => Promise<void>;
} {
  const store = new WorkspaceStore(
    options.dataDir ?? process.env.GENEFORGE_DATA_DIR ?? resolve('data'),
  );
  const staticDir = options.staticDir ?? resolve('dist');
  const runtimeOptions: ServerOptions = {
    ...options,
    allowedOrigins:
      options.allowedOrigins ??
      process.env.GENEFORGE_ALLOWED_ORIGINS?.split(',')
        .map((value) => value.trim())
        .filter(Boolean) ??
      [],
  };
  const server = createServer(async (request, response) => {
    securityHeaders(response);
    try {
      checkOrigin(request, runtimeOptions);
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const path = url.pathname;
      if (path === '/api/health' && request.method === 'GET') {
        const state = store.read();
        json(response, 200, {
          status: 'ok',
          schemaVersion: 2,
          revision: state.revision,
          counts: {
            projects: state.projects.length,
            sequences: state.sequences.length,
            primers: state.primers.length,
          },
          primer3: await engineHealth(),
        });
      } else if (path === '/api/state' && request.method === 'GET') {
        json(response, 200, store.read());
      } else if (path === '/api/state' && request.method === 'PUT') {
        json(response, 200, store.save(validateState(await readJson(request))));
      } else if (path === '/api/backup' && request.method === 'GET') {
        response.setHeader(
          'Content-Disposition',
          `attachment; filename="geneforge-${new Date().toISOString().slice(0, 10)}.geneforge.json"`,
        );
        json(response, 200, makeBackup(store.read()));
      } else if (path === '/api/restore' && request.method === 'POST') {
        json(response, 200, store.restore(validateBackup(await readJson(request))));
      } else if (path === '/api/analyze' && request.method === 'POST') {
        json(response, 200, await analyze(await readJson(request)));
      } else if (
        ['/api/health', '/api/state', '/api/backup', '/api/restore', '/api/analyze'].includes(path)
      ) {
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Méthode non autorisée.');
      } else if (path === '/api' || path.startsWith('/api/')) {
        throw new ApiError(404, 'NOT_FOUND', 'Route introuvable.');
      } else {
        serveStatic(request, response, path, staticDir);
      }
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      if (error instanceof ApiError)
        json(response, error.status, { error: { code: error.code, message: error.message } });
      else
        json(response, 500, {
          error: {
            code: 'INTERNAL_ERROR',
            message:
              'Impossible de terminer cette opération. Vos données existantes sont conservées.',
          },
        });
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.on('close', () => store.close());
  return {
    server,
    store,
    close: () =>
      new Promise((resolveClose, reject) => {
        if (!server.listening) {
          store.close();
          resolveClose();
          return;
        }
        server.close((error) => (error ? reject(error) : resolveClose()));
        server.closeIdleConnections();
      }),
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT doit être un entier compris entre 1 et 65535.');
  const app = createGeneForgeServer();
  app.server.on('error', () => {
    console.error('Impossible de démarrer GeneForge. Vérifiez que le port est disponible.');
    app.store.close();
    process.exitCode = 1;
  });
  app.server.listen(port, '127.0.0.1', () =>
    console.log(`GeneForge est disponible sur http://127.0.0.1:${port}`),
  );
  const shutdown = () => {
    void app.close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
