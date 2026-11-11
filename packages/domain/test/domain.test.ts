import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, canAssignLineup, computeMatchup, createFixtureLeague, DomainError, fitRoster, getCurrentDraftTeam, getPublicView, playerGame, scorePlayer, scoreTeam } from '../src/index.ts';
import type { Command, LeagueState, ManagerCount, Matchup, Slot, StatKey } from '../src/index.ts';

const context={actorId:'alex',now:100};
function run(state:LeagueState,command:Command,actorId='alex',now=100){return applyCommand(state,command,{actorId,now});}
function drafted(bench:'team'|'manager'='team') {let state=createFixtureLeague({now:0});if(bench==='manager'){const rules=structuredClone(state.rules);rules.benchAllocation='manager';state=run(state,{type:'rules.update',rules});}state=run(state,{type:'draft.start'});return run(state,{type:'fixture.draftRemaining'});}
function play(state:LeagueState){return run(state,{type:'fixture.playRound'});}
function settleAll(state:LeagueState,choose?:(m:Matchup,state:LeagueState)=>string){for(const m of state.matchups.filter(m=>m.round===state.round)){const result=computeMatchup(state,m.id),winner=choose?.(m,state)||result.winnerTeamId||m.teamIds[0];state=run(state,{type:'matchup.settle',matchupId:m.id,winnerTeamId:winner,reason:'Explicit local replay resolution'});}return state;}
function expectCode(fn:()=>unknown,code:string){assert.throws(fn,(e:unknown)=>e instanceof DomainError&&e.code===code);}

test('manager counts divide sixteen, with separate teams and fixture NFL byes',()=>{
  for(const managerCount of [2,4,8,16] as ManagerCount[]){const s=createFixtureLeague({managerCount,now:0});assert.equal(s.teams.length,16);assert.equal(s.managers.length,managerCount);for(const m of s.managers)assert.equal(s.teams.filter(t=>t.managerId===m.id).length,16/managerCount);assert.equal(s.games.length,6);assert.equal(new Set(s.players.map(p=>p.nflTeam)).size,14);}
});

test('draft commands are immutable, team-aware, permission-checked, and queue-private',()=>{
  const original=createFixtureLeague({now:0});let state=run(original,{type:'draft.start'});assert.equal(original.phase,'setup');
  state=run(state,{type:'draft.queue',teamId:'alex-1',playerIds:['player-3','player-4']});
  state=run(state,{type:'draft.queue',teamId:'jordan-1',playerIds:['player-3']},'jordan');
  assert.equal(getPublicView(state,'alex').draft.queues['jordan-1'],undefined);
  assert.deepEqual(getPublicView(state,'alex').draft.queues['alex-1'],['player-3','player-4']);
  assert.ok(state.audit.every(a=>!a.summary.includes('Lamar')));
  expectCode(()=>run(state,{type:'draft.queue',teamId:'jordan-1',playerIds:[]}), 'FORBIDDEN');
  expectCode(()=>run(state,{type:'draft.pick',teamId:'alex-2',playerId:'player-3',expectedPickIndex:0}),'TURN_CHANGED');
  state=run(state,{type:'draft.pick',teamId:'alex-1',playerId:'player-3',expectedPickIndex:0});
  assert.equal(state.teams.find(t=>t.id==='alex-1')!.playerIds[0],'player-3');
  assert.ok(Object.values(state.draft.queues).every(q=>!q.includes('player-3')));
  expectCode(()=>run(state,{type:'draft.pick',teamId:'jordan-1',playerId:'player-4',expectedPickIndex:1}),'FORBIDDEN');
  expectCode(()=>run(state,{type:'draft.pick',teamId:'jordan-1',playerId:'player-4',expectedPickIndex:0},'jordan'),'TURN_CHANGED');
});

test('snake simulation produces ninety-six unique legal picks without extra bench capacity',()=>{
  const s=drafted();assert.equal(s.draft.picks.length,96);assert.equal(s.phase,'active');assert.equal(s.draft.status,'complete');
  assert.equal(new Set(s.draft.picks.map(p=>p.playerId)).size,96);
  assert.deepEqual(s.draft.picks.slice(16,32).map(p=>p.teamId),s.draft.order.slice().reverse());
  for(const t of s.teams){assert.equal(t.playerIds.length,6);assert.equal(Object.keys(t.lineup).length,6);assert.ok(fitRoster(s.players.filter(p=>t.playerIds.includes(p.id))));}
  const qbs=s.players.filter(p=>p.position==='QB').slice(0,2);assert.equal(fitRoster(qbs),null);
});

test('autopick uses the active team queue; pause and completed draft are enforced',()=>{
  let s=createFixtureLeague({now:0});s=run(s,{type:'draft.queue',teamId:'alex-1',playerIds:['player-3']});s=run(s,{type:'draft.start'});
  s=run(s,{type:'draft.pause'});expectCode(()=>run(s,{type:'draft.autopick'}),'DRAFT_NOT_RUNNING');s=run(s,{type:'draft.resume'});s=run(s,{type:'draft.autopick'});assert.equal(s.draft.picks[0].teamId,'alex-1');assert.equal(s.draft.picks[0].playerId,'player-3');
  s=run(s,{type:'fixture.draftRemaining'});expectCode(()=>run(s,{type:'draft.autopick'}),'DRAFT_NOT_RUNNING');
});

test('position-specific NFL wins follow explicit eligibility and do not accumulate duplicate facts',()=>{
  let s=createFixtureLeague({now:0});const rules=structuredClone(s.rules);for(const r of Object.values(rules.scoring.base))r.enabled=false;
  rules.scoring.positions.QB={nflTeamWins:{enabled:true,value:5,mode:'points'}};rules.scoring.positions.RB={nflTeamWins:{enabled:true,value:2,mode:'points'}};
  s=run(s,{type:'rules.update',rules});const qb=s.players.find(p=>p.position==='QB'&&p.nflTeam==='BAL')!,wr=s.players.find(p=>p.position==='WR'&&p.nflTeam==='BAL')!,rb=s.players.find(p=>p.position==='RB'&&p.nflTeam==='BAL')!;
  const g=playerGame(s,qb)!;s=run(s,{type:'feed.game',game:{...g,status:'final',winner:'BAL',sourceRevision:1}});
  for(const p of [qb,wr,rb])s=run(s,{type:'feed.stats',fact:{gameId:g.id,playerId:p.id,sourceRevision:1,stats:{},winBonusEligible:true}});
  assert.equal(scorePlayer(s,qb.id).total,5);assert.equal(scorePlayer(s,wr.id).total,0);assert.equal(scorePlayer(s,rb.id).total,2);
  const revision=s.revision;s=run(s,{type:'feed.stats',fact:{gameId:g.id,playerId:qb.id,sourceRevision:1,stats:{passingTouchdowns:100},winBonusEligible:true}});assert.equal(s.revision,revision);assert.equal(scorePlayer(s,qb.id).total,5);
  s=run(s,{type:'feed.stats',fact:{gameId:g.id,playerId:qb.id,sourceRevision:2,stats:{},winBonusEligible:null}});assert.equal(scorePlayer(s,qb.id).total,0);assert.equal(scorePlayer(s,qb.id).provisional,true);assert.match(scorePlayer(s,qb.id).issues.join(' '),/eligibility/);
});

test('rational yardage rounding includes a reconciling adjustment instead of losing cents',()=>{
  let s=createFixtureLeague({now:0});const rules=structuredClone(s.rules);for(const r of Object.values(rules.scoring.base))r.enabled=false;
  for(const key of ['passingYards','rushingYards','receivingYards'] as StatKey[])rules.scoring.base[key]={enabled:true,value:3,mode:'yardsPerPoint'};
  s=run(s,{type:'rules.update',rules});const qb=s.players.find(p=>p.position==='QB'&&p.nflTeam==='BAL')!,g=playerGame(s,qb)!;s=run(s,{type:'feed.game',game:{...g,status:'final',winner:'BAL',sourceRevision:1}});
  s=run(s,{type:'feed.stats',fact:{gameId:g.id,playerId:qb.id,sourceRevision:1,stats:{passingYards:1,rushingYards:1,receivingYards:1},winBonusEligible:false}});
  const result=scorePlayer(s,qb.id);assert.equal(result.total,1);assert.equal(Math.round(result.parts.reduce((n,p)=>n+p.points,0)*100),100);assert.equal(result.parts.at(-1)!.key,'roundingAdjustment');
});

test('lineup rejects duplicates, foreign players, ineligible positions, and started outgoing/incoming players',()=>{
  let s=drafted();const t=s.teams.find(t=>t.id==='alex-1')!,other=s.teams.find(t=>t.id==='jordan-1')!,wr=t.playerIds.map(id=>s.players.find(p=>p.id===id)!).find(p=>p.position==='WR')!;
  assert.equal(canAssignLineup(s,t.id,{WR:wr.id,FLEX:wr.id},100).code,'DUPLICATE_PLAYER');
  assert.equal(canAssignLineup(s,t.id,{SFLEX:other.lineup.SFLEX},100).code,'FOREIGN_PLAYER');
  const qb=t.playerIds.map(id=>s.players.find(p=>p.id===id)!).find(p=>p.position==='QB')!;
  assert.equal(canAssignLineup(s,t.id,{WR:qb.id},100).code,'INELIGIBLE_POSITION');
  const active=t.playerIds.map(id=>s.players.find(p=>p.id===id)!).find(p=>playerGame(s,p))!,slot=Object.entries(t.lineup).find(([,id])=>id===active.id)![0] as Slot,g=playerGame(s,active)!;
  const without={...t.lineup};delete without[slot];assert.equal(canAssignLineup(s,t.id,without,g.startsAt).code,'PLAYER_LOCKED');
  s=run(s,{type:'lineup.set',teamId:t.id,lineup:without});assert.equal(canAssignLineup(s,t.id,t.lineup,g.startsAt).code,'PLAYER_LOCKED');
});

test('team-bench capture is atomic/idempotent and preserves historical scores across later lineup edits',()=>{
  let s=play(drafted());const m=s.matchups[0],c=computeMatchup(s,m.id),winner=c.winnerTeamId!,loser=m.teamIds.find(id=>id!==winner)!,beforeWinner=scoreTeam(s,winner).total,beforeLoser=scoreTeam(s,loser).total,captured=[...s.teams.find(t=>t.id===loser)!.playerIds];
  s=run(s,{type:'matchup.settle',matchupId:m.id,reason:'Explicit replay settlement'});assert.deepEqual(s.matchups[0].capturedPlayerIds,captured);assert.equal(s.teams.find(t=>t.id===winner)!.playerIds.length,12);assert.equal(s.teams.find(t=>t.id===loser)!.playerIds.length,0);assert.equal(scoreTeam(s,winner).total,beforeWinner);assert.equal(scoreTeam(s,loser).total,beforeLoser);
  const revision=s.revision;s=run(s,{type:'matchup.settle',matchupId:m.id,reason:'Retry'});assert.equal(s.revision,revision);assert.equal(s.teams.find(t=>t.id===winner)!.playerIds.length,12);
  s=settleAll(s);s=run(s,{type:'round.advance'});const wt=s.teams.find(t=>t.id===winner)!;s=run(s,{type:'lineup.set',teamId:winner,lineup:{}},wt.managerId);assert.equal(scoreTeam(s,winner,1).total,beforeWinner);assert.equal(scoreTeam(s,loser,1).total,beforeLoser);
});

test('manager-bench capture transfers only losing starters and preserves unassigned reserves, independently of ownership',()=>{
  let s=drafted('manager');const loser=s.teams.find(t=>t.id==='jordan-1')!,lineup={...loser.lineup},slot=Object.keys(lineup)[0] as Slot,reserve=lineup[slot]!;delete lineup[slot];
  s=run(s,{type:'lineup.set',teamId:loser.id,lineup},'jordan');assert.ok(s.managers.find(m=>m.id==='jordan')!.benchPlayerIds.includes(reserve));s=play(s);const m=s.matchups[0],result=computeMatchup(s,m.id);assert.equal(result.winnerTeamId,'alex-1');
  const expected=Object.values(s.teams.find(t=>t.id===loser.id)!.lineup);s=run(s,{type:'matchup.settle',matchupId:m.id,reason:'Shared reserve replay'});
  assert.deepEqual(s.matchups[0].capturedPlayerIds,expected);assert.equal(s.teams.find(t=>t.id==='alex-1')!.playerIds.length,6);assert.ok(expected.every(id=>s.managers.find(m=>m.id==='alex')!.benchPlayerIds.includes(id)));assert.ok(s.managers.find(m=>m.id==='jordan')!.benchPlayerIds.includes(reserve));assert.ok(!s.managers.find(m=>m.id==='alex')!.benchPlayerIds.includes(reserve));
});

test('same-manager zero-point tie does not silently select a fallback',()=>{
  let s=drafted();s.matchups[0].teamIds=['alex-1','alex-2'];for(const teamId of s.matchups[0].teamIds)s=run(s,{type:'lineup.set',teamId,lineup:{}});s=play(s);assert.equal(computeMatchup(s,s.matchups[0].id).status,'tied');
  expectCode(()=>run(s,{type:'matchup.settle',matchupId:s.matchups[0].id,reason:'No arbitrary fallback'}),'NEEDS_RESOLUTION');
  expectCode(()=>run(s,{type:'matchup.settle',matchupId:s.matchups[0].id,winnerTeamId:'alex-1',reason:''}),'REASON_REQUIRED');
  s=run(s,{type:'matchup.settle',matchupId:s.matchups[0].id,winnerTeamId:'alex-1',reason:'Explicit local replay decision, not adopted league policy'});assert.equal(s.matchups[0].manualResolution,true);
});

function correctionFixture(bench:'team'|'manager'='team'){
  let s=play(drafted(bench));const m=s.matchups[0],winner=computeMatchup(s,m.id).winnerTeamId!;s=run(s,{type:'matchup.settle',matchupId:m.id,reason:'Publish fixture result'});
  const loser=m.teamIds.find(id=>id!==winner)!,p=Object.values(s.teams.find(t=>t.id===loser)!.lineups['1']).map(id=>s.players.find(p=>p.id===id)!).find(p=>p.position==='WR'&&playerGame(s,p,1))!,fact=s.stats.find(f=>f.playerId===p.id&&f.gameId===playerGame(s,p,1)!.id)!;
  return {state:s,matchupId:m.id,oldWinner:winner,newWinner:loser,fact:{...fact,sourceRevision:fact.sourceRevision+1,stats:{...fact.stats,receivingYards:(fact.stats.receivingYards||0)+1000}}};
}

test('early source correction reverses the old capture and applies the new capture exactly once',()=>{
  const fixture=correctionFixture();let s=run(fixture.state,{type:'feed.stats',fact:fixture.fact},'alex',200);const m=s.matchups.find(m=>m.id===fixture.matchupId)!;
  assert.equal(m.status,'settled');assert.equal(m.winnerTeamId,fixture.newWinner);assert.equal(m.correction?.status,'applied');assert.equal(m.correction?.previousWinnerTeamId,fixture.oldWinner);
  assert.equal(s.teams.find(t=>t.id===fixture.oldWinner)!.playerIds.length,0);assert.equal(s.teams.find(t=>t.id===fixture.newWinner)!.playerIds.length,12);
  assert.equal(new Set(s.teams.flatMap(t=>t.playerIds)).size,96);
  const before=JSON.stringify(s.teams.map(t=>[t.id,t.playerIds]));s=run(s,{type:'feed.stats',fact:{...fixture.fact,sourceRevision:fixture.fact.sourceRevision+1}},'alex',300);assert.equal(JSON.stringify(s.teams.map(t=>[t.id,t.playerIds])),before);
});

test('early correction updates an already-created next pairing and initializes the new team before kickoff',()=>{
  const fixture=correctionFixture();let s=run(settleAll(fixture.state),{type:'round.advance'});assert.equal(s.round,2);
  s=run(s,{type:'feed.stats',fact:fixture.fact},'alex',200);const m=s.matchups.find(m=>m.id===fixture.matchupId)!,next=s.matchups.find(m=>m.round===2&&m.teamIds.includes(fixture.newWinner))!;
  assert.ok(next);assert.ok(!s.matchups.filter(m=>m.round===2).some(m=>m.teamIds.includes(fixture.oldWinner)));assert.equal(next.status,'provisional');assert.equal(m.correction?.requiresLineupReview,true);assert.equal(s.teams.find(t=>t.id===fixture.newWinner)!.eliminatedRound,null);
  const advanced=s.teams.find(t=>t.id===fixture.newWinner)!;assert.deepEqual(advanced.lineups['2'],advanced.lineups['1']);assert.ok(Object.values(advanced.lineup).every(id=>advanced.playerIds.includes(id)));
});

test('advancing merges a pre-fetched schedule without replacing source facts or duplicating IDs/NFL teams',()=>{
  for(const [id,nflTeams] of [['fixture-r2-g1',['BUF','BAL']],['source-divisional-a',['BUF','KC']]] as [string,[string,string]][]){
    let s=settleAll(play(drafted()));const source={id,round:2,nflTeams,startsAt:7*86400000,status:'scheduled' as const,winner:null,sourceRevision:7};s=run(s,{type:'feed.game',game:source});s=run(s,{type:'round.advance'});
    const games=s.games.filter(g=>g.round===2);assert.equal(games.length,4);assert.equal(new Set(games.map(g=>g.id)).size,4);assert.equal(new Set(games.flatMap(g=>g.nflTeams)).size,8);assert.deepEqual(games.find(g=>g.id===id),source);assert.equal(computeMatchup(s,s.matchups.find(m=>m.round===2)!.id).issues.includes('NFL round schedule is incomplete'),false);
  }
});

test('correction must arrive strictly before cutoff; exact-deadline and later proposals preserve publication',()=>{
  const fixture=correctionFixture(),end=100+48*3600000;
  const inside=run(fixture.state,{type:'feed.stats',fact:fixture.fact},'alex',end-1);assert.equal(inside.matchups[0].correction?.status,'applied');const atCutoff=run(fixture.state,{type:'feed.stats',fact:fixture.fact},'alex',end);assert.equal(atCutoff.matchups[0].correction?.status,'pending');assert.equal(atCutoff.matchups[0].winnerTeamId,fixture.oldWinner);assert.deepEqual(atCutoff.matchups[0].scoreAtSettlement,fixture.state.matchups[0].scoreAtSettlement);
  let late=run(fixture.state,{type:'feed.stats',fact:fixture.fact},'alex',end+1);const m=late.matchups[0];assert.equal(m.status,'review');assert.equal(m.winnerTeamId,fixture.oldWinner);assert.deepEqual(m.scoreAtSettlement,fixture.state.matchups[0].scoreAtSettlement);assert.equal(m.correction?.status,'pending');assert.equal(m.correction?.proposedWinnerTeamId,fixture.newWinner);assert.equal(m.correction?.nextRoundStarted,false);assert.equal(JSON.stringify(late.teams),JSON.stringify(fixture.state.teams));
  assert.equal(canAssignLineup(late,fixture.oldWinner,late.teams.find(t=>t.id===fixture.oldWinner)!.lineup,end+1).ok,true);
  expectCode(()=>run(late,{type:'matchup.keepPublished',matchupId:m.id,reason:''}),'REASON_REQUIRED');
  late=run(late,{type:'matchup.keepPublished',matchupId:m.id,reason:'Keep completed league result after the configured cutoff'},'alex',end+2);assert.equal(late.matchups[0].status,'settled');assert.equal(late.matchups[0].correction?.status,'kept');assert.equal(late.matchups[0].winnerTeamId,fixture.oldWinner);
  late=run(late,{type:'feed.stats',fact:{...fixture.fact,sourceRevision:fixture.fact.sourceRevision+1}},'alex',end+3);assert.equal(late.matchups[0].correction?.status,'kept');
});

test('a newer source fact that restores publication clears the obsolete pending proposal and review block',()=>{
  const fixture=correctionFixture(),original=fixture.state.stats.find(f=>f.gameId===fixture.fact.gameId&&f.playerId===fixture.fact.playerId)!;let s=run(fixture.state,{type:'feed.stats',fact:fixture.fact},'alex',100+49*3600000);assert.equal(s.matchups[0].correction?.status,'pending');
  const ownership=JSON.stringify(s.teams.map(t=>[t.id,t.playerIds]));s=run(s,{type:'feed.stats',fact:{...original,sourceRevision:fixture.fact.sourceRevision+1}},'alex',101+49*3600000);assert.equal(s.matchups[0].status,'settled');assert.equal(s.matchups[0].correction,null);assert.equal(s.matchups[0].winnerTeamId,fixture.oldWinner);assert.equal(JSON.stringify(s.teams.map(t=>[t.id,t.playerIds])),ownership);expectCode(()=>run(s,{type:'matchup.keepPublished',matchupId:fixture.matchupId,reason:'No longer needed'}),'NO_PENDING_CORRECTION');s=run(settleAll(s),{type:'round.advance'});assert.equal(s.round,2);
});

test('starting the next NFL round prevents automatic reversal even inside the configured window',()=>{
  const fixture=correctionFixture();let s=run(settleAll(fixture.state),{type:'round.advance'});const next=s.games.find(g=>g.round===2)!;s=run(s,{type:'feed.game',game:{...next,startsAt:150,status:'live',sourceRevision:next.sourceRevision+1}},'alex',200);
  const ownership=JSON.stringify(s.teams.map(t=>[t.id,t.playerIds]));s=run(s,{type:'feed.stats',fact:fixture.fact},'alex',201);assert.equal(s.matchups[0].winnerTeamId,fixture.oldWinner);assert.equal(s.matchups[0].correction?.status,'pending');assert.equal(s.matchups[0].correction?.nextRoundStarted,true);assert.equal(JSON.stringify(s.teams.map(t=>[t.id,t.playerIds])),ownership);
});

test('a completed next round is not historically rewound by a late source correction',()=>{
  const fixture=correctionFixture();let s=run(settleAll(fixture.state),{type:'round.advance'});s=run(settleAll(play(s)),{type:'round.advance'});const ownership=JSON.stringify(s.teams.map(t=>[t.id,t.playerIds])),roundTwo=s.matchups.filter(m=>m.round===2).map(m=>[m.id,m.winnerTeamId,m.status]);
  s=run(s,{type:'feed.stats',fact:fixture.fact},'alex',300);assert.equal(s.matchups[0].correction?.nextRoundStarted,true);assert.equal(JSON.stringify(s.teams.map(t=>[t.id,t.playerIds])),ownership);assert.deepEqual(s.matchups.filter(m=>m.round===2).map(m=>[m.id,m.winnerTeamId,m.status]),roundTwo);
});

test('unknown completion or next-kickoff timestamps cannot silently authorize automatic reversal',()=>{
  const fixture=correctionFixture(),legacy=structuredClone(fixture.state);for(const game of legacy.games)delete game.completedAt;
  const unknownFinish=run(legacy,{type:'feed.stats',fact:fixture.fact},'alex',200);assert.equal(unknownFinish.matchups[0].correction?.status,'pending');assert.equal(unknownFinish.matchups[0].correction?.windowClosesAt,null);assert.match(unknownFinish.matchups[0].correction!.reason,/completion timestamp/);
  const missingNext=structuredClone(fixture.state);delete missingNext.roundFirstKickoffAt;
  const unknownNext=run(missingNext,{type:'feed.stats',fact:fixture.fact},'alex',200);assert.equal(unknownNext.matchups[0].correction?.status,'pending');assert.match(unknownNext.matchups[0].correction!.reason,/kickoff is unknown/);
});

test('shared-bench reversal preserves unassigned manager reserves and swaps only frozen starters',()=>{
  let s=drafted('manager');const jordan=s.teams.find(t=>t.id==='jordan-1')!,lineup={...jordan.lineup},slot=Object.keys(lineup)[0] as Slot,reserve=lineup[slot]!;delete lineup[slot];s=run(s,{type:'lineup.set',teamId:jordan.id,lineup},'jordan');s=play(s);const m=s.matchups[0];s=run(s,{type:'matchup.settle',matchupId:m.id,reason:'Publish shared-bench fixture'});assert.equal(s.matchups[0].winnerTeamId,'alex-1');
  const p=Object.values(jordan.lineups['1']).map(id=>s.players.find(p=>p.id===id)!).find(p=>p.position==='WR')!,fact=s.stats.find(f=>f.playerId===p.id)!;
  s=run(s,{type:'feed.stats',fact:{...fact,sourceRevision:fact.sourceRevision+1,stats:{...fact.stats,receivingYards:(fact.stats.receivingYards||0)+1000}}},'alex',200);
  assert.equal(s.matchups[0].winnerTeamId,'jordan-1');assert.equal(s.matchups[0].capturedPlayerIds.length,6);assert.equal(s.teams.find(t=>t.id==='jordan-1')!.playerIds.length,5);assert.ok(s.managers.find(m=>m.id==='jordan')!.benchPlayerIds.includes(reserve));assert.equal(s.managers.find(m=>m.id==='alex')!.benchPlayerIds.length,0);
  const owned=[...s.teams.flatMap(t=>t.playerIds),...s.managers.flatMap(m=>m.benchPlayerIds)];assert.equal(owned.length,96);assert.equal(new Set(owned).size,96);
});

test('shared-bench reversal returns an unrelated next-round assignment instead of orphaning it',()=>{
  const fixture=correctionFixture('manager');let s=run(settleAll(fixture.state),{type:'round.advance'});const m=s.matchups.find(m=>m.id===fixture.matchupId)!,affected=new Set(m.rostersAtSettlement!.flat()),manager=s.managers.find(m=>m.id==='alex')!;const reserve=manager.benchPlayerIds.map(id=>s.players.find(p=>p.id===id)!).find(p=>!affected.has(p.id)&&p.position==='QB')!;assert.ok(reserve);
  s=run(s,{type:'lineup.set',teamId:fixture.oldWinner,lineup:{SFLEX:reserve.id}},'alex',200);assert.ok(s.teams.find(t=>t.id===fixture.oldWinner)!.playerIds.includes(reserve.id));
  s=run(s,{type:'feed.stats',fact:fixture.fact},'alex',300);assert.equal(s.matchups.find(m=>m.id===fixture.matchupId)!.winnerTeamId,fixture.newWinner);assert.ok(s.managers.find(m=>m.id==='alex')!.benchPlayerIds.includes(reserve.id));assert.ok(!s.teams.some(t=>t.playerIds.includes(reserve.id)));
  const owned=[...s.teams.flatMap(t=>t.playerIds),...s.managers.flatMap(m=>m.benchPlayerIds)];assert.equal(owned.length,96);assert.equal(new Set(owned).size,96);
});

test('only explicit bye metadata produces a known zero; missing schedules stay provisional',()=>{
  const s=createFixtureLeague({now:0}),bye=s.players.find(p=>p.nflTeam==='BUF')!;assert.equal(scorePlayer(s,bye.id).total,0);assert.equal(scorePlayer(s,bye.id).provisional,false);
  const unknown=structuredClone(s);delete unknown.byeTeams;assert.equal(scorePlayer(unknown,bye.id).provisional,true);assert.match(scorePlayer(unknown,bye.id).issues.join(' '),/schedule/);
});

test('an incomplete NFL round schedule cannot settle even empty starting lineups',()=>{
  let s=drafted();for(const id of s.matchups[0].teamIds)s=run(s,{type:'lineup.set',teamId:id,lineup:{}},s.teams.find(t=>t.id===id)!.managerId);s=play(s);assert.equal(computeMatchup(s,s.matchups[0].id).status,'tied');s.games.pop();const result=computeMatchup(s,s.matchups[0].id);assert.equal(result.status,'provisional');assert.ok(result.issues.includes('NFL round schedule is incomplete'));
});

test('four-round replay archives one champion with all ninety-six players and history intact',()=>{
  let s=drafted();for(let round=1;round<=4;round++){s=play(s);s=settleAll(s);s=run(s,{type:'round.advance'});}assert.equal(s.phase,'archived');assert.equal(s.matchups.length,15);const champion=s.teams.filter(t=>t.eliminatedRound===null);assert.equal(champion.length,1);assert.equal(champion[0].playerIds.length,96);assert.equal(new Set(champion[0].playerIds).size,96);assert.equal(Object.keys(champion[0].lineups).length,4);
});
