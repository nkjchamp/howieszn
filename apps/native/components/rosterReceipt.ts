import type { Matchup } from '@howieszn/domain';

export type CaptureReceipt =
  | { kind: 'receipt'; beforeIds: string[]; capturedIds: string[]; allIds: string[] }
  | { kind: 'winner-changed'; winnerTeamId: string }
  | { kind: 'unavailable' };

/** A historical capture is reconstructed from its receipt, never a team's live roster. */
export function getCaptureReceipt(matchup: Matchup, teamId: string): CaptureReceipt {
  if (matchup.winnerTeamId && matchup.winnerTeamId !== teamId) {
    return { kind: 'winner-changed', winnerTeamId: matchup.winnerTeamId };
  }
  const index = matchup.teamIds.indexOf(teamId);
  if (!matchup.winnerTeamId || index < 0 || !matchup.rostersAtSettlement) return { kind: 'unavailable' };
  const beforeIds = [...new Set(matchup.rostersAtSettlement[index])];
  const capturedIds = [...new Set(matchup.capturedPlayerIds)];
  return { kind: 'receipt', beforeIds, capturedIds, allIds: [...new Set([...beforeIds, ...capturedIds])] };
}
