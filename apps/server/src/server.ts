import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import { DomainError } from '@howieszn/domain';
import type { LeagueState } from '@howieszn/domain';
import { LeagueStore } from './store.ts';
import { RequestError, validateCommandRequest } from './validation.ts';
import { preparePreview, previewPath, PREVIEW_CHALLENGE } from './preview.ts';
import type { PreviewOptions } from './preview.ts';
import type { LeagueStorage } from './storage.ts';
export type { PreviewOptions } from './preview.ts';
export type { LeagueStorage } from './storage.ts';
export { preparePreview } from './preview.ts';

const MAX_BODY = 256 * 1024;
function loopbackOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try { const url = new URL(origin); return ['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname); }
  catch { return false; }
}
function cursor(value: string | null): number {
  if (value === null) return 0;
  if (value === '-1') return -1;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new RequestError(400, 'INVALID_CURSOR', 'since must be a nonnegative revision.');
  return Number(value);
}
function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(status === 413 || status === 401 ? { Connection: 'close' } : {}) });
  response.end(JSON.stringify(body));
}
async function readJson(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new RequestError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json for commands.');
  if (Number(request.headers['content-length'] ?? 0) > MAX_BODY) { request.resume(); throw new RequestError(413, 'BODY_TOO_LARGE', 'Command body exceeds 256 KiB.'); }
  return new Promise((resolve, reject) => {
    let length = 0, finished = false;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      if (finished) return;
      length += chunk.length;
      if (length > MAX_BODY) { finished = true; chunks.length = 0; reject(new RequestError(413, 'BODY_TOO_LARGE', 'Command body exceeds 256 KiB.')); return; }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (finished) return;
      finished = true;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new RequestError(400, 'INVALID_JSON', 'The command body must be valid JSON.')); }
    });
    request.on('error', error => { if (!finished) { finished = true; reject(error); } });
    request.on('aborted', () => { if (!finished) { finished = true; reject(new RequestError(400, 'REQUEST_ABORTED', 'The command was interrupted.')); } });
  });
}

export interface ServerOptions { dbPath?: string; store?: LeagueStorage; port?: number; host?: string; now?: () => number; seed?: LeagueState; preview?: PreviewOptions }
export interface ServerApplication<Storage extends LeagueStorage = LeagueStorage> {
  server: Server;
  store: Storage;
  address(): AddressInfo | null;
  listen(): Promise<AddressInfo>;
  close(): Promise<void>;
}

function rejectUpgrade(socket: Duplex, status: 400 | 401 | 403): void {
  const label = status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : 'Bad Request';
  socket.end(`HTTP/1.1 ${status} ${label}\r\n${status === 401 ? `WWW-Authenticate: ${PREVIEW_CHALLENGE}\r\n` : ''}Connection: close\r\nContent-Length: 0\r\n\r\n`);
}

export function createServer(options: ServerOptions & { dbPath: string; store?: undefined }): ServerApplication<LeagueStore>;
export function createServer<Storage extends LeagueStorage>(options: ServerOptions & { store: Storage }): ServerApplication<Storage>;
export function createServer(options: ServerOptions): ServerApplication {
  const preview = options.preview === undefined ? null : preparePreview(options.preview);
  if (!options.store && !options.dbPath) throw new Error('A database path or initialized league store is required.');
  const store: LeagueStorage = options.store ?? new LeagueStore(options.dbPath!, { now: options.now, seed: options.seed });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  let closing = false;
  let closePromise: Promise<void> | undefined;
  const socketViews = new WeakMap<WebSocket, { ready: boolean; latestRevision: number }>();
  const pendingSnapshots = new Set<Promise<void>>();
  function notifyChanged(client: WebSocket, revision: number): void {
    if (client.readyState !== WebSocket.OPEN) return;
    const view = socketViews.get(client);
    if (!view?.ready) {
      if (view) view.latestRevision = Math.max(view.latestRevision, revision);
      return;
    }
    client.send(JSON.stringify({ type: 'changed', revision }), error => { if (error) client.terminate(); });
  }
  async function initializeSocket(client: WebSocket, since: number): Promise<void> {
    try {
      // A change committed while these reads are pending is retained separately
      // and sent after the initial snapshot, so a slow read cannot hide it.
      const events = await store.events(since);
      const envelope = await store.envelope();
      if (closing || client.readyState !== WebSocket.OPEN) return;
      if (since < envelope.state.revision) client.send(JSON.stringify({ type: 'events', ...events }));
      client.send(JSON.stringify({ type: 'snapshot', ...envelope }));
      const view = socketViews.get(client)!;
      view.ready = true;
      if (view.latestRevision > envelope.state.revision) notifyChanged(client, view.latestRevision);
    } catch {
      // Database errors are deliberately not serialized into transport frames.
      if (client.readyState === WebSocket.OPEN) client.close(1011, 'The league snapshot is temporarily unavailable.');
    }
  }
  const server = createHttpServer(async (request, response) => {
    let allowLeagueEnvelope = preview === null;
    try {
      const target = request.url ?? '/';
      if (preview && target.split('?')[0] === '/healthz' && (request.method === 'GET' || request.method === 'HEAD')) { json(response, 200, { ok: true }); return; }
      if (preview) {
        response.setHeader('Vary', 'Authorization, Origin');
        if (!preview.authenticated(request)) {
          request.resume();
          response.setHeader('WWW-Authenticate', PREVIEW_CHALLENGE);
          json(response, 401, { error: { code: 'PREVIEW_AUTH_REQUIRED', message: 'Preview access requires valid credentials.', details: {} } }); return;
        }
      }
      const url = new URL(target, 'http://localhost');
      const pathname = preview ? previewPath(target) : url.pathname;
      const origin = request.headers.origin;
      if (!(preview ? preview.allowsOrigin(origin) : loopbackOrigin(origin))) throw new RequestError(403, 'ORIGIN_NOT_ALLOWED', preview ? 'This origin is not allowed for the protected preview.' : 'The local preview API accepts only loopback browser origins.');
      if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', preview ? 'Authorization, Origin' : 'Origin'); }
      allowLeagueEnvelope = true;
      if (request.method === 'OPTIONS') {
        response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS', 'Access-Control-Allow-Headers': preview ? 'Content-Type, Authorization' : 'Content-Type', 'Access-Control-Max-Age': '600' }); response.end(); return;
      }
      if (request.method === 'GET' && pathname === '/api/health') { json(response, 200, { ok: true, mode: preview ? 'protected-fixture-preview' : 'local-fixture', viewerId: 'alex', authentication: preview ? 'shared-http-basic-preview-gate' : 'fixed-local-preview-identity', liveProvider: false }); return; }
      if (request.method === 'GET' && pathname === '/api/league') { json(response, 200, await store.envelope()); return; }
      if (request.method === 'GET' && pathname === '/api/events') { json(response, 200, await store.events(cursor(url.searchParams.get('since')))); return; }
      if (request.method === 'POST' && pathname === '/api/commands') {
        const input = validateCommandRequest(await readJson(request));
        const result = await store.command(input);
        json(response, 200, result.envelope);
        if (result.changed) {
          for (const socket of sockets.clients) notifyChanged(socket, result.envelope.state.revision);
        }
        return;
      }
      if (preview && await preview.serve(request, response, pathname)) return;
      throw new RequestError(404, 'NOT_FOUND', 'Unknown local API route.');
    } catch (error) {
      if (response.destroyed || response.writableEnded) return;
      const known = error instanceof RequestError || error instanceof DomainError;
      const code = known ? error.code : 'INTERNAL_ERROR';
      const status = error instanceof RequestError ? error.status : error instanceof DomainError ? (/FORBIDDEN|UNAUTHORIZED|NOT_OWNER|PERMISSION/.test(code) ? 403 : 400) : 500;
      const message = known ? error.message : 'The local server could not complete the action.';
      let envelope: Record<string, unknown> = {};
      if (allowLeagueEnvelope && request.method === 'POST' && request.url?.startsWith('/api/commands') && status !== 413) {
        try { envelope = await store.envelope() as unknown as Record<string, unknown>; } catch { /* Preserve the original safe error. */ }
      }
      json(response, status, { ...envelope, error: { code, message, details: known ? error.details : {} } });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.on('upgrade', (request, socket, head) => {
    socket.on('error', () => { /* Rejected/incomplete preview handshakes must not crash the service. */ });
    try {
      if (closing) { socket.destroy(); return; }
      if (preview && !preview.authenticated(request)) { rejectUpgrade(socket, 401); return; }
      const target = request.url ?? '/';
      const url = new URL(target, 'http://localhost');
      const pathname = preview ? previewPath(target) : url.pathname;
      if (pathname !== '/events' || !(preview ? preview.allowsOrigin(request.headers.origin) : loopbackOrigin(request.headers.origin))) {
        rejectUpgrade(socket, 403); return;
      }
      const since = cursor(url.searchParams.get('since'));
      sockets.handleUpgrade(request, socket, head, client => {
        client.on('error', () => { /* Transport errors trigger client snapshot recovery. */ });
        socketViews.set(client, { ready: false, latestRevision: 0 });
        const pending = initializeSocket(client, since);
        pendingSnapshots.add(pending);
        void pending.finally(() => pendingSnapshots.delete(pending));
        sockets.emit('connection', client, request);
      });
    } catch { rejectUpgrade(socket, 400); }
  });
  return {
    server, store,
    address(): AddressInfo | null { return server.address() as AddressInfo | null; },
    async listen(): Promise<AddressInfo> {
      if (closing) throw new Error('The server is closing.');
      // A hosted listener must not advertise readiness while storage is down.
      await store.load();
      if (closing) throw new Error('The server is closing.');
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port ?? 4000, options.host ?? '127.0.0.1', () => { server.off('error', reject); resolve(); });
      });
      return server.address() as AddressInfo;
    },
    async close(): Promise<void> {
      closePromise ??= (async () => {
        closing = true;
        for (const socket of sockets.clients) socket.terminate();
        await new Promise<void>(resolve => sockets.close(() => resolve()));
        if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        await Promise.allSettled(pendingSnapshots);
        await store.close();
      })();
      await closePromise;
    },
  };
}
