import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Pool } from 'pg';
import { WebSocket } from 'ws';
import { createFixtureLeague } from '@howieszn/domain';
import { createServer, preparePreview } from '../src/server.ts';
import type { PreviewOptions, ServerApplication } from '../src/server.ts';
import { PostgresLeagueStore } from '../src/postgres-store.ts';
import type { CommandEnvelope, LeagueEnvelope, PublicEvent } from '../src/store.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
const options = { skip: !databaseUrl ? 'Set TEST_DATABASE_URL to run the real PostgreSQL HTTP/WebSocket integration test.' : false };
const ORIGIN = 'https://preview.example.test';
type Body = CommandEnvelope & { error?: { code: string; message: string } };
type Frame = { type: string; state?: LeagueEnvelope['state']; revision?: number; events?: PublicEvent[] };

function connection(endpoint: string, authorization: string) {
  const socket = new WebSocket(endpoint, { headers: { Authorization: authorization, Origin: ORIGIN } });
  const frames: Frame[] = [];
  const listeners = new Set<(frame: Frame) => void>();
  socket.on('error', () => {});
  socket.on('message', value => {
    const frame = JSON.parse(String(value)) as Frame;
    frames.push(frame);
    for (const listener of listeners) listener(frame);
  });
  return {
    socket,
    next(predicate: (frame: Frame) => boolean): Promise<Frame> {
      const frame = frames.find(predicate);
      if (frame) return Promise.resolve(frame);
      return new Promise((resolve, reject) => {
        const listener = (value: Frame) => { if (predicate(value)) { clearTimeout(timer); listeners.delete(listener); resolve(value); } };
        const timer = setTimeout(() => { listeners.delete(listener); reject(new Error('PostgreSQL WebSocket frame did not arrive.')); }, 5000);
        listeners.add(listener);
      });
    },
    async close() { const closed = once(socket, 'close'); socket.close(); await closed; },
  };
}

test('PostgreSQL HTTP/WS: protected writes, reconnects and restart preserve committed public state', options, async () => {
  assert.ok(databaseUrl);
  const schema = `howieszn_api_${randomUUID().replaceAll('-', '')}`;
  const quoted = `"${schema}"`;
  const directory = await mkdtemp(join(tmpdir(), 'howieszn-pg-api-'));
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000 });
  const applications = new Set<ServerApplication<PostgresLeagueStore>>();
  const connections = new Set<WebSocket>();
  try {
    await writeFile(join(directory, 'index.html'), '<!doctype html><title>Protected PostgreSQL preview</title>');
    const preview: PreviewOptions = { username: 'preview', password: randomBytes(32).toString('base64url'), allowedOrigins: [ORIGIN], staticDir: directory };
    // The hosted entry validates the gate before it opens a managed connection.
    preparePreview(preview);
    const authorization = 'Basic ' + Buffer.from(`${preview.username}:${preview.password}`).toString('base64');
    const headers = { Authorization: authorization, Origin: ORIGIN };
    const seed = createFixtureLeague({ now: 1_800_000_000_000 });
    const otherTeam = seed.teams.find(team => team.managerId !== 'alex')!;
    seed.draft.queues[otherTeam.id] = ['private-postgres-queue-marker'];
    async function open() {
      const store = await PostgresLeagueStore.open(databaseUrl!, { schema, seed, now: () => 1_800_000_000_000 });
      let app: ServerApplication<PostgresLeagueStore>;
      try { app = createServer({ store, port: 0, host: '127.0.0.1', preview }); }
      catch (error) { await store.close(); throw error; }
      applications.add(app);
      const address = await app.listen();
      return { app, base: `http://127.0.0.1:${address.port}` };
    }
    async function close(app: ServerApplication<PostgresLeagueStore>) { if (applications.delete(app)) await app.close(); }
    async function current(base: string): Promise<LeagueEnvelope> {
      const response = await fetch(`${base}/api/league`, { headers });
      assert.equal(response.status, 200);
      return await response.json() as LeagueEnvelope;
    }
    async function command(base: string, commandId: string, expectedRevision: number, name: string) {
      const response = await fetch(`${base}/api/commands`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ commandId, expectedRevision, command: { type: 'league.rename', name } }) });
      return { status: response.status, body: await response.json() as Body };
    }
    async function counts() {
      const result = await admin.query<{ receipts: string; events: string }>(`SELECT (SELECT COUNT(*) FROM ${quoted}.command_receipts) AS receipts, (SELECT COUNT(*) FROM ${quoted}.events) AS events`);
      return { receipts: Number(result.rows[0].receipts), events: Number(result.rows[0].events) };
    }

    let running = await open();
    const health = await fetch(`${running.base}/healthz`);
    assert.deepEqual(await health.json(), { ok: true });
    assert.equal((await fetch(`${running.base}/`)).status, 401);
    const unauthorized = await fetch(`${running.base}/api/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commandId: 'unauthorized', expectedRevision: 0, command: { type: 'league.rename', name: 'Forbidden' } }) });
    assert.equal(unauthorized.status, 401);
    assert.equal((await unauthorized.json() as Record<string, unknown>).state, undefined);
    assert.deepEqual(await counts(), { receipts: 0, events: 0 });
    const initial = await current(running.base);
    assert.equal(initial.capabilities.storage, 'postgres');
    assert.equal(initial.state.draft.queues[otherTeam.id], undefined);
    const live = connection(running.base.replace('http:', 'ws:') + '/events?since=-1', authorization);
    connections.add(live.socket);
    const snapshot = await live.next(frame => frame.type === 'snapshot');
    assert.equal(snapshot.state!.revision, initial.state.revision);
    assert.equal(snapshot.state!.draft.queues[otherTeam.id], undefined);
    const first = await command(running.base, 'pg-api-first', initial.state.revision, 'First persisted name');
    assert.equal(first.status, 200);
    assert.equal(first.body.duplicate, false);
    assert.equal((await live.next(frame => frame.type === 'changed')).revision, first.body.state.revision);
    const second = await command(running.base, 'pg-api-second', first.body.state.revision, 'Latest persisted name');
    assert.equal(second.status, 200);
    const duplicate = await command(running.base, 'pg-api-first', initial.state.revision, 'First persisted name');
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.duplicate, true);
    assert.equal(duplicate.body.committedRevision, first.body.state.revision);
    assert.equal(duplicate.body.state.name, 'Latest persisted name');
    const stale = await command(running.base, 'pg-api-stale', initial.state.revision, 'Stale name');
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error?.code, 'REVISION_CONFLICT');
    assert.equal(stale.body.state.name, second.body.state.name);
    const reused = await command(running.base, 'pg-api-first', second.body.state.revision, 'Different payload');
    assert.equal(reused.status, 409);
    assert.equal(reused.body.error?.code, 'IDEMPOTENCY_CONFLICT');
    await live.close();
    connections.delete(live.socket);
    const missed = await command(running.base, 'pg-api-missed', second.body.state.revision, 'Recovered after restart');
    assert.equal(missed.status, 200);
    const beforeRestart = await current(running.base);
    await close(running.app);

    running = await open();
    const restored = await current(running.base);
    assert.deepEqual(restored.state, beforeRestart.state);
    const retried = await command(running.base, 'pg-api-first', initial.state.revision, 'First persisted name');
    assert.equal(retried.body.duplicate, true);
    assert.equal(retried.body.state.revision, restored.state.revision);
    assert.equal(retried.body.committedRevision, first.body.state.revision);
    const recovered = connection(running.base.replace('http:', 'ws:') + '/events?since=0', authorization);
    connections.add(recovered.socket);
    const recovery = await recovered.next(frame => frame.type === 'snapshot');
    assert.deepEqual(recovery.state, restored.state);
    assert.equal(recovery.state!.draft.queues[otherTeam.id], undefined);
    const catchup = await recovered.next(frame => frame.type === 'events');
    assert.deepEqual(catchup.events!.map(event => event.revision), [1, 2, 3]);
    assert.ok(!JSON.stringify(catchup).includes('private-postgres-queue-marker'));
    await recovered.close();
    connections.delete(recovered.socket);
    assert.deepEqual(await counts(), { receipts: 3, events: 3 });

    // A real PostgreSQL failure reaches the HTTP boundary as a safe error and
    // rolls back all three persistence records, even after a snapshot update.
    const databaseDetail = 'private_postgres_exception_detail';
    await admin.query(`CREATE FUNCTION ${quoted}.reject_api_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '${databaseDetail}'; END $$`);
    await admin.query(`CREATE TRIGGER reject_api_receipt BEFORE INSERT ON ${quoted}.command_receipts FOR EACH ROW WHEN (NEW.command_id = 'database-failure') EXECUTE FUNCTION ${quoted}.reject_api_receipt()`);
    const failure = await command(running.base, 'database-failure', restored.state.revision, 'Must roll back');
    assert.equal(failure.status, 500);
    assert.equal(failure.body.error?.code, 'INTERNAL_ERROR');
    assert.ok(!JSON.stringify(failure.body).includes(databaseDetail));
    assert.deepEqual(failure.body.state, restored.state);
    assert.deepEqual((await current(running.base)).state, restored.state);
    assert.deepEqual(await counts(), { receipts: 3, events: 3 });
  } finally {
    for (const socket of connections) socket.terminate();
    try { await Promise.all([...applications].map(app => app.close())); }
    finally {
      try { await admin.query(`DROP SCHEMA IF EXISTS ${quoted} CASCADE`); }
      finally { await admin.end(); await rm(directory, { recursive: true, force: true }); }
    }
  }
});
