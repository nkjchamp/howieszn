import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '..');
const entry = resolve(root, 'scripts/preview.mjs');
const { Pool } = createRequire(resolve(root, 'apps/server/package.json'))('pg');
async function fixture() {
  const dir = await mkdtemp(resolve(tmpdir(), 'howieszn-preview-entry-'));
  const web = resolve(dir, 'web');
  await mkdir(web);
  await writeFile(resolve(web, 'index.html'), '<!doctype html><title>Protected fixture</title>');
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('PREVIEW_') || key.startsWith('RENDER_')) delete env[key];
  return { dir, env: { ...env, NODE_ENV: 'production', HOST: '127.0.0.1', DATABASE_URL: 'postgresql://fixture:unused@127.0.0.1:1/fixture', HOWIESZN_DB_SCHEMA: `preview_entry_${randomBytes(8).toString('hex')}`, HOWIESZN_DB_PATH: resolve(dir, 'legacy/league.sqlite'), PREVIEW_WEB_DIR: web, PREVIEW_USERNAME: 'preview' } };
}
async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
  child.kill('SIGTERM');
  try { await exited; } finally { clearTimeout(timer); }
}
async function launch(env, origin) {
  const child = spawn(process.execPath, [entry], { cwd: root, env, stdio: ['ignore', 'ignore', 'pipe'] });
  let errors = '';
  child.stderr.on('data', data => { errors += String(data); });
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Preview exited before listening: ${errors}`);
      try { const response = await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(300) }); if (response.ok) return child; } catch { /* Startup is not ready yet. */ }
      await delay(25);
    }
    throw new Error('Protected preview did not become ready.');
  } catch (error) { await stop(child); throw error; }
}

test('hosted launcher rejects invalid configuration before connecting and never falls back to SQLite', async () => {
  const { dir, env } = await fixture();
  const password = randomBytes(32).toString('base64url');
  try {
    const cases = [
      [{ DATABASE_URL: '' }, /DATABASE_URL/],
      [{ PREVIEW_ORIGIN: 'https://preview.example' }, /PREVIEW_PASSWORD/],
      [{ PREVIEW_ORIGIN: 'https://preview.example', PREVIEW_PASSWORD: 'too-short' }, /PREVIEW_PASSWORD/],
      [{ PREVIEW_PASSWORD: password }, /PREVIEW_ORIGIN/],
      [{ PREVIEW_ORIGIN: 'http://preview.example', PREVIEW_PASSWORD: password }, /require HTTPS/],
      [{ PREVIEW_ORIGIN: 'https://preview.example', PREVIEW_PASSWORD: password, PREVIEW_WEB_DIR: resolve(dir, 'missing') }, /built application/],
      [{ DATABASE_URL: 'postgresql://fixture:do-not-log-this-value@[invalid/fixture', PREVIEW_ORIGIN: 'https://preview.example', PREVIEW_PASSWORD: password }, /valid PostgreSQL/],
    ];
    for (const [extra, message] of cases) {
      const result = spawnSync(process.execPath, [entry], { cwd: root, env: { ...env, ...extra }, encoding: 'utf8', timeout: 5000 });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.match(result.stderr, message);
      assert.equal(result.stderr.includes('do-not-log-this-value'), false);
      assert.equal(existsSync(env.HOWIESZN_DB_PATH), false);
      assert.equal(existsSync(resolve(dir, 'legacy')), false);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('database initialization errors never print connection credentials', async () => {
  const { dir, env } = await fixture();
  const sensitive = randomBytes(24).toString('base64url');
  try {
    const result = spawnSync(process.execPath, [entry], { cwd: root, env: { ...env, DATABASE_URL: `postgresql://fixture:${sensitive}@127.0.0.1:1/fixture`, PREVIEW_ORIGIN: 'https://preview.example', PREVIEW_PASSWORD: randomBytes(32).toString('base64url') }, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Protected preview initialization failed/);
    assert.equal(result.stderr.includes(sensitive), false);
    assert.equal(result.stdout.includes(sensitive), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('actual PostgreSQL hosted launcher uses the host URL, protects the site, and retains accepted state across restart', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const { dir, env } = await fixture();
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const password = randomBytes(32).toString('base64url');
  const configured = { ...env, DATABASE_URL: process.env.TEST_DATABASE_URL, PORT: String(port), RENDER_EXTERNAL_URL: origin, PREVIEW_PASSWORD: password };
  const headers = { Authorization: `Basic ${Buffer.from(`preview:${password}`).toString('base64')}`, Origin: origin };
  let child;
  try {
    child = await launch(configured, origin);
    assert.deepEqual(await (await fetch(`${origin}/healthz`)).json(), { ok: true });
    const unauthorized = await fetch(origin);
    assert.equal(unauthorized.status, 401);
    assert.match(unauthorized.headers.get('www-authenticate'), /^Basic /);
    assert.equal(Object.hasOwn(await unauthorized.json(), 'state'), false);
    assert.match(await (await fetch(origin, { headers })).text(), /Protected fixture/);
    const before = await (await fetch(`${origin}/api/league`, { headers })).json();
    assert.equal(before.capabilities.storage, 'postgres');
    const accepted = await fetch(`${origin}/api/commands`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ commandId: randomUUID(), expectedRevision: before.state.revision, command: { type: 'league.rename', name: 'Hosted restart rehearsal' } }) });
    assert.equal(accepted.status, 200);
    const saved = await accepted.json();
    await stop(child);
    child = await launch(configured, origin);
    const restored = await (await fetch(`${origin}/api/league`, { headers })).json();
    assert.equal(restored.state.name, 'Hosted restart rehearsal');
    assert.equal(restored.state.revision, saved.state.revision);
  } finally {
    if (child) await stop(child);
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    try { await pool.query(`DROP SCHEMA IF EXISTS "${env.HOWIESZN_DB_SCHEMA}" CASCADE`); }
    finally { await pool.end(); await rm(dir, { recursive: true, force: true }); }
  }
});
