import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { computeMatchup, createFixtureLeague } from '@howieszn/domain';
import type { LeagueState } from '@howieszn/domain';
import { createServer } from '../src/server.ts';
import { LeagueStore } from '../src/store.ts';
import type { LeagueStorage } from '../src/storage.ts';

interface ResponseBody { state: LeagueState; viewerId: string; duplicate?: boolean; committedRevision?: number; error?: { code: string; message: string }; [key: string]: unknown }
async function fixture(options: { seed?: LeagueState; path?: string; now?: () => number } = {}) {
  const dir = options.path ? null : await mkdtemp(join(tmpdir(), 'howieszn-server-'));
  const path = options.path ?? join(dir!, 'league.sqlite');
  const app = createServer({ dbPath: path, host: '127.0.0.1', port: 0, now: options.now ?? (() => 1_800_000_000_000), seed: options.seed });
  const address = await app.listen();
  const base = `http://127.0.0.1:${address.port}`;
  return {
    ...app, base, path,
    async cleanup() { await app.close(); if (dir) await rm(dir, { recursive: true, force: true }); },
  };
}
async function get(base: string): Promise<ResponseBody> { const response = await fetch(`${base}/api/league`); assert.equal(response.status, 200); return await response.json() as ResponseBody; }
async function command(base: string, commandId: string, expectedRevision: number, action: unknown) {
  const response = await fetch(`${base}/api/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commandId, expectedRevision, command: action }) });
  return { status: response.status, body: await response.json() as ResponseBody };
}

test('commands persist atomically; duplicate retries return current state across restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'howieszn-restart-'));
  const path = join(dir, 'league.sqlite');
  let app = await fixture({ path });
  try {
    const initial = await get(app.base);
    const first = await command(app.base, 'rename-1', initial.state.revision, { type: 'league.rename', name: 'First name' });
    assert.equal(first.status, 200); assert.equal(first.body.duplicate, false);
    assert.equal(first.body.state.name, 'First name');
    const second = await command(app.base, 'rename-2', first.body.state.revision, { type: 'league.rename', name: 'Current name' });
    assert.equal(second.status, 200);
    const retry = await command(app.base, 'rename-1', initial.state.revision, { name: 'First name', type: 'league.rename' });
    assert.equal(retry.status, 200); assert.equal(retry.body.duplicate, true);
    assert.equal(retry.body.committedRevision, first.body.state.revision);
    assert.equal(retry.body.state.name, 'Current name');
    assert.equal(retry.body.state.revision, second.body.state.revision);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) AS count FROM command_receipts').get()!.count, 2);
    const stale = await command(app.base, 'stale', initial.state.revision, { type: 'league.rename', name: 'Wrong' });
    assert.equal(stale.status, 409); assert.equal(stale.body.error?.code, 'REVISION_CONFLICT');
    assert.equal(stale.body.state.name, 'Current name');
    const reused = await command(app.base, 'rename-1', second.body.state.revision, { type: 'league.rename', name: 'Different action' });
    assert.equal(reused.status, 409); assert.equal(reused.body.error?.code, 'IDEMPOTENCY_CONFLICT');
    const beforeRestart = await get(app.base);
    await app.close();
    app = await fixture({ path });
    const restored = await get(app.base);
    assert.deepEqual(restored.state, beforeRestart.state);
    const durableRetry = await command(app.base, 'rename-1', initial.state.revision, { type: 'league.rename', name: 'First name' });
    assert.equal(durableRetry.body.duplicate, true);
    assert.equal(durableRetry.body.state.revision, restored.state.revision);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test('rejected commands leave snapshots, receipts and events unchanged', async () => {
  const app = await fixture();
  try {
    const before = await get(app.base);
    const invalidTurn = await command(app.base, 'invalid-pick', before.state.revision, { type: 'draft.pick', teamId: before.state.teams[0].id, playerId: before.state.players[0].id, expectedPickIndex: 99 });
    assert.ok(invalidTurn.status >= 400);
    assert.equal((await get(app.base)).state.revision, before.state.revision);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) AS count FROM command_receipts').get()!.count, 0);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) AS count FROM events').get()!.count, 0);
    const sqlId = await command(app.base, "id'); DROP TABLE leagues; --", before.state.revision, { type: 'league.rename', name: 'Prepared statements' });
    assert.equal(sqlId.status, 200);
    assert.equal((await get(app.base)).state.name, 'Prepared statements');
  } finally { await app.cleanup(); }
});

test('distinct deliveries of unchanged source facts keep their receipts without duplicating events', async () => {
  const app = await fixture();
  try {
    const initial = await get(app.base);
    const action = { type: 'feed.game', game: initial.state.games[0] };
    const first = await command(app.base, 'source-delivery-1', initial.state.revision, action);
    const second = await command(app.base, 'source-delivery-2', initial.state.revision, action);
    assert.equal(first.status, 200); assert.equal(second.status, 200);
    assert.equal(first.body.state.revision, initial.state.revision);
    assert.equal(second.body.state.revision, initial.state.revision);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) AS count FROM command_receipts').get()!.count, 2);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) AS count FROM events').get()!.count, 0);
    const retry = await command(app.base, 'source-delivery-1', initial.state.revision, action);
    assert.equal(retry.body.duplicate, true);
  } finally { await app.cleanup(); }
});

test('concurrent requests based on one revision cannot overwrite each other', async () => {
  const app = await fixture();
  try {
    const initial = await get(app.base);
    const responses = await Promise.all([
      command(app.base, 'contender-a', initial.state.revision, { type: 'league.rename', name: 'Contender A' }),
      command(app.base, 'contender-b', initial.state.revision, { type: 'league.rename', name: 'Contender B' }),
    ]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    const accepted = responses.find(response => response.status === 200)!;
    const latest = await get(app.base);
    assert.equal(latest.state.name, accepted.body.state.name);
    assert.equal(latest.state.revision, initial.state.revision + 1);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) AS count FROM command_receipts').get()!.count, 1);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) AS count FROM events').get()!.count, 1);
  } finally { await app.cleanup(); }
});

test('HTTP boundary rejects malformed, oversized, unknown and unsafe payloads', async () => {
  const app = await fixture();
  try {
    const initial = await get(app.base);
    const sendRaw = (body: string, contentType = 'application/json') => fetch(`${app.base}/api/commands`, { method: 'POST', headers: { 'Content-Type': contentType }, body });
    assert.equal((await sendRaw('{broken')).status, 400);
    assert.equal((await sendRaw('{}', 'text/plain')).status, 415);
    assert.equal((await sendRaw('x'.repeat(257 * 1024))).status, 413);
    const envelope = { commandId: 'bad', expectedRevision: initial.state.revision, command: { type: 'draft.start' } };
    assert.equal((await sendRaw(JSON.stringify({ ...envelope, actorId: 'someone-else' }))).status, 400);
    assert.equal((await sendRaw('{"commandId":"unsafe","expectedRevision":0,"command":{"type":"draft.start","__proto__":{"commissioner":true}}}')).status, 400);
    assert.equal((await command(app.base, 'unknown', initial.state.revision, { type: 'unknown' })).status, 400);
    const fakeFact = { type: 'feed.stats', fact: { gameId: 'g', playerId: 'p', sourceRevision: 1, stats: { receptions: null }, winBonusEligible: true } };
    assert.equal((await command(app.base, 'nan', initial.state.revision, fakeFact)).status, 400);
    const poisonSlot = { type: 'lineup.set', teamId: 'alex-1', lineup: { QB: 'p1' } };
    assert.equal((await command(app.base, 'slot', initial.state.revision, poisonSlot)).status, 400);
    assert.equal((await get(app.base)).state.revision, initial.state.revision);
    assert.equal((await fetch(`${app.base}/api/events?since=-2`)).status, 400);
    assert.equal((await fetch(`${app.base}/api/league`, { headers: { Origin: 'https://untrusted.example' } })).status, 403);
    const preflight = await fetch(`${app.base}/api/commands`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
  } finally { await app.cleanup(); }
});

test('correction settings accept the selected 24–48 hour range and reject missing or malformed values', async () => {
  const app = await fixture();
  try {
    let current = await get(app.base);
    assert.equal(Reflect.get(current.state.rules, 'correctionWindowHours'), 48);
    for (const value of [23, 49, null, '']) {
      const rules = { ...current.state.rules, correctionWindowHours: value };
      const rejected = await command(app.base, `window-invalid-${String(value)}`, current.state.revision, { type: 'rules.update', rules });
      assert.equal(rejected.status, 400);
      assert.equal(rejected.body.error?.code, 'INVALID_REQUEST');
    }
    const missing = { ...current.state.rules } as Record<string, unknown>;
    delete missing.correctionWindowHours;
    assert.equal((await command(app.base, 'window-missing', current.state.revision, { type: 'rules.update', rules: missing })).status, 400);
    for (const value of [24, 48]) {
      const accepted = await command(app.base, `window-${value}`, current.state.revision, { type: 'rules.update', rules: { ...current.state.rules, correctionWindowHours: value } });
      assert.equal(accepted.status, 200);
      assert.equal(Reflect.get(accepted.body.state.rules, 'correctionWindowHours'), value);
      current = accepted.body;
    }
  } finally { await app.cleanup(); }
});

test('source completion timestamps stay optional but reject null, blank and pre-start values', async () => {
  const app = await fixture();
  try {
    const initial = await get(app.base);
    const game = initial.state.games[0];
    for (const [index, completedAt] of [null, '', game.startsAt - 1].entries()) {
      const result = await command(app.base, `completion-invalid-${index}`, initial.state.revision, { type: 'feed.game', game: { ...game, completedAt, sourceRevision: game.sourceRevision + 1 } });
      assert.equal(result.status, 400);
      assert.equal(result.body.error?.code, 'INVALID_REQUEST');
    }
    const noCompletion = await command(app.base, 'no-completion', initial.state.revision, { type: 'feed.game', game });
    assert.equal(noCompletion.status, 200);
    const completed = { ...game, startsAt: 1_800_000_000_000 - 3_600_000, status: 'final', winner: game.nflTeams[0], completedAt: 1_800_000_000_000, sourceRevision: game.sourceRevision + 1 };
    const result = await command(app.base, 'completed-game', initial.state.revision, { type: 'feed.game', game: completed });
    assert.equal(result.status, 200);
    assert.equal(Reflect.get(result.body.state.games.find(item => item.id === game.id)!, 'completedAt'), completed.completedAt);
  } finally { await app.cleanup(); }
});

test('schema upgrade preserves an existing league and receipts while adding only a missing correction default', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'howieszn-migration-'));
  const path = join(dir, 'league.sqlite');
  let app = await fixture({ path });
  try {
    const initial = await get(app.base);
    const renamed = await command(app.base, 'before-upgrade', initial.state.revision, { type: 'league.rename', name: 'Preserve this league' });
    assert.equal(renamed.status, 200);
    const legacy = app.store.load();
    delete (legacy.rules as unknown as Record<string, unknown>).correctionWindowHours;
    app.store.db.prepare('UPDATE leagues SET state_json = ?').run(JSON.stringify(legacy));
    app.store.db.exec('PRAGMA user_version = 1;');
    await app.close();
    app = await fixture({ path });
    const restored = await get(app.base);
    assert.equal(restored.state.name, 'Preserve this league');
    assert.equal(restored.state.revision, renamed.body.state.revision);
    assert.equal(Reflect.get(restored.state.rules, 'correctionWindowHours'), 48);
    assert.equal(app.store.db.prepare('PRAGMA user_version').get()!.user_version, 2);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) AS count FROM command_receipts').get()!.count, 1);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) AS count FROM events').get()!.count, 1);
    const retry = await command(app.base, 'before-upgrade', initial.state.revision, { type: 'league.rename', name: 'Preserve this league' });
    assert.equal(retry.body.duplicate, true);
    assert.equal(retry.body.state.name, 'Preserve this league');
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test('late correction review can retain the published winner through an attributed idempotent API command', async () => {
  let now = 1_800_000_000_000;
  const app = await fixture({ now: () => now });
  try {
    let current = await get(app.base);
    let counter = 0;
    const send = async (action: unknown) => {
      const result = await command(app.base, `review-flow-${++counter}`, current.state.revision, action);
      assert.equal(result.status, 200, JSON.stringify(result.body.error)); current = result.body; return result;
    };
    await send({ type: 'draft.start' });
    await send({ type: 'fixture.draftRemaining' });
    await send({ type: 'fixture.playRound' });
    const match = current.state.matchups.find(item => {
      const result = computeMatchup(current.state, item.id);
      if (!result.winnerTeamId || result.status !== 'ready') return false;
      const loser = current.state.teams.find(team => item.teamIds.includes(team.id) && team.id !== result.winnerTeamId)!;
      return Object.values(loser.lineup).some(id => current.state.stats.some(fact => fact.playerId === id));
    })!;
    assert.ok(match, 'Fixture needs a completed matchup with a scored losing starter.');
    const publishedWinner = computeMatchup(current.state, match.id).winnerTeamId!;
    await send({ type: 'matchup.settle', matchupId: match.id, reason: 'Publish the fixture result before the source correction.' });
    const settled = current.state.matchups.find(item => item.id === match.id)!;
    const captured = [...settled.capturedPlayerIds];
    const loserId = match.teamIds.find(id => id !== publishedWinner)!;
    const loser = current.state.teams.find(team => team.id === loserId)!;
    const historicalLineup = loser.lineups['1'];
    const fact = current.state.stats.find(item => Object.values(historicalLineup).includes(item.playerId))!;
    now += 49 * 60 * 60 * 1000;
    await send({ type: 'feed.stats', fact: { ...fact, sourceRevision: fact.sourceRevision + 1, stats: { ...fact.stats, receivingYards: 9999 } } });
    const review = current.state.matchups.find(item => item.id === match.id)!;
    assert.equal(review.status, 'review');
    assert.equal(review.winnerTeamId, publishedWinner);
    assert.deepEqual(review.capturedPlayerIds, captured);
    const beforeDecision = current.state.revision;
    const action = { type: 'matchup.keepPublished', matchupId: match.id, reason: 'The source revision arrived after the selected correction window; retain the published result.' };
    const result = await command(app.base, 'keep-published-decision', beforeDecision, action);
    assert.equal(result.status, 200, JSON.stringify(result.body.error));
    const retained = result.body.state.matchups.find(item => item.id === match.id)!;
    assert.equal(retained.status, 'settled');
    assert.equal(retained.winnerTeamId, publishedWinner);
    assert.equal(retained.correction?.status, 'kept');
    assert.equal(retained.correction?.decisionReason, action.reason);
    assert.deepEqual(retained.capturedPlayerIds, captured);
    const retried = await command(app.base, 'keep-published-decision', beforeDecision, action);
    assert.equal(retried.status, 200); assert.equal(retried.body.duplicate, true);
    assert.equal(retried.body.state.revision, result.body.state.revision);
    assert.ok(retried.body.state.audit.some(event => event.type === 'matchup.keepPublished' && event.actorId === 'alex'));
  } finally { await app.cleanup(); }
});

type Frame = { type: string; state?: LeagueState; revision?: number; events?: { summary: string }[] };
function probe(url: string) {
  const socket = new WebSocket(url);
  const frames: Frame[] = [];
  const listeners = new Set<(frame: Frame) => void>();
  socket.on('message', raw => { const frame = JSON.parse(String(raw)) as Frame; frames.push(frame); for (const listener of listeners) listener(frame); });
  socket.on('error', () => { /* Tests await connection errors separately if needed. */ });
  return {
    socket, frames,
    next(predicate: (frame: Frame) => boolean): Promise<Frame> {
      const existing = frames.find(predicate); if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { listeners.delete(listener); reject(new Error('Expected WebSocket frame did not arrive.')); }, 3000);
        const listener = (frame: Frame) => { if (predicate(frame)) { clearTimeout(timer); listeners.delete(listener); resolve(frame); } };
        listeners.add(listener);
      });
    },
    async close() { const closed = once(socket, 'close'); socket.close(); await closed; },
  };
}

test('WebSocket changes and reconnect snapshots converge without private queue disclosure', async () => {
  const seed = createFixtureLeague({ now: 1_800_000_000_000 });
  const opponent = seed.teams.find(team => team.managerId !== 'alex')!;
  seed.draft.queues[opponent.id] = ['private-queue-marker'];
  const app = await fixture({ seed });
  try {
    const initial = await get(app.base);
    assert.equal(initial.viewerId, 'alex');
    assert.equal(initial.state.draft.queues[opponent.id], undefined);
    const connection = probe(app.base.replace('http:', 'ws:') + '/events?since=-1');
    const snapshot = await connection.next(frame => frame.type === 'snapshot');
    assert.equal(snapshot.state!.draft.queues[opponent.id], undefined);
    const changed = await command(app.base, 'ws-rename', initial.state.revision, { type: 'league.rename', name: 'Realtime name' });
    const update = await connection.next(frame => frame.type === 'changed');
    assert.equal(update.revision, changed.body.state.revision);
    await connection.close();
    const missed = await command(app.base, 'missed', changed.body.state.revision, { type: 'league.rename', name: 'Recovered name' });
    const reconnect = probe(app.base.replace('http:', 'ws:') + '/events?since=0');
    const recovery = await reconnect.next(frame => frame.type === 'snapshot');
    assert.equal(recovery.state!.name, 'Recovered name');
    assert.equal(recovery.state!.revision, missed.body.state.revision);
    assert.equal(recovery.state!.draft.queues[opponent.id], undefined);
    const events = await reconnect.next(frame => frame.type === 'events');
    assert.ok(events.events!.length >= 2);
    assert.ok(events.events!.every(event => !event.summary.includes('private-queue-marker')));
    await reconnect.close();
    const future = probe(app.base.replace('http:', 'ws:') + '/events?since=999999');
    assert.equal((await future.next(frame => frame.type === 'snapshot')).state!.revision, missed.body.state.revision);
    await future.close();
  } finally { await app.cleanup(); }
});

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function asynchronous(local: LeagueStore): LeagueStorage {
  return {
    async load() { await nextTurn(); return local.load(); },
    async envelope(state) { await nextTurn(); return local.envelope(state); },
    async command(input) { await nextTurn(); return local.command(input); },
    async events(since, limit) { await nextTurn(); return local.events(since, limit); },
    async close() { await nextTurn(); local.close(); },
  };
}

test('an injected async store gates readiness, serves committed HTTP views and is awaited on shutdown', async () => {
  const local = new LeagueStore(':memory:');
  const storage = asynchronous(local);
  const ready = deferred();
  const closed = deferred();
  let closeCalls = 0;
  const app = createServer({ port: 0, store: {
    ...storage,
    async load() { await ready.promise; return storage.load(); },
    async close() { closeCalls++; await closed.promise; await storage.close(); },
  } });
  try {
    const listening = app.listen();
    await nextTurn();
    assert.equal(app.address(), null, 'No listener should exist before storage is ready.');
    ready.resolve();
    const address = await listening;
    const base = `http://127.0.0.1:${address.port}`;
    const initial = await get(base);
    const accepted = await command(base, 'async-rename', initial.state.revision, { type: 'league.rename', name: 'Awaited storage' });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.state.name, 'Awaited storage');
    assert.equal((await get(base)).state.revision, accepted.body.state.revision);
    const events = await (await fetch(`${base}/api/events?since=-1`)).json() as { events: unknown[]; revision: number };
    assert.equal(events.events.length, 1);
    assert.equal(events.revision, accepted.body.state.revision);
    const stale = await command(base, 'async-stale', initial.state.revision, { type: 'league.rename', name: 'Stale' });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error?.code, 'REVISION_CONFLICT');
    assert.equal(stale.body.state.name, 'Awaited storage');
    let finished = false;
    const shutdown = app.close().then(() => { finished = true; });
    await nextTurn();
    assert.equal(finished, false, 'Shutdown must wait for an asynchronous storage close.');
    closed.resolve();
    await shutdown;
    await app.close();
    assert.equal(closeCalls, 1);
  } finally { ready.resolve(); closed.resolve(); await app.close(); }
});

test('a command committed during an async socket snapshot is announced after that snapshot', async () => {
  const local = new LeagueStore(':memory:');
  const storage = asynchronous(local);
  const snapshotRead = deferred();
  const releaseSnapshot = deferred();
  let firstSnapshot = true;
  const app = createServer({ port: 0, store: {
    ...storage,
    async envelope(state) {
      const envelope = local.envelope(state);
      if (firstSnapshot) { firstSnapshot = false; snapshotRead.resolve(); await releaseSnapshot.promise; }
      return envelope;
    },
  } });
  const address = await app.listen();
  const base = `http://127.0.0.1:${address.port}`;
  const connection = probe(base.replace('http:', 'ws:') + '/events?since=-1');
  try {
    await snapshotRead.promise;
    const revision = local.load().revision;
    const changed = await command(base, 'during-snapshot', revision, { type: 'league.rename', name: 'Changed while loading' });
    assert.equal(changed.status, 200);
    releaseSnapshot.resolve();
    const snapshot = await connection.next(frame => frame.type === 'snapshot');
    assert.equal(snapshot.state!.revision, revision);
    const update = await connection.next(frame => frame.type === 'changed');
    assert.equal(update.revision, changed.body.state.revision);
    assert.ok(connection.frames.indexOf(snapshot) < connection.frames.indexOf(update));
    assert.equal((await get(base)).state.name, 'Changed while loading');
  } finally { releaseSnapshot.resolve(); await connection.close(); await app.close(); }
});

test('async storage failures reject startup or close socket recovery without exposing database errors', async () => {
  const startupLocal = new LeagueStore(':memory:');
  const unavailable = createServer({ port: 0, store: {
    ...asynchronous(startupLocal),
    async load() { throw new Error('Storage is not ready.'); },
  } });
  await assert.rejects(unavailable.listen(), /Storage is not ready/);
  assert.equal(unavailable.address(), null);
  await unavailable.close();

  const local = new LeagueStore(':memory:');
  const secret = 'postgresql://user:private-password@database/private-league';
  const app = createServer({ port: 0, store: {
    ...asynchronous(local),
    async envelope() { throw new Error(secret); },
    async command() { throw new Error(secret); },
  } });
  const address = await app.listen();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(`${base}/api/league`);
    assert.equal(response.status, 500);
    const body = await response.text();
    assert.match(body, /INTERNAL_ERROR/);
    assert.ok(!body.includes(secret));
    const failed = await command(base, 'failed-async-command', local.load().revision, { type: 'league.rename', name: 'Rejected' });
    assert.equal(failed.status, 500);
    assert.equal(failed.body.error?.code, 'INTERNAL_ERROR');
    assert.ok(!JSON.stringify(failed.body).includes(secret));
    const socket = new WebSocket(base.replace('http:', 'ws:') + '/events');
    socket.on('error', () => {});
    const [code, reason] = await once(socket, 'close');
    assert.equal(code, 1011);
    assert.ok(!String(reason).includes(secret));
    assert.equal(local.load().revision, 0);
  } finally { await app.close(); }
});
