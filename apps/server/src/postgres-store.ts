import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { applyCommand, createFixtureLeague, getPublicView } from '@howieszn/domain';
import type { LeagueState } from '@howieszn/domain';
import { addCorrectionDefault, publicSummary, VIEWER_ID } from './store.ts';
import type { CommandEnvelope, LeagueEnvelope, PublicEvent } from './store.ts';
import { canonical, RequestError } from './validation.ts';
import type { CommandRequest } from './validation.ts';

const LEAGUE_ID = 'demo-league';
const SCHEMA_VERSION = 2;

export interface PostgresStoreOptions {
  now?: () => number;
  seed?: LeagueState;
  /** Isolates this application's tables; tests use their own disposable schema. */
  schema?: string;
  onPoolError?: (error: Error) => void;
}

function schemaIdentifier(schema: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw new Error('PostgreSQL schema must be a lowercase SQL identifier of at most 63 characters.');
  return `"${schema}"`;
}

function integer(value: number | string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error('Database integer is outside the supported range.');
  return result;
}

interface LeagueRow { revision: string; state_json: LeagueState }
interface ReceiptRow { payload_hash: string; revision: string }
interface EventRow { revision: string; type: string; summary: string; at: string }

/** PostgreSQL keeps the same snapshot/receipt/event boundary as the local store. */
export class PostgresLeagueStore {
  private readonly pool: Pool;
  private readonly namespace: string;
  readonly now: () => number;

  private constructor(pool: Pool, namespace: string, now: () => number) {
    this.pool = pool;
    this.namespace = namespace;
    this.now = now;
  }

  static async open(databaseUrl: string, options: PostgresStoreOptions = {}): Promise<PostgresLeagueStore> {
    const schema = options.schema ?? 'howieszn';
    const namespace = schemaIdentifier(schema);
    const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000 });
    // pg removes failed idle clients; subsequent operations acquire a replacement.
    // Keep an error listener so an idle transport failure cannot crash Node.
    pool.on('error', options.onPoolError ?? (() => { console.error('PostgreSQL idle connection failed.'); }));
    const store = new PostgresLeagueStore(pool, namespace, options.now ?? Date.now);
    try {
      await store.initialize(schema, options.seed);
      return store;
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  private async initialize(schema: string, initial?: LeagueState): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize boot migrations and first seed across independent API processes.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`howieszn:migrations:${schema}`]);
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${this.namespace}`);
      await client.query(`CREATE TABLE IF NOT EXISTS ${this.namespace}.schema_migrations (version INTEGER PRIMARY KEY, applied_at BIGINT NOT NULL)`);
      const versions = await client.query<{ version: number }>(`SELECT version FROM ${this.namespace}.schema_migrations ORDER BY version`);
      if (versions.rows.some(row => row.version > SCHEMA_VERSION)) throw new Error('PostgreSQL schema is newer than this application.');
      const applied = new Set(versions.rows.map(row => row.version));
      if (!applied.has(1)) {
        await client.query(`CREATE TABLE IF NOT EXISTS ${this.namespace}.leagues (
          id TEXT PRIMARY KEY, revision BIGINT NOT NULL CHECK (revision >= 0), state_json JSONB NOT NULL
        )`);
        await client.query(`CREATE TABLE IF NOT EXISTS ${this.namespace}.command_receipts (
          league_id TEXT NOT NULL REFERENCES ${this.namespace}.leagues(id), command_id TEXT NOT NULL,
          payload_hash TEXT NOT NULL, revision BIGINT NOT NULL, created_at BIGINT NOT NULL,
          PRIMARY KEY (league_id, command_id)
        )`);
        await client.query(`CREATE TABLE IF NOT EXISTS ${this.namespace}.events (
          seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          league_id TEXT NOT NULL REFERENCES ${this.namespace}.leagues(id), revision BIGINT NOT NULL,
          type TEXT NOT NULL, summary TEXT NOT NULL, created_at BIGINT NOT NULL,
          UNIQUE (league_id, revision)
        )`);
        await client.query(`INSERT INTO ${this.namespace}.schema_migrations (version, applied_at) VALUES ($1, $2)`, [1, this.now()]);
      }
      if (!applied.has(2)) {
        const leagues = await client.query<LeagueRow & { id: string }>(`SELECT id, revision, state_json FROM ${this.namespace}.leagues FOR UPDATE`);
        for (const row of leagues.rows) {
          if (addCorrectionDefault(row.state_json)) await client.query(`UPDATE ${this.namespace}.leagues SET state_json = $1::jsonb WHERE id = $2`, [JSON.stringify(row.state_json), row.id]);
        }
        await client.query(`INSERT INTO ${this.namespace}.schema_migrations (version, applied_at) VALUES ($1, $2)`, [2, this.now()]);
      }
      const seed = structuredClone(initial ?? createFixtureLeague({ id: LEAGUE_ID, name: 'Fourth & Friends', managerCount: 4, now: this.now() }));
      addCorrectionDefault(seed);
      await client.query(`INSERT INTO ${this.namespace}.leagues (id, revision, state_json) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO NOTHING`, [LEAGUE_ID, seed.revision, JSON.stringify(seed)]);
      await client.query('COMMIT');
    } catch (error) {
      await rollback(client);
      throw error;
    } finally { client.release(); }
  }

  async load(): Promise<LeagueState> {
    const result = await this.pool.query<LeagueRow>(`SELECT revision, state_json FROM ${this.namespace}.leagues WHERE id = $1`, [LEAGUE_ID]);
    return stateFrom(result.rows[0]);
  }

  async envelope(state?: LeagueState): Promise<LeagueEnvelope> {
    return {
      state: getPublicView(state ?? await this.load(), VIEWER_ID), viewerId: VIEWER_ID, serverTime: this.now(),
      capabilities: { fixture: true, liveProvider: false, storage: 'postgres' },
    };
  }

  async command(request: CommandRequest): Promise<{ envelope: CommandEnvelope; changed: boolean }> {
    const hash = createHash('sha256').update(canonical(request.command)).digest('hex');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Every writer, including a second process, serializes on this league row.
      // Read the receipt after acquiring the lock, before checking stale revisions.
      const locked = await client.query<LeagueRow>(`SELECT revision, state_json FROM ${this.namespace}.leagues WHERE id = $1 FOR UPDATE`, [LEAGUE_ID]);
      const current = stateFrom(locked.rows[0]);
      const receipt = await client.query<ReceiptRow>(`SELECT payload_hash, revision FROM ${this.namespace}.command_receipts WHERE league_id = $1 AND command_id = $2`, [LEAGUE_ID, request.commandId]);
      const previous = receipt.rows[0];
      if (previous) {
        if (previous.payload_hash !== hash) throw new RequestError(409, 'IDEMPOTENCY_CONFLICT', 'This command ID was already used for a different action.');
        const envelope = await this.envelope(current);
        await client.query('COMMIT');
        return { envelope: { ...envelope, duplicate: true, committedRevision: integer(previous.revision) }, changed: false };
      }
      if (request.expectedRevision !== current.revision) throw new RequestError(409, 'REVISION_CONFLICT', 'The league changed. Review its current state before trying again.', { expectedRevision: request.expectedRevision, actualRevision: current.revision });
      const commandTime = this.now();
      const next = applyCommand(current, request.command, { actorId: VIEWER_ID, now: commandTime });
      const changed = next.revision !== current.revision;
      if (changed) {
        const update = await client.query(`UPDATE ${this.namespace}.leagues SET revision = $1, state_json = $2::jsonb WHERE id = $3 AND revision = $4`, [next.revision, JSON.stringify(next), LEAGUE_ID, current.revision]);
        if (update.rowCount !== 1) throw new Error('The locked league snapshot changed unexpectedly.');
        await client.query(`INSERT INTO ${this.namespace}.events (league_id, revision, type, summary, created_at) VALUES ($1, $2, $3, $4, $5)`, [LEAGUE_ID, next.revision, request.command.type, publicSummary(request.command.type), commandTime]);
      }
      await client.query(`INSERT INTO ${this.namespace}.command_receipts (league_id, command_id, payload_hash, revision, created_at) VALUES ($1, $2, $3, $4, $5)`, [LEAGUE_ID, request.commandId, hash, next.revision, commandTime]);
      const envelope = await this.envelope(next);
      await client.query('COMMIT');
      return { envelope: { ...envelope, duplicate: false, committedRevision: next.revision }, changed };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally { client.release(); }
  }

  async events(since: number, limit = 200): Promise<{ events: PublicEvent[]; revision: number; truncated: boolean }> {
    const client = await this.pool.connect();
    try {
      // The cursor page and advertised revision must describe one database snapshot.
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const page = await client.query<EventRow>(`SELECT revision, type, summary, created_at AS at FROM ${this.namespace}.events WHERE league_id = $1 AND revision > $2 ORDER BY revision LIMIT $3`, [LEAGUE_ID, since, limit + 1]);
      const league = await client.query<{ revision: string }>(`SELECT revision FROM ${this.namespace}.leagues WHERE id = $1`, [LEAGUE_ID]);
      if (!league.rows[0]) throw new Error('PostgreSQL league is missing.');
      const events = page.rows.slice(0, limit).map(row => ({ ...row, revision: integer(row.revision), at: integer(row.at) }));
      const revision = integer(league.rows[0].revision);
      await client.query('COMMIT');
      return { events, revision, truncated: page.rows.length > limit };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally { client.release(); }
  }

  async close(): Promise<void> { await this.pool.end(); }
}

function stateFrom(row: LeagueRow | undefined): LeagueState {
  if (!row) throw new Error('PostgreSQL league is missing.');
  if (row.state_json.revision !== integer(row.revision)) throw new Error('PostgreSQL league revision does not match its snapshot.');
  return row.state_json;
}

async function rollback(client: PoolClient): Promise<void> {
  try { await client.query('ROLLBACK'); } catch { /* Preserve the original failure. */ }
}
