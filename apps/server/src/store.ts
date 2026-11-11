import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { applyCommand, createFixtureLeague, getPublicView } from '@howieszn/domain';
import type { LeagueState } from '@howieszn/domain';
import { canonical, RequestError } from './validation.ts';
import type { CommandRequest } from './validation.ts';

export const VIEWER_ID = 'alex';
const LEAGUE_ID = 'demo-league';
export interface PublicEvent { revision: number; type: string; summary: string; at: number }
export interface LeagueEnvelope {
  state: LeagueState;
  viewerId: typeof VIEWER_ID;
  serverTime: number;
  capabilities: { fixture: true; liveProvider: false; storage: 'sqlite' | 'postgres' };
}
export interface CommandEnvelope extends LeagueEnvelope { duplicate: boolean; committedRevision: number }

export class LeagueStore {
  readonly db: DatabaseSync;
  readonly now: () => number;
  constructor(dbPath: string, options: { now?: () => number; seed?: LeagueState } = {}) {
    if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
    this.now = options.now ?? Date.now;
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    const version = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (version.user_version > 2) { this.db.close(); throw new Error('Local database schema is newer than this application.'); }
    this.db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS leagues (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, state_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS command_receipts (
        league_id TEXT NOT NULL, command_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
        revision INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (league_id, command_id)
      );
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, league_id TEXT NOT NULL, revision INTEGER NOT NULL,
        type TEXT NOT NULL, summary TEXT NOT NULL, created_at INTEGER NOT NULL,
        UNIQUE (league_id, revision)
      );
      COMMIT;
    `);
    // Preserve local fixture history and receipts when introducing the selected
    // correction window. Existing explicit values are never overwritten.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const rows = this.db.prepare('SELECT id, state_json FROM leagues').all() as unknown as { id: string; state_json: string }[];
      for (const row of rows) {
        const state = JSON.parse(row.state_json) as LeagueState;
        if (addCorrectionDefault(state)) this.db.prepare('UPDATE leagues SET state_json = ? WHERE id = ?').run(JSON.stringify(state), row.id);
      }
      this.db.exec('PRAGMA user_version = 2; COMMIT;');
    } catch (error) { this.db.exec('ROLLBACK'); this.db.close(); throw error; }
    if (!this.db.prepare('SELECT id FROM leagues WHERE id = ?').get(LEAGUE_ID)) {
      const seed = structuredClone(options.seed ?? createFixtureLeague({ id: LEAGUE_ID, name: 'Fourth & Friends', managerCount: 4, now: this.now() }));
      addCorrectionDefault(seed);
      this.db.prepare('INSERT INTO leagues (id, revision, state_json) VALUES (?, ?, ?)').run(LEAGUE_ID, seed.revision, JSON.stringify(seed));
    }
  }
  load(): LeagueState {
    const row = this.db.prepare('SELECT state_json FROM leagues WHERE id = ?').get(LEAGUE_ID) as { state_json: string } | undefined;
    if (!row) throw new Error('Local league is missing.');
    return JSON.parse(row.state_json) as LeagueState;
  }
  envelope(state = this.load()): LeagueEnvelope {
    return { state: getPublicView(state, VIEWER_ID), viewerId: VIEWER_ID, serverTime: this.now(), capabilities: { fixture: true, liveProvider: false, storage: 'sqlite' } };
  }
  command(request: CommandRequest): { envelope: CommandEnvelope; changed: boolean } {
    const hash = createHash('sha256').update(canonical(request.command)).digest('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.db.prepare('SELECT payload_hash, revision FROM command_receipts WHERE league_id = ? AND command_id = ?').get(LEAGUE_ID, request.commandId) as { payload_hash: string; revision: number } | undefined;
      const current = this.load();
      if (previous) {
        if (previous.payload_hash !== hash) throw new RequestError(409, 'IDEMPOTENCY_CONFLICT', 'This command ID was already used for a different action.');
        const envelope = this.envelope(current);
        this.db.exec('COMMIT');
        return { envelope: { ...envelope, duplicate: true, committedRevision: previous.revision }, changed: false };
      }
      if (request.expectedRevision !== current.revision) throw new RequestError(409, 'REVISION_CONFLICT', 'The league changed. Review its current state before trying again.', { expectedRevision: request.expectedRevision, actualRevision: current.revision });
      const next = applyCommand(current, request.command, { actorId: VIEWER_ID, now: this.now() });
      const changed = next.revision !== current.revision;
      if (changed) {
        this.db.prepare('UPDATE leagues SET revision = ?, state_json = ? WHERE id = ? AND revision = ?').run(next.revision, JSON.stringify(next), LEAGUE_ID, current.revision);
        // Public summaries intentionally omit command payloads and private queue contents.
        this.db.prepare('INSERT INTO events (league_id, revision, type, summary, created_at) VALUES (?, ?, ?, ?, ?)').run(LEAGUE_ID, next.revision, request.command.type, publicSummary(request.command.type), this.now());
      }
      this.db.prepare('INSERT INTO command_receipts (league_id, command_id, payload_hash, revision, created_at) VALUES (?, ?, ?, ?, ?)').run(LEAGUE_ID, request.commandId, hash, next.revision, this.now());
      const envelope = this.envelope(next);
      this.db.exec('COMMIT');
      return { envelope: { ...envelope, duplicate: false, committedRevision: next.revision }, changed };
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch { /* Preserve the original transaction failure. */ } throw error; }
  }
  events(since: number, limit = 200): { events: PublicEvent[]; revision: number; truncated: boolean } {
    const rows = this.db.prepare('SELECT revision, type, summary, created_at AS at FROM events WHERE league_id = ? AND revision > ? ORDER BY revision LIMIT ?').all(LEAGUE_ID, since, limit + 1) as unknown as PublicEvent[];
    return { events: rows.slice(0, limit), revision: this.load().revision, truncated: rows.length > limit };
  }
  close(): void { this.db.close(); }
}

export function addCorrectionDefault(state: LeagueState): boolean {
  if (state.fixture !== true || !state.rules || Object.hasOwn(state.rules, 'correctionWindowHours')) return false;
  (state.rules as LeagueState['rules'] & { correctionWindowHours: number }).correctionWindowHours = 48;
  return true;
}

export function publicSummary(type: string): string {
  const summaries: Record<string, string> = {
    'league.rename': 'League name updated.', 'rules.update': 'League rules updated.',
    'draft.start': 'Draft started.', 'draft.pick': 'Draft pick confirmed.', 'draft.queue': 'A private team queue was updated.',
    'draft.pause': 'Draft paused.', 'draft.resume': 'Draft resumed.', 'draft.autopick': 'Draft autopick confirmed.',
    'fixture.draftRemaining': 'Remaining fixture picks simulated.', 'lineup.set': 'Team lineup updated.',
    'feed.game': 'Game fact revised.', 'feed.stats': 'Player statistics revised.', 'fixture.playRound': 'Fixture round replayed.',
    'matchup.settle': 'Matchup settled with an explicit reason.', 'matchup.keepPublished': 'Commissioner reviewed a correction and retained the published outcome.',
    'round.advance': 'League advanced to the next round.',
  };
  return summaries[type] ?? 'League updated.';
}
