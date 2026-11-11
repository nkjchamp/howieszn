import type { LeagueState } from '@howieszn/domain';
import type { CommandEnvelope, LeagueEnvelope, PublicEvent } from './store.ts';
import type { CommandRequest } from './validation.ts';

export type Awaitable<T> = T | Promise<T>;
export interface EventPage { events: PublicEvent[]; revision: number; truncated: boolean }
export interface CommandResult { envelope: CommandEnvelope; changed: boolean }

/** Both local SQLite and managed PostgreSQL expose the same committed view. */
export interface LeagueStorage {
  load(): Awaitable<LeagueState>;
  envelope(state?: LeagueState): Awaitable<LeagueEnvelope>;
  command(request: CommandRequest): Awaitable<CommandResult>;
  events(since: number, limit?: number): Awaitable<EventPage>;
  close(): Awaitable<void>;
}
