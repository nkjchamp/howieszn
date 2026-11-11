import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, computeMatchup, createFixtureLeague } from '@howieszn/domain';
import { getCaptureReceipt } from './rosterReceipt.ts';

function settledFixture(benchAllocation: 'team' | 'manager') {
  let state = createFixtureLeague({ now: 0 });
  const context = { actorId: 'alex', now: 1 };
  state.rules.benchAllocation = benchAllocation;
  state = applyCommand(state, { type: 'draft.start' }, context);
  state = applyCommand(state, { type: 'fixture.draftRemaining' }, context);
  state = applyCommand(state, { type: 'fixture.playRound' }, context);
  const matchup = state.matchups[0];
  const computed = computeMatchup(state, matchup.id);
  state = applyCommand(state, { type: 'matchup.settle', matchupId: matchup.id,
    winnerTeamId: computed.winnerTeamId || matchup.teamIds[0], reason: 'Explicit fixture receipt verification' }, context);
  return { state, matchup: state.matchups[0] };
}

test('a historical capture remains complete after the winning team later loses its live roster', () => {
  const { state, matchup } = settledFixture('team');
  const winner = state.teams.find(team => team.id === matchup.winnerTeamId)!;
  const receipt = getCaptureReceipt(matchup, winner.id);
  assert.equal(receipt.kind, 'receipt');
  if (receipt.kind !== 'receipt') return;
  assert.equal(receipt.allIds.length, 12);
  winner.playerIds = [];
  winner.eliminatedRound = 2;
  assert.deepEqual(getCaptureReceipt(matchup, winner.id), receipt);
});

test('shared-bench captures appear in the receipt even though they are not added to the winning team roster', () => {
  const { state, matchup } = settledFixture('manager');
  const winner = state.teams.find(team => team.id === matchup.winnerTeamId)!;
  const manager = state.managers.find(value => value.id === winner.managerId)!;
  const receipt = getCaptureReceipt(matchup, winner.id);
  assert.equal(receipt.kind, 'receipt');
  if (receipt.kind !== 'receipt') return;
  assert.equal(winner.playerIds.length, 6);
  assert.equal(receipt.beforeIds.length, 6);
  assert.equal(receipt.capturedIds.length, 6);
  assert.equal(receipt.allIds.length, 12);
  assert.ok(receipt.capturedIds.every(id => manager.benchPlayerIds.includes(id)));
  assert.equal(new Set(receipt.allIds).size, receipt.allIds.length);
});

test('a correction changing the published winner cannot relabel that receipt as the old winner', () => {
  const { matchup } = settledFixture('team');
  const oldWinner = matchup.winnerTeamId!;
  matchup.winnerTeamId = matchup.teamIds.find(id => id !== oldWinner)!;
  assert.deepEqual(getCaptureReceipt(matchup, oldWinner), { kind: 'winner-changed', winnerTeamId: matchup.winnerTeamId });
});
