import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createFixtureLeague } from '@howieszn/domain';
import type { LeagueState } from '@howieszn/domain';
import { PostgresLeagueStore } from '../src/postgres-store.ts';
import type { PostgresStoreOptions } from '../src/postgres-store.ts';
import { RequestError } from '../src/validation.ts';

// These are real PostgreSQL tests, never an in-memory SQL substitute. The caller
// owns TEST_DATABASE_URL; each test owns only a randomized disposable schema.
const databaseUrl = process.env.TEST_DATABASE_URL;
const pgOptions = { skip: !databaseUrl ? 'Set TEST_DATABASE_URL to run real PostgreSQL integration tests.' : false };
const NOW = 1_800_000_000_000;

async function fixture(seed?: LeagueState) {
  assert.ok(databaseUrl);
  const schema = `howieszn_test_${randomUUID().replaceAll('-', '')}`;
  const quoted = `"${schema}"`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000 });
  const stores = new Set<PostgresLeagueStore>();
  const open = async (options: PostgresStoreOptions = {}) => {
    const store = await PostgresLeagueStore.open(databaseUrl, { now: () => NOW, ...options, schema });
    stores.add(store);
    return store;
  };
  const close = async (store: PostgresLeagueStore) => { if (stores.delete(store)) await store.close(); };
  try {
    const store = await open({ seed });
    return {
      store, schema, quoted, admin, open, close,
      async counts() {
        const result = await admin.query<{ receipts: string; events: string }>(`SELECT
          (SELECT COUNT(*) FROM ${quoted}.command_receipts) AS receipts,
          (SELECT COUNT(*) FROM ${quoted}.events) AS events`);
        return { receipts: Number(result.rows[0].receipts), events: Number(result.rows[0].events) };
      },
      async cleanup() {
        try { await Promise.all([...stores].map(close)); }
        finally {
          try { await admin.query(`DROP SCHEMA IF EXISTS ${quoted} CASCADE`); }
          finally { await admin.end(); }
        }
      },
    };
  } catch (error) {
    try { await admin.query(`DROP SCHEMA IF EXISTS ${quoted} CASCADE`); }
    finally { await admin.end(); }
    throw error;
  }
}

function isCode(code: string) { return (error: unknown) => error instanceof RequestError && error.code === code; }

test('PostgreSQL: concurrent independent stores commit only one command for a revision', pgOptions, async () => {
  const f = await fixture();
  try {
    const second = await f.open();
    const before = await f.store.load();
    const outcomes = await Promise.allSettled([
      f.store.command({ commandId: 'contender-a', expectedRevision: before.revision, command: { type: 'league.rename', name: 'Contender A' } }),
      second.command({ commandId: 'contender-b', expectedRevision: before.revision, command: { type: 'league.rename', name: 'Contender B' } }),
    ]);
    const accepted = outcomes.filter(result => result.status === 'fulfilled');
    const rejected = outcomes.filter(result => result.status === 'rejected');
    assert.equal(accepted.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(isCode('REVISION_CONFLICT')(rejected[0].reason));
    const current = await second.load();
    assert.equal(current.revision, before.revision + 1);
    assert.equal(current.name, accepted[0].value.envelope.state.name);
    assert.deepEqual(await f.counts(), { receipts: 1, events: 1 });
  } finally { await f.cleanup(); }
});

test('PostgreSQL: concurrent duplicate deliveries share one durable receipt before revision checks', pgOptions, async () => {
  const f = await fixture();
  try {
    const second = await f.open();
    const initial = await f.store.load();
    const request = { commandId: 'same-delivery', expectedRevision: initial.revision, command: { type: 'league.rename' as const, name: 'Accepted once' } };
    const outcomes = await Promise.all([f.store.command(request), second.command(request)]);
    assert.deepEqual(outcomes.map(result => result.envelope.duplicate).sort(), [false, true]);
    assert.deepEqual(outcomes.map(result => result.envelope.committedRevision), [1, 1]);
    assert.deepEqual(await f.counts(), { receipts: 1, events: 1 });
    await second.command({ commandId: 'later', expectedRevision: 1, command: { type: 'league.rename', name: 'Latest state' } });
    const duplicate = await f.store.command({ ...request, command: { name: 'Accepted once', type: 'league.rename' } });
    assert.equal(duplicate.envelope.duplicate, true);
    assert.equal(duplicate.envelope.committedRevision, 1);
    assert.equal(duplicate.envelope.state.revision, 2);
    assert.equal(duplicate.envelope.state.name, 'Latest state');
    await assert.rejects(second.command({ ...request, command: { type: 'league.rename', name: 'Different payload' } }), isCode('IDEMPOTENCY_CONFLICT'));
    assert.deepEqual(await f.counts(), { receipts: 2, events: 2 });
  } finally { await f.cleanup(); }
});

test('PostgreSQL: accepted no-op facts retain receipts without events or revision changes', pgOptions, async () => {
  const f = await fixture();
  try {
    const state = await f.store.load();
    const command = { type: 'feed.game' as const, game: state.games[0] };
    for (const commandId of ['delivery-1', 'delivery-2']) {
      const result = await f.store.command({ commandId, expectedRevision: state.revision, command });
      assert.equal(result.changed, false);
      assert.equal(result.envelope.duplicate, false);
      assert.equal(result.envelope.committedRevision, state.revision);
    }
    const duplicate = await f.store.command({ commandId: 'delivery-1', expectedRevision: state.revision, command });
    assert.equal(duplicate.envelope.duplicate, true);
    assert.deepEqual(await f.counts(), { receipts: 2, events: 0 });
    assert.deepEqual(await f.store.events(0), { events: [], revision: state.revision, truncated: false });
  } finally { await f.cleanup(); }
});

test('PostgreSQL: a late SQL failure rolls back snapshot, event and receipt together', pgOptions, async () => {
  const f = await fixture();
  try {
    const before = await f.store.load();
    await f.admin.query(`CREATE FUNCTION ${f.quoted}.reject_test_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected test receipt failure'; END $$`);
    await f.admin.query(`CREATE TRIGGER reject_test_receipt BEFORE INSERT ON ${f.quoted}.command_receipts FOR EACH ROW WHEN (NEW.command_id = 'injected-failure') EXECUTE FUNCTION ${f.quoted}.reject_test_receipt()`);
    const request = { commandId: 'injected-failure', expectedRevision: before.revision, command: { type: 'league.rename' as const, name: 'Must roll back' } };
    await assert.rejects(f.store.command(request), /Injected test receipt failure/);
    assert.deepEqual(await f.store.load(), before);
    assert.deepEqual(await f.counts(), { receipts: 0, events: 0 });
    await f.admin.query(`DROP TRIGGER reject_test_receipt ON ${f.quoted}.command_receipts`);
    const retried = await f.store.command(request);
    assert.equal(retried.envelope.duplicate, false);
    assert.equal(retried.envelope.state.name, 'Must roll back');
    assert.deepEqual(await f.counts(), { receipts: 1, events: 1 });
  } finally { await f.cleanup(); }
});

test('PostgreSQL: domain rejection has no receipt and values cannot alter SQL structure', pgOptions, async () => {
  const f = await fixture();
  try {
    const before = await f.store.load();
    await assert.rejects(f.store.command({ commandId: 'rejected-pick', expectedRevision: before.revision, command: { type: 'draft.pick', teamId: before.teams[0].id, playerId: before.players[0].id, expectedPickIndex: 99 } }));
    assert.deepEqual(await f.store.load(), before);
    assert.deepEqual(await f.counts(), { receipts: 0, events: 0 });
    const name = "Friends'); DROP TABLE leagues; --";
    const result = await f.store.command({ commandId: "id'); DROP TABLE command_receipts; --", expectedRevision: before.revision, command: { type: 'league.rename', name } });
    assert.equal(result.envelope.state.name, name);
    assert.deepEqual(await f.counts(), { receipts: 1, events: 1 });
  } finally { await f.cleanup(); }
});

test('PostgreSQL: restart preserves history and receipts; public views keep other queues private', pgOptions, async () => {
  const seed = createFixtureLeague({ now: NOW });
  const own = seed.teams.find(team => team.managerId === 'alex')!;
  const other = seed.teams.find(team => team.managerId !== 'alex')!;
  seed.draft.queues[other.id] = [seed.players[3].id];
  const f = await fixture(seed);
  try {
    await f.store.command({ commandId: 'queue', expectedRevision: 0, command: { type: 'draft.queue', teamId: own.id, playerIds: [seed.players[0].id] } });
    await f.store.command({ commandId: 'start', expectedRevision: 1, command: { type: 'draft.start' } });
    const before = await f.store.load();
    const initialPage = await f.store.events(0, 1);
    assert.equal(initialPage.truncated, true);
    assert.equal(initialPage.revision, 2);
    assert.deepEqual(initialPage.events.map(event => event.revision), [1]);
    assert.equal(initialPage.events[0].summary, 'A private team queue was updated.');
    await f.close(f.store);
    const restored = await f.open({ seed: createFixtureLeague({ name: 'Do not overwrite persisted league', now: NOW + 10 }) });
    assert.deepEqual(await restored.load(), before);
    const envelope = await restored.envelope();
    assert.equal(envelope.capabilities.storage, 'postgres');
    assert.deepEqual(envelope.state.draft.queues[own.id], [seed.players[0].id]);
    assert.equal(envelope.state.draft.queues[other.id], undefined);
    assert.deepEqual((await restored.load()).draft.queues[other.id], [seed.players[3].id]);
    assert.ok(Object.keys(envelope.state.draft.queues).every(id => seed.teams.find(team => team.id === id)?.managerId === 'alex'));
    const retry = await restored.command({ commandId: 'queue', expectedRevision: 0, command: { type: 'draft.queue', teamId: own.id, playerIds: [seed.players[0].id] } });
    assert.equal(retry.envelope.duplicate, true);
    assert.equal(retry.envelope.committedRevision, 1);
    assert.equal(retry.envelope.state.revision, 2);
    const nextPage = await restored.events(1, 1);
    assert.equal(nextPage.truncated, false);
    assert.deepEqual(nextPage.events.map(event => event.revision), [2]);
    assert.deepEqual(await f.counts(), { receipts: 2, events: 2 });
  } finally { await f.cleanup(); }
});

test('PostgreSQL: concurrent boot seeds once and existing settings are not overwritten', pgOptions, async () => {
  const seed = createFixtureLeague({ now: NOW, name: 'Keep my league' });
  seed.rules.correctionWindowHours = 24;
  const f = await fixture(seed);
  try {
    await f.store.command({ commandId: 'rename', expectedRevision: 0, command: { type: 'league.rename', name: 'Already in use' } });
    const before = await f.store.load();
    const competing = createFixtureLeague({ now: NOW + 1000, name: 'Replacement seed' });
    const stores = await Promise.all([f.open({ seed: competing }), f.open({ seed: competing })]);
    for (const store of stores) assert.deepEqual(await store.load(), before);
    assert.equal((await stores[0].load()).rules.correctionWindowHours, 24);
    assert.deepEqual(await f.counts(), { receipts: 1, events: 1 });
    const migrations = await f.admin.query<{ version: number }>(`SELECT version FROM ${f.quoted}.schema_migrations ORDER BY version`);
    assert.deepEqual(migrations.rows.map(row => row.version), [1, 2]);
  } finally { await f.cleanup(); }
});

test('PostgreSQL: simultaneous first boot initializes an empty namespace without replacing either seed', pgOptions, async () => {
  const f = await fixture();
  try {
    await f.close(f.store);
    await f.admin.query(`DROP SCHEMA ${f.quoted} CASCADE`);
    const firstSeed = createFixtureLeague({ now: NOW, name: 'First proposed seed' });
    const secondSeed = createFixtureLeague({ now: NOW + 1000, name: 'Second proposed seed' });
    const stores = await Promise.all([f.open({ seed: firstSeed }), f.open({ seed: secondSeed })]);
    const first = await stores[0].load();
    const second = await stores[1].load();
    assert.deepEqual(first, second);
    assert.ok(['First proposed seed', 'Second proposed seed'].includes(first.name));
    assert.equal(first.revision, 0);
    assert.deepEqual(await f.counts(), { receipts: 0, events: 0 });
    const migrations = await f.admin.query<{ version: number }>(`SELECT version FROM ${f.quoted}.schema_migrations ORDER BY version`);
    assert.deepEqual(migrations.rows.map(row => row.version), [1, 2]);
  } finally { await f.cleanup(); }
});

test('PostgreSQL: fixture migration adds only missing correction defaults and retains receipts', pgOptions, async () => {
  const f = await fixture();
  try {
    await f.store.command({ commandId: 'before-migration', expectedRevision: 0, command: { type: 'league.rename', name: 'Preserve legacy history' } });
    const before = await f.store.load();
    await f.admin.query(`UPDATE ${f.quoted}.leagues SET state_json = state_json #- '{rules,correctionWindowHours}'`);
    await f.admin.query(`DELETE FROM ${f.quoted}.schema_migrations WHERE version = 2`);
    const migrated = await f.open();
    assert.deepEqual(await migrated.load(), before);
    const duplicate = await migrated.command({ commandId: 'before-migration', expectedRevision: 0, command: { type: 'league.rename', name: 'Preserve legacy history' } });
    assert.equal(duplicate.envelope.duplicate, true);
    assert.deepEqual(await f.counts(), { receipts: 1, events: 1 });
    await f.admin.query(`INSERT INTO ${f.quoted}.schema_migrations (version, applied_at) VALUES (3, $1)`, [NOW]);
    await assert.rejects(f.open(), /newer than this application/);
    assert.deepEqual(await migrated.load(), before);
  } finally { await f.cleanup(); }
});

test('PostgreSQL: schema names are validated before connecting', async () => {
  for (const schema of ['public; DROP SCHEMA public', '', 'MixedCase', 'a'.repeat(64), 'has-dash']) {
    await assert.rejects(PostgresLeagueStore.open('postgres://unused.invalid/unused', { schema }), /schema must be a lowercase SQL identifier/);
  }
});
