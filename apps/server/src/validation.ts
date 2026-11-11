import type { Command, LeagueRules, Position, StatKey } from '@howieszn/domain';

export class RequestError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;
  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message); this.name = 'RequestError'; this.status = status; this.code = code; this.details = details;
  }
}

const positions = new Set<Position>(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
const slots = new Set(['SFLEX', 'WR', 'RB', 'TE', 'DEF/K', 'FLEX']);
const statKeys = new Set<StatKey>(['passingYards', 'passingTouchdowns', 'interceptions', 'rushingYards', 'rushingTouchdowns', 'receptions', 'receivingYards', 'receivingTouchdowns', 'fumblesLost', 'extraPoints', 'fieldGoals', 'sacks', 'defensiveInterceptions', 'defensiveTouchdowns', 'nflTeamWins']);
const unsafe = new Set(['__proto__', 'constructor', 'prototype']);

function invalid(message: string): never { throw new RequestError(400, 'INVALID_REQUEST', message); }
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []): void {
  for (const key of required) if (!Object.hasOwn(value, key)) invalid(`Missing ${key}.`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) invalid(`Unsupported field: ${key}.`);
}
function string(value: unknown, label: string, max = 160): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) invalid(`${label} must be a nonempty string of at most ${max} characters.`);
}
function number(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) invalid(`${label} must be a finite number within the safe numeric range.`);
}
function integer(value: unknown, label: string): asserts value is number {
  number(value, label);
  if (!Number.isSafeInteger(value) || value < 0) invalid(`${label} must be a nonnegative integer.`);
}
function boolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== 'boolean') invalid(`${label} must be true or false.`);
}
function strings(value: unknown, label: string, max = 512): asserts value is string[] {
  if (!Array.isArray(value) || value.length > max) invalid(`${label} must be an array with at most ${max} items.`);
  for (const item of value) string(item, label);
}
function rejectUnsafe(value: unknown, depth = 0): void {
  if (depth > 20) invalid('Request nesting is too deep.');
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (unsafe.has(key)) invalid('Unsafe object field.');
    rejectUnsafe(item, depth + 1);
  }
}
function scoringRule(value: unknown): void {
  const rule = object(value, 'Scoring rule'); keys(rule, ['enabled', 'value', 'mode']);
  boolean(rule.enabled, 'enabled'); number(rule.value, 'Scoring value');
  if (rule.mode !== 'points' && rule.mode !== 'yardsPerPoint') invalid('Unsupported scoring mode.');
  if (rule.mode === 'yardsPerPoint' && rule.value <= 0) invalid('Yards per point must be positive.');
}
function scoringMap(value: unknown, all: boolean): void {
  const map = object(value, 'Scoring map');
  if (all) for (const key of statKeys) if (!Object.hasOwn(map, key)) invalid(`Missing scoring rule: ${key}.`);
  for (const [key, rule] of Object.entries(map)) {
    if (!statKeys.has(key as StatKey)) invalid(`Unsupported statistic: ${key}.`);
    scoringRule(rule);
    if ((rule as { mode: string }).mode === 'yardsPerPoint' && !key.endsWith('Yards')) invalid('Yardage ratios can only score yardage statistics.');
  }
}
function validateRules(value: unknown): asserts value is LeagueRules {
  const rules = object(value, 'Rules'); keys(rules, ['ownership', 'benchAllocation', 'assignmentLock', 'fractionalYardage', 'correctionWindowHours', 'scoring']);
  if (!['team', 'manager'].includes(rules.ownership as string)) invalid('Unsupported ownership mode.');
  if (!['team', 'manager'].includes(rules.benchAllocation as string)) invalid('Unsupported bench allocation.');
  if (!['round-start', 'player-kickoff'].includes(rules.assignmentLock as string)) invalid('Unsupported assignment lock.');
  boolean(rules.fractionalYardage, 'fractionalYardage');
  number(rules.correctionWindowHours, 'correctionWindowHours');
  if (rules.correctionWindowHours < 24 || rules.correctionWindowHours > 48) invalid('Correction window must be between 24 and 48 hours.');
  const scoring = object(rules.scoring, 'Scoring'); keys(scoring, ['base', 'positions']); scoringMap(scoring.base, true);
  for (const [position, map] of Object.entries(object(scoring.positions, 'Position scoring'))) {
    if (!positions.has(position as Position)) invalid(`Unsupported position: ${position}.`);
    scoringMap(map, false);
  }
}

export interface CommandRequest { commandId: string; expectedRevision: number; command: Command }

export function validateCommandRequest(value: unknown): CommandRequest {
  rejectUnsafe(value);
  const envelope = object(value, 'Request'); keys(envelope, ['commandId', 'expectedRevision', 'command']);
  string(envelope.commandId, 'commandId', 160); integer(envelope.expectedRevision, 'expectedRevision');
  const command = object(envelope.command, 'Command'); string(command.type, 'Command type');
  switch (command.type) {
    case 'league.rename': keys(command, ['type', 'name']); string(command.name, 'League name', 100); break;
    case 'rules.update': keys(command, ['type', 'rules']); validateRules(command.rules); break;
    case 'draft.start': case 'draft.pause': case 'draft.resume': case 'draft.autopick': case 'fixture.draftRemaining': case 'fixture.playRound': case 'round.advance': keys(command, ['type']); break;
    case 'draft.pick':
      keys(command, ['type', 'teamId', 'playerId', 'expectedPickIndex']);
      string(command.teamId, 'teamId'); string(command.playerId, 'playerId'); integer(command.expectedPickIndex, 'expectedPickIndex'); break;
    case 'draft.queue':
      keys(command, ['type', 'teamId', 'playerIds']); string(command.teamId, 'teamId'); strings(command.playerIds, 'playerIds');
      if (new Set(command.playerIds).size !== command.playerIds.length) invalid('Queue players must be unique.'); break;
    case 'lineup.set': {
      keys(command, ['type', 'teamId', 'lineup']); string(command.teamId, 'teamId');
      const lineup = object(command.lineup, 'Lineup');
      for (const [slot, player] of Object.entries(lineup)) { if (!slots.has(slot)) invalid(`Unsupported slot: ${slot}.`); string(player, 'Lineup player'); }
      if (new Set(Object.values(lineup)).size !== Object.values(lineup).length) invalid('A player cannot start in two slots.'); break;
    }
    case 'feed.game': {
      keys(command, ['type', 'game']); const game = object(command.game, 'Game');
      keys(game, ['id', 'round', 'nflTeams', 'startsAt', 'status', 'winner', 'sourceRevision'], ['completedAt']);
      string(game.id, 'Game id'); integer(game.round, 'Game round'); if (game.round < 1 || game.round > 4) invalid('Game round must be 1–4.');
      strings(game.nflTeams, 'NFL teams', 2); if (game.nflTeams.length !== 2 || game.nflTeams[0] === game.nflTeams[1]) invalid('A game needs two distinct NFL teams.');
      number(game.startsAt, 'Game start'); integer(game.sourceRevision, 'Source revision');
      if (Object.hasOwn(game, 'completedAt')) {
        number(game.completedAt, 'Game completion');
        if (game.completedAt < game.startsAt) invalid('Game completion cannot precede its start.');
      }
      if (!['scheduled', 'live', 'final'].includes(game.status as string)) invalid('Unsupported game status.');
      if (game.winner !== null && !game.nflTeams.includes(game.winner as string)) invalid('Winner must belong to the game.'); break;
    }
    case 'feed.stats': {
      keys(command, ['type', 'fact']); const fact = object(command.fact, 'Stat fact');
      keys(fact, ['gameId', 'playerId', 'sourceRevision', 'stats', 'winBonusEligible']);
      string(fact.gameId, 'gameId'); string(fact.playerId, 'playerId'); integer(fact.sourceRevision, 'Source revision');
      if (fact.winBonusEligible !== null) boolean(fact.winBonusEligible, 'winBonusEligible');
      for (const [key, amount] of Object.entries(object(fact.stats, 'Statistics'))) { if (!statKeys.has(key as StatKey)) invalid(`Unsupported statistic: ${key}.`); number(amount, key); } break;
    }
    case 'matchup.settle':
      keys(command, ['type', 'matchupId', 'reason'], ['winnerTeamId']); string(command.matchupId, 'matchupId'); string(command.reason, 'Settlement reason', 1000);
      if (command.winnerTeamId !== undefined) string(command.winnerTeamId, 'winnerTeamId'); break;
    case 'matchup.keepPublished':
      keys(command, ['type', 'matchupId', 'reason']); string(command.matchupId, 'matchupId'); string(command.reason, 'Review decision reason', 1000); break;
    default: invalid('Unsupported command type.');
  }
  return value as CommandRequest;
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
