import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createServer } from '../src/server.ts';
import type { PreviewOptions } from '../src/server.ts';

const PUBLIC_ORIGIN = 'https://preview.example.test';
const HTML = '<!doctype html><html><body><h1>Protected fixture app</h1><script type="module" src="/assets/app-a1b2c3d4.js"></script></body></html>';
const JAVASCRIPT = 'document.body.dataset.ready = "true";';
const SECRET = 'private file must never be served';

async function staticFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'howieszn-preview-'));
  const dist = join(dir, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  await mkdir(join(dist, '.hidden'), { recursive: true });
  await writeFile(join(dist, 'index.html'), HTML);
  await writeFile(join(dist, 'assets', 'app-a1b2c3d4.js'), JAVASCRIPT);
  await writeFile(join(dist, 'assets', 'main.css'), 'body{color:green}');
  await writeFile(join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  await writeFile(join(dist, '.env'), SECRET);
  await writeFile(join(dist, 'credentials.json'), SECRET);
  await writeFile(join(dist, 'assets', 'secret.json'), SECRET);
  await writeFile(join(dist, 'assets', 'app.js.map'), SECRET);
  await writeFile(join(dist, '.hidden', 'hidden.js'), SECRET);
  const outside = join(dir, 'outside.js');
  await writeFile(outside, SECRET);
  await symlink(outside, join(dist, 'assets', 'escape-a1b2c3d4.js'));
  await symlink(join(dist, '.hidden', 'hidden.js'), join(dist, 'assets', 'alias-a1b2c3d4.js'));
  const preview: PreviewOptions = { username: 'preview', password: randomBytes(32).toString('base64url'), allowedOrigins: [PUBLIC_ORIGIN], staticDir: dist };
  return { dir, dist, preview };
}
async function previewFixture() {
  const files = await staticFixture();
  const app = createServer({ dbPath: join(files.dir, 'data', 'league.sqlite'), host: '127.0.0.1', port: 0, preview: files.preview });
  const address = await app.listen();
  const base = `http://127.0.0.1:${address.port}`;
  const authorization = 'Basic ' + Buffer.from(`${files.preview.username}:${files.preview.password}`, 'utf8').toString('base64');
  return { ...files, ...app, base, authorization, async cleanup() { await app.close(); await rm(files.dir, { recursive: true, force: true }); } };
}
function raw(base: string, path: string, authorization: string): Promise<{ status: number; body: string }> {
  const url = new URL(base);
  return new Promise((resolve, reject) => {
    const req = request({ hostname: url.hostname, port: url.port, method: 'GET', path, headers: { Authorization: authorization, Accept: 'text/html' } }, response => {
      let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; }); response.on('end', () => resolve({ status: response.statusCode!, body }));
    });
    req.on('error', reject); req.end();
  });
}
function rejectedSocket(url: string, headers: Record<string, string> = {}): Promise<{ status: number; challenge: string | undefined }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers });
    const timer = setTimeout(() => { socket.terminate(); reject(new Error('Rejected WebSocket handshake did not finish.')); }, 3000);
    socket.on('error', () => { /* Expected for deliberately rejected handshakes. */ });
    socket.on('open', () => { clearTimeout(timer); socket.terminate(); reject(new Error('A protected WebSocket unexpectedly opened.')); });
    socket.on('unexpected-response', (req, response) => {
      clearTimeout(timer); response.resume();
      resolve({ status: response.statusCode!, challenge: response.headers['www-authenticate'] }); req.destroy();
    });
  });
}
function snapshotSocket(url: string, headers: Record<string, string>): Promise<{ socket: WebSocket; frame: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers });
    const timer = setTimeout(() => { socket.terminate(); reject(new Error('Protected WebSocket snapshot did not arrive.')); }, 3000);
    socket.on('error', error => { clearTimeout(timer); reject(error); });
    socket.on('message', data => { const frame = JSON.parse(String(data)) as Record<string, unknown>; if (frame.type === 'snapshot') { clearTimeout(timer); resolve({ socket, frame }); } });
  });
}

test('invalid or missing preview configuration fails before opening the database', async () => {
  const files = await staticFixture();
  try {
    const variations = [
      { password: undefined }, { password: 'short' }, { password: ' '.repeat(40) }, { password: 'a'.repeat(32) + '\n' },
      { username: 'bad:name' }, { allowedOrigins: [] }, { allowedOrigins: ['*'] }, { allowedOrigins: ['https://preview.example.test/'] },
      { allowedOrigins: ['http://public.example.test'] }, { allowedOrigins: ['https://user:password@preview.example.test'] }, { staticDir: join(files.dir, 'missing') },
    ];
    for (const [index, variation] of variations.entries()) {
      const path = join(files.dir, `must-not-open-${index}`, 'league.sqlite');
      assert.throws(() => createServer({ dbPath: path, preview: { ...files.preview, ...variation } as PreviewOptions }));
      assert.equal(existsSync(path), false);
      assert.equal(existsSync(join(files.dir, `must-not-open-${index}`)), false);
    }
    const unsafe = join(files.dir, 'unsafe-index'); await mkdir(unsafe);
    await symlink(join(files.dir, 'outside.js'), join(unsafe, 'index.html'));
    assert.throws(() => createServer({ dbPath: join(files.dir, 'unsafe-db.sqlite'), preview: { ...files.preview, staticDir: unsafe } }));
    assert.equal(existsSync(join(files.dir, 'unsafe-db.sqlite')), false);
  } finally { await rm(files.dir, { recursive: true, force: true }); }
});

test('only the minimal health probe is public; failures do not reveal league data', async () => {
  const app = await previewFixture();
  try {
    const health = await fetch(`${app.base}/healthz`);
    assert.equal(health.status, 200); assert.deepEqual(await health.json(), { ok: true });
    const head = await fetch(`${app.base}/healthz`, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
    for (const path of ['/', '/index.html', '/assets/app-a1b2c3d4.js', '/api/health', '/api/league', '/api/events', '/missing', '/healthz/../api/league']) {
      const response = await fetch(app.base + path);
      assert.equal(response.status, 401, path); assert.match(response.headers.get('www-authenticate')!, /^Basic /);
      const body = await response.json() as Record<string, unknown>;
      assert.equal(body.state, undefined); assert.equal(body.viewerId, undefined);
      assert.equal(JSON.stringify(body).includes('Fourth & Friends'), false);
    }
    for (const authorization of ['Bearer unrelated', 'Basic !!!', 'Basic ' + Buffer.from('preview:incorrect-password').toString('base64')]) {
      const response = await fetch(`${app.base}/api/league`, { headers: { Authorization: authorization } }); assert.equal(response.status, 401);
      assert.equal((await response.json() as Record<string, unknown>).state, undefined);
    }
    const before = app.store.load();
    const write = await fetch(`${app.base}/api/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commandId: 'unauthenticated', expectedRevision: before.revision, command: { type: 'league.rename', name: 'Unauthorized' } }) });
    assert.equal(write.status, 401); assert.equal((await write.json() as Record<string, unknown>).state, undefined);
    const malformed = await fetch(`${app.base}/api/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
    assert.equal(malformed.status, 401); assert.equal((await malformed.json() as Record<string, unknown>).state, undefined);
    assert.equal((await fetch(`${app.base}/healthz`, { method: 'POST' })).status, 401);
    assert.equal(app.store.load().revision, before.revision);
  } finally { await app.cleanup(); }
});

test('authenticated read/write works with exact origins and does not trust forwarded host headers', async () => {
  const app = await previewFixture();
  try {
    const headers = { Authorization: app.authorization, Origin: PUBLIC_ORIGIN };
    const response = await fetch(`${app.base}/api/league`, { headers });
    assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), PUBLIC_ORIGIN);
    assert.match(response.headers.get('vary')!, /Authorization/);
    const initial = await response.json() as { state: { revision: number } };
    const write = await fetch(`${app.base}/api/commands`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ commandId: 'protected-rename', expectedRevision: initial.state.revision, command: { type: 'league.rename', name: 'Protected league' } }) });
    assert.equal(write.status, 200); assert.equal((await write.json() as { state: { name: string } }).state.name, 'Protected league');
    for (const origin of ['https://preview.example.test.evil', 'https://preview.example.test:444', 'https://preview.example.test/', 'null', 'http://localhost:5173']) {
      const blocked = await fetch(`${app.base}/api/commands`, { method: 'POST', headers: { Authorization: app.authorization, Origin: origin, 'X-Forwarded-Host': 'preview.example.test', 'X-Forwarded-Proto': 'https', 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(blocked.status, 403, origin); assert.equal((await blocked.json() as Record<string, unknown>).state, undefined);
    }
    const native = await fetch(`${app.base}/api/league`, { headers: { Authorization: app.authorization } });
    assert.equal(native.status, 200, 'Authenticated native requests may omit Origin.');
    const preflight = await fetch(`${app.base}/api/commands`, { method: 'OPTIONS', headers });
    assert.equal(preflight.status, 204); assert.match(preflight.headers.get('access-control-allow-headers')!, /Authorization/);
  } finally { await app.cleanup(); }
});

test('static assets have safe MIME/cache behavior and SPA fallback is restricted to HTML routes', async () => {
  const app = await previewFixture();
  try {
    const headers = { Authorization: app.authorization };
    const index = await fetch(`${app.base}/`, { headers }); assert.equal(index.status, 200); assert.equal(await index.text(), HTML); assert.equal(index.headers.get('cache-control'), 'no-store');
    const asset = await fetch(`${app.base}/assets/app-a1b2c3d4.js`, { headers });
    assert.equal(asset.status, 200); assert.equal(await asset.text(), JAVASCRIPT); assert.match(asset.headers.get('content-type')!, /application\/javascript/);
    assert.match(asset.headers.get('cache-control')!, /private.*immutable/); assert.equal(asset.headers.get('x-content-type-options'), 'nosniff');
    const head = await fetch(`${app.base}/assets/app-a1b2c3d4.js`, { method: 'HEAD', headers });
    assert.equal(head.status, 200); assert.equal(await head.text(), ''); assert.equal(Number(head.headers.get('content-length')), Buffer.byteLength(JAVASCRIPT));
    const css = await fetch(`${app.base}/assets/main.css`, { headers }); assert.equal(css.status, 200); assert.doesNotMatch(css.headers.get('cache-control')!, /immutable/);
    const route = await fetch(`${app.base}/league/draft`, { headers: { ...headers, Accept: 'text/html' } }); assert.equal(route.status, 200); assert.equal(await route.text(), HTML);
    const jsonRoute = await fetch(`${app.base}/league/draft`, { headers: { ...headers, Accept: 'application/json' } }); assert.equal(jsonRoute.status, 404);
    const rejectedHtml = await fetch(`${app.base}/league/draft`, { headers: { ...headers, Accept: 'text/html;q=0, application/json' } }); assert.equal(rejectedHtml.status, 404);
    for (const path of ['/api/unknown', '/assets/missing.js', '/unknown.js', '/credentials.json', '/assets/secret.json', '/assets/app.js.map', '/assets/escape-a1b2c3d4.js', '/assets/alias-a1b2c3d4.js', '/.env', '/assets/%2eenv', '/.git/config']) {
      const response = await fetch(app.base + path, { headers: { ...headers, Accept: 'text/html' } }); assert.equal(response.status, 404, path);
      const body = await response.text(); assert.equal(body.includes(SECRET), false); assert.equal(body.includes('<html>'), false);
    }
  } finally { await app.cleanup(); }
});

test('raw and encoded traversal cannot escape the static directory or become SPA HTML', async () => {
  const app = await previewFixture();
  try {
    for (const path of ['/../outside.js', '/assets/../../outside.js', '/%2e%2e/outside.js', '/assets/%2e%2e/%2e%2e/outside.js', '/assets/%252e%252e/outside.js', '/assets%5c..%5coutside.js', '/assets/%00secret.js', '/%zz', '//evil.example/path', 'http://evil.example/assets/app-a1b2c3d4.js']) {
      const response = await raw(app.base, path, app.authorization);
      assert.equal(response.status, 400, path); assert.equal(response.body.includes(SECRET), false); assert.equal(response.body.includes('<html>'), false);
    }
  } finally { await app.cleanup(); }
});

test('WebSocket handshakes require credentials and an exact allowed browser origin', async () => {
  const app = await previewFixture();
  try {
    const endpoint = app.base.replace('http:', 'ws:') + '/events?since=-1';
    const unauthenticated = await rejectedSocket(endpoint, { Origin: PUBLIC_ORIGIN });
    assert.equal(unauthenticated.status, 401); assert.match(unauthenticated.challenge!, /^Basic /);
    const wrong = await rejectedSocket(endpoint, { Origin: PUBLIC_ORIGIN, Authorization: 'Basic ' + Buffer.from('preview:incorrect').toString('base64') });
    assert.equal(wrong.status, 401);
    const badOrigin = await rejectedSocket(endpoint, { Origin: 'https://untrusted.example', Authorization: app.authorization, 'X-Forwarded-Host': 'preview.example.test' });
    assert.equal(badOrigin.status, 403);
    const valid = await snapshotSocket(endpoint, { Origin: PUBLIC_ORIGIN, Authorization: app.authorization });
    assert.equal(valid.frame.type, 'snapshot'); assert.ok(valid.frame.state); valid.socket.terminate();
    const native = await snapshotSocket(endpoint, { Authorization: app.authorization });
    assert.equal(native.frame.type, 'snapshot'); native.socket.terminate();
  } finally { await app.cleanup(); }
});
