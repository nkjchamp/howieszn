export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';
export type Slot = 'SFLEX' | 'WR' | 'RB' | 'TE' | 'DEF/K' | 'FLEX';
export type ManagerCount = 2 | 4 | 8 | 16;
export type StatKey = 'passingYards' | 'passingTouchdowns' | 'interceptions' | 'rushingYards' | 'rushingTouchdowns' | 'receptions' | 'receivingYards' | 'receivingTouchdowns' | 'fumblesLost' | 'extraPoints' | 'fieldGoals' | 'sacks' | 'defensiveInterceptions' | 'defensiveTouchdowns' | 'nflTeamWins';
export interface ScoringRule { enabled: boolean; value: number; mode: 'points' | 'yardsPerPoint' }
export interface LeagueRules {
  ownership: 'team' | 'manager';
  benchAllocation: 'team' | 'manager';
  assignmentLock: 'round-start' | 'player-kickoff';
  fractionalYardage: boolean;
  correctionWindowHours: number;
  scoring: { base: Record<StatKey, ScoringRule>; positions: Partial<Record<Position, Partial<Record<StatKey, ScoringRule>>>> };
}
export interface Manager { id: string; name: string; commissioner: boolean; benchPlayerIds: string[] }
export interface Player { id: string; name: string; position: Position; nflTeam: string; rank: number; fixture: true }
export interface Team { id: string; name: string; managerId: string; playerIds: string[]; lineup: Partial<Record<Slot, string>>; lineups: Record<string, Partial<Record<Slot, string>>>; eliminatedRound: number | null }
export interface DraftPick { index: number; round: number; teamId: string; playerId: string | null; source: 'manager' | 'autopick' | 'fixture' }
export interface Draft { status: 'lobby' | 'running' | 'paused' | 'complete'; order: string[]; picks: DraftPick[]; queues: Record<string, string[]> }
export interface Game { id: string; round: number; nflTeams: [string, string]; startsAt: number; completedAt?: number; status: 'scheduled' | 'live' | 'final'; winner: string | null; sourceRevision: number }
export interface StatFact { gameId: string; playerId: string; sourceRevision: number; stats: Partial<Record<StatKey, number>>; winBonusEligible: boolean | null }
export interface ScorePart { key: StatKey | 'roundingAdjustment'; label: string; raw: number; value: number; points: number }
export interface Score { total: number; parts: ScorePart[]; provisional: boolean; issues: string[] }
export interface Matchup {
  id: string; round: number; teamIds: [string, string]; status: 'provisional' | 'ready' | 'tied' | 'settled' | 'review';
  winnerTeamId: string | null; capturedPlayerIds: string[]; settlementReason: string | null; settledAt: number | null;
  scoreAtSettlement: [number, number] | null;
  manualResolution: boolean;
  rostersAtSettlement?: [string[], string[]] | null;
  lineupsAtSettlement?: [Partial<Record<Slot,string>>, Partial<Record<Slot,string>>] | null;
  correction?: CorrectionMetadata | null;
}
export interface CorrectionMetadata {
  status: 'applied' | 'pending' | 'kept';
  reason: string;
  detectedAt: number;
  previousWinnerTeamId: string | null;
  previousScores: [number, number];
  proposedWinnerTeamId: string | null;
  proposedScores: [number, number];
  windowClosesAt: number | null;
  nextRoundStarted: boolean;
  requiresLineupReview: boolean;
  decisionReason?: string;
}
export interface MatchupComputation { matchupId: string; scores: [number, number]; survivingStarters: [number, number]; winnerTeamId: string | null; status: 'provisional' | 'ready' | 'tied'; issues: string[] }
export interface AuditEvent { id: string; revision: number; at: number; actorId: string; type: string; summary: string }
export interface LeagueState {
  id: string; name: string; revision: number; phase: 'setup' | 'draft' | 'active' | 'archived'; round: number;
  managers: Manager[]; teams: Team[]; players: Player[]; rules: LeagueRules; draft: Draft;
  games: Game[]; stats: StatFact[]; matchups: Matchup[]; audit: AuditEvent[];
  byeTeams?: Record<string, string[]>;
  roundFirstKickoffAt?: Record<string, number>;
  fixture: true;
}
export interface CommandContext { actorId: string; now: number }
export type Command =
  | { type: 'league.rename'; name: string }
  | { type: 'rules.update'; rules: LeagueRules }
  | { type: 'draft.start' }
  | { type: 'draft.pick'; teamId: string; playerId: string; expectedPickIndex: number }
  | { type: 'draft.queue'; teamId: string; playerIds: string[] }
  | { type: 'draft.pause' }
  | { type: 'draft.resume' }
  | { type: 'draft.autopick' }
  | { type: 'fixture.draftRemaining' }
  | { type: 'lineup.set'; teamId: string; lineup: Partial<Record<Slot, string>> }
  | { type: 'feed.game'; game: Game }
  | { type: 'feed.stats'; fact: StatFact }
  | { type: 'fixture.playRound' }
  | { type: 'matchup.settle'; matchupId: string; winnerTeamId?: string; reason: string }
  | { type: 'matchup.keepPublished'; matchupId: string; reason: string }
  | { type: 'round.advance' };
export class DomainError extends Error {
  code: string;
  details: Record<string, unknown>;
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message); this.name = 'DomainError'; this.code = code; this.details = details;
  }
}
