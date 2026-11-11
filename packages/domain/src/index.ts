export * from './types.ts';
export * from './scoring.ts';
export { createFixtureLeague, SLOTS } from './fixtures.ts';
import { DomainError } from './types.ts';
import type { Command, CommandContext, CorrectionMetadata, Game, LeagueRules, LeagueState, Matchup, MatchupComputation, Player, Position, Slot, StatFact, StatKey, Team } from './types.ts';
import { copy, nflAlive, playerGame, roundLineup, scoreTeam, STAT_DEFINITIONS } from './scoring.ts';
import { fixtureGames, newMatchup, SLOTS } from './fixtures.ts';

function fail(code:string,message:string,details:Record<string,unknown>={}):never {throw new DomainError(code,message,details);}
function check(condition:unknown,code:string,message:string):asserts condition {if(!condition)fail(code,message);}
const POSITIONS:Position[]=['QB','RB','WR','TE','K','DEF'];
function team(state:LeagueState,id:string):Team {const found=state.teams.find(t=>t.id===id);if(!found)fail('NOT_FOUND','Team not found',{teamId:id});return found;}
function player(state:LeagueState,id:string):Player {const found=state.players.find(p=>p.id===id);if(!found)fail('NOT_FOUND','Player not found',{playerId:id});return found;}
export function eligibleSlots(p:Player):Slot[]{return p.position==='QB'?['SFLEX']:p.position==='K'||p.position==='DEF'?['DEF/K']:[p.position,'FLEX','SFLEX'];}
export function fitRoster(players:Player[]):Partial<Record<Slot,string>>|null {
  if(players.length>6||new Set(players.map(p=>p.id)).size!==players.length)return null;
  const sorted=[...players].sort((a,b)=>eligibleSlots(a).length-eligibleSlots(b).length),result:Partial<Record<Slot,string>>={};
  function visit(index:number):boolean {if(index===sorted.length)return true;for(const slot of eligibleSlots(sorted[index]))if(!result[slot]){result[slot]=sorted[index].id;if(visit(index+1))return true;delete result[slot];}return false;}
  return visit(0)?result:null;
}
export function getDraftPickIndex(state:LeagueState):number{return state.draft.picks.length;}
export function draftTeamIdAt(state:LeagueState,index:number):string|null {if(index<0||index>=96)return null;const round=Math.floor(index/16),seat=index%16;return state.draft.order[round%2?15-seat:seat];}
export function getCurrentDraftTeam(state:LeagueState):Team|null {const id=draftTeamIdAt(state,getDraftPickIndex(state));return id?team(state,id):null;}
export function currentRoster(state:LeagueState,teamId:string):Player[]{return team(state,teamId).playerIds.map(id=>player(state,id));}
function alreadyOwned(state:LeagueState,id:string):boolean{return state.teams.some(t=>t.playerIds.includes(id))||state.managers.some(m=>m.benchPlayerIds.includes(id));}
function assertCommissioner(state:LeagueState,actorId:string){check(state.managers.some(m=>m.id===actorId&&m.commissioner),'FORBIDDEN','Commissioner access required');}
function assertManager(t:Team,actorId:string){check(t.managerId===actorId,'FORBIDDEN','This action belongs to that team’s manager');}
function assertActiveTeam(state:LeagueState,t:Team){check(t.eliminatedRound===null&&state.matchups.some(m=>m.round===state.round&&m.teamIds.includes(t.id)),'TEAM_ELIMINATED','This team is no longer active');check(!state.matchups.some(m=>m.status==='review'&&!(m.correction?.status==='pending'&&m.winnerTeamId)&&(m.teamIds.includes(t.id)||m.winnerTeamId===t.id)),'REVIEW_REQUIRED','An affected result must be reviewed first');}
function assertDraftRunning(state:LeagueState){check(state.phase==='draft'&&state.draft.status==='running','DRAFT_NOT_RUNNING','The draft is not accepting picks');}
function validateRules(rules:LeagueRules){
  check(rules&&typeof rules==='object','INVALID_RULE','Rules are required');
  check(rules.ownership==='team','UNSUPPORTED_MODE','Manager-owned draft/round assignment is not implemented in the first local slice');
  check(['team','manager'].includes(rules.benchAllocation),'INVALID_RULE','Choose a supported reserve allocation');
  check(['round-start','player-kickoff'].includes(rules.assignmentLock),'INVALID_RULE','Choose a supported assignment deadline');
  check(Number.isFinite(rules.correctionWindowHours)&&rules.correctionWindowHours>=24&&rules.correctionWindowHours<=48,'INVALID_RULE','Correction window must be between 24 and 48 hours');
  check(typeof rules.fractionalYardage==='boolean'&&rules.scoring?.base&&rules.scoring.positions,'INVALID_RULE','Scoring configuration is incomplete');
  const known=Object.keys(STAT_DEFINITIONS);
  const validate=(key:string,r:unknown)=>{check(known.includes(key),'INVALID_RULE','Unknown scoring statistic');const v=r as {enabled?:unknown;value?:unknown;mode?:unknown};check(v&&typeof v.enabled==='boolean'&&typeof v.value==='number'&&Number.isFinite(v.value)&&Math.abs(v.value)<=1000000,'INVALID_RULE','Scoring values must be finite numbers within local limits');check(v.mode===STAT_DEFINITIONS[key as StatKey].rule.mode,'INVALID_RULE','Statistic units cannot be changed');if(v.mode==='yardsPerPoint')check(v.value>0,'INVALID_RULE','Yards per point must be positive');};
  for(const key of known)validate(key,rules.scoring.base[key as StatKey]);
  for(const [pos,overrides] of Object.entries(rules.scoring.positions)){check(POSITIONS.includes(pos as Position),'INVALID_RULE','Scoring uses natural positions, not lineup slots');check(overrides&&typeof overrides==='object','INVALID_RULE','Position overrides must be an object');for(const [key,r] of Object.entries(overrides))validate(key,r);}
}
function validGame(state:LeagueState,g:Game){
  check(g&&typeof g.id==='string'&&g.id.length>0&&Number.isInteger(g.round)&&g.round>=1&&g.round<=4,'INVALID_FEED','Invalid game identity/round');
  check(Array.isArray(g.nflTeams)&&g.nflTeams.length===2&&g.nflTeams.every(t=>typeof t==='string')&&g.nflTeams[0]!==g.nflTeams[1],'INVALID_FEED','Game requires two different NFL teams');
  check(Number.isFinite(g.startsAt)&&['scheduled','live','final'].includes(g.status)&&Number.isInteger(g.sourceRevision)&&g.sourceRevision>=0,'INVALID_FEED','Invalid game state');
  if(g.completedAt!==undefined)check(typeof g.completedAt==='number'&&Number.isFinite(g.completedAt)&&g.completedAt>=g.startsAt,'INVALID_FEED','Game completion must be an explicit valid timestamp after kickoff');
  check(g.winner===null||g.nflTeams.includes(g.winner),'INVALID_FEED','Winner must be a participating NFL team');
  check(g.status!=='final'||g.winner!==null,'INVALID_FEED','A final postseason game requires a winner');
  check(!state.games.some(other=>other.id!==g.id&&other.round===g.round&&other.nflTeams.some(t=>g.nflTeams.includes(t))),'INVALID_FEED','An NFL team cannot appear in multiple games in one playoff round');
}
function validFact(state:LeagueState,f:StatFact){
  check(f&&typeof f.playerId==='string'&&typeof f.gameId==='string'&&Number.isInteger(f.sourceRevision)&&f.sourceRevision>=0,'INVALID_FEED','Invalid statistic identity/revision');
  const p=player(state,f.playerId),g=state.games.find(g=>g.id===f.gameId);check(g&&g.nflTeams.includes(p.nflTeam),'INVALID_FEED','Player does not belong to that game');
  check(f.winBonusEligible===null||typeof f.winBonusEligible==='boolean','INVALID_FEED','Supply explicit win-bonus eligibility or unresolved null');
  check(f.stats&&typeof f.stats==='object'&&!Array.isArray(f.stats),'INVALID_FEED','Statistics must be an object');
  for(const [key,value] of Object.entries(f.stats))check(key in STAT_DEFINITIONS&&key!=='nflTeamWins'&&typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=100000000,'INVALID_FEED','Statistics need known finite values; NFL wins derive from game outcomes');
}
function setFact(state:LeagueState,fact:StatFact):boolean {const i=state.stats.findIndex(f=>f.gameId===fact.gameId&&f.playerId===fact.playerId);if(i>=0&&state.stats[i].sourceRevision>=fact.sourceRevision)return false;if(i>=0)state.stats[i]=copy(fact);else state.stats.push(copy(fact));return true;}
function setGame(state:LeagueState,game:Game):boolean {const i=state.games.findIndex(g=>g.id===game.id);if(i>=0&&state.games[i].sourceRevision>=game.sourceRevision)return false;const value=copy(game);if(i>=0&&value.status==='final'&&value.completedAt===undefined&&state.games[i].completedAt!==undefined)value.completedAt=state.games[i].completedAt;if(i>=0)state.games[i]=value;else state.games.push(value);return true;}
export function computeMatchup(state:LeagueState,matchupId:string):MatchupComputation {
  const m=state.matchups.find(m=>m.id===matchupId);if(!m)fail('NOT_FOUND','Matchup not found');
  const scores=m.teamIds.map(id=>scoreTeam(state,id,m.round)),games=state.games.filter(g=>g.round===m.round),alive=nflAlive(state,m.round);
  const counts=m.teamIds.map(id=>Object.values(roundLineup(team(state,id),m.round)).filter(pid=>alive.has(player(state,pid).nflTeam)).length) as [number,number];
  const scheduleComplete=games.length===[0,6,4,2,1][m.round];
  const provisional=!scheduleComplete||games.some(g=>g.status!=='final')||scores.some(s=>s.provisional),totals=scores.map(s=>s.total) as [number,number];
  let winner:string|null=null;if(!provisional){if(totals[0]!==totals[1])winner=m.teamIds[totals[0]>totals[1]?0:1];else if(counts[0]!==counts[1])winner=m.teamIds[counts[0]>counts[1]?0:1];}
  return {matchupId,scores:totals,survivingStarters:counts,winnerTeamId:winner,status:provisional?'provisional':winner?'ready':'tied',issues:[...new Set([...scores.flatMap(s=>s.issues),...(!scheduleComplete?['NFL round schedule is incomplete']:[])])]};
}
function correctionWindow(state:LeagueState,m:Matchup,now:number):{windowClosesAt:number|null;nextRoundStarted:boolean;allowed:boolean;reason:string}{
  const games=state.games.filter(g=>g.round===m.round),expected=[0,6,4,2,1][m.round];
  const complete=games.length===expected&&games.every(g=>g.status==='final'&&typeof g.completedAt==='number'&&Number.isFinite(g.completedAt));
  const completedAt=complete?Math.max(...games.map(g=>g.completedAt!)):null;
  const hours=state.rules.correctionWindowHours,windowClosesAt=completedAt!==null&&Number.isFinite(hours)?completedAt+hours*3600000:null;
  const following=state.games.filter(g=>g.round===m.round+1),declared=state.roundFirstKickoffAt?.[String(m.round+1)];
  const scheduleKnown=m.round===4||following.length>0||typeof declared==='number';
  const nextRoundStarted=m.round<4&&(state.round>m.round+1||following.some(g=>g.status!=='scheduled'||g.startsAt<=now)||(typeof declared==='number'&&declared<=now));
  if(windowClosesAt===null)return {windowClosesAt,nextRoundStarted,allowed:false,reason:'Round completion timestamp is unknown; automatic correction eligibility cannot be proven'};
  if(completedAt!>now)return {windowClosesAt,nextRoundStarted,allowed:false,reason:'Round completion is in the future; source timing needs review'};
  if(nextRoundStarted)return {windowClosesAt,nextRoundStarted,allowed:false,reason:'The next NFL round has started; published outcome is retained for commissioner review'};
  if(now>=windowClosesAt)return {windowClosesAt,nextRoundStarted,allowed:false,reason:'The configured correction window has expired; published outcome is retained for commissioner review'};
  if(!scheduleKnown)return {windowClosesAt,nextRoundStarted,allowed:false,reason:'Next-round kickoff is unknown; automatic correction eligibility cannot be proven'};
  return {windowClosesAt,nextRoundStarted,allowed:true,reason:'Source correction applied within the configured window and before the next NFL kickoff'};
}
function captureWinner(state:LeagueState,m:Matchup,winnerId:string,result:MatchupComputation,reason:string,now:number,manual:boolean){
  m.rostersAtSettlement=m.teamIds.map(id=>[...team(state,id).playerIds]) as [string[],string[]];
  m.lineupsAtSettlement=m.teamIds.map(id=>copy(roundLineup(team(state,id),m.round))) as [Partial<Record<Slot,string>>,Partial<Record<Slot,string>>];
  const winner=team(state,winnerId),loser=team(state,m.teamIds.find(id=>id!==winnerId)!);
  const captured=state.rules.benchAllocation==='team'?[...loser.playerIds]:Object.values(roundLineup(loser,m.round));
  if(state.rules.benchAllocation==='team')winner.playerIds=[...new Set([...winner.playerIds,...captured])];
  else {
    const winningManager=state.managers.find(x=>x.id===winner.managerId)!,losingManager=state.managers.find(x=>x.id===loser.managerId)!;
    losingManager.benchPlayerIds=[...new Set([...losingManager.benchPlayerIds,...loser.playerIds.filter(id=>!captured.includes(id))])];
    winningManager.benchPlayerIds=[...new Set([...winningManager.benchPlayerIds,...captured])];
  }
  loser.playerIds=[];loser.eliminatedRound=m.round;m.status='settled';m.winnerTeamId=winnerId;m.capturedPlayerIds=[...captured];m.settlementReason=reason;m.settledAt=now;m.scoreAtSettlement=result.scores;m.manualResolution=manual;
}
function reverseAndCapture(state:LeagueState,m:Matchup,result:MatchupComputation,now:number){
  const oldWinner=m.winnerTeamId!,newWinner=result.winnerTeamId!,snapshots=copy(m.rostersAtSettlement!),lineups=copy(m.lineupsAtSettlement!),assets=new Set(snapshots.flat());
  // A next-round assignment may draw a shared reserve from an unrelated matchup.
  // Return those assets before replacing participant rosters with their frozen snapshots.
  for(const id of m.teamIds){const participant=team(state,id),manager=state.managers.find(x=>x.id===participant.managerId)!;const unrelated=participant.playerIds.filter(pid=>!assets.has(pid));manager.benchPlayerIds=[...new Set([...manager.benchPlayerIds,...unrelated])];participant.playerIds=participant.playerIds.filter(pid=>assets.has(pid));}
  // Remove the transaction's assets from their current locations, including pre-kickoff shared-bench assignments.
  for(const t of state.teams){t.playerIds=t.playerIds.filter(id=>!assets.has(id));for(const [round,lineup] of Object.entries(t.lineups))if(Number(round)>m.round)t.lineups[round]=Object.fromEntries(Object.entries(lineup).filter(([,id])=>!assets.has(id)));if(state.round>m.round)t.lineup=Object.fromEntries(Object.entries(t.lineup).filter(([,id])=>!assets.has(id)));}
  for(const manager of state.managers)manager.benchPlayerIds=manager.benchPlayerIds.filter(id=>!assets.has(id));
  m.teamIds.forEach((id,i)=>{const t=team(state,id);t.playerIds=snapshots[i];t.lineups[String(m.round)]=lineups[i];t.eliminatedRound=null;if(state.round===m.round)t.lineup=copy(lineups[i]);});
  captureWinner(state,m,newWinner,result,'Automatic correction of the published result before next-round kickoff',now,false);
  if(state.round>m.round){
    const winner=team(state,newWinner);winner.lineup=copy(roundLineup(winner,m.round));winner.lineups[String(state.round)]=copy(winner.lineup);
    for(const next of state.matchups.filter(x=>x.round===m.round+1&&x.teamIds.includes(oldWinner))){next.teamIds=next.teamIds.map(id=>id===oldWinner?newWinner:id) as [string,string];next.status='provisional';next.winnerTeamId=null;next.scoreAtSettlement=null;next.capturedPlayerIds=[];next.settlementReason=null;next.settledAt=null;next.manualResolution=false;next.correction=null;}
  }
}
function refreshMatchups(state:LeagueState,now=0){
  for(const m of state.matchups.slice().sort((a,b)=>a.round-b.round)){
    const c=computeMatchup(state,m.id);
    if(!m.winnerTeamId||!m.scoreAtSettlement){m.status=c.status;continue;}
    const changed=m.scoreAtSettlement.some((s,i)=>s!==c.scores[i])||c.status==='provisional'||(!m.manualResolution&&c.winnerTeamId!==m.winnerTeamId);
    if(!changed){if(m.status==='review')m.status='settled';if(m.correction?.status==='pending')m.correction=null;continue;}
    if(m.correction?.status==='kept'&&m.correction.proposedWinnerTeamId===c.winnerTeamId&&m.correction.proposedScores.every((s,i)=>s===c.scores[i]))continue;
    const window=correctionWindow(state,m,now),previousWinnerTeamId=m.winnerTeamId,previousScores=[...m.scoreAtSettlement] as [number,number];
    let reason=window.reason;
    const hasSnapshots=Boolean(m.rostersAtSettlement&&m.lineupsAtSettlement);
    const canReconcile=window.allowed&&c.status==='ready'&&Boolean(c.winnerTeamId)&&(c.winnerTeamId===m.winnerTeamId||hasSnapshots);
    if(window.allowed&&c.status==='tied')reason='Correction leaves a tied matchup; the commissioner must resolve the remaining tie';
    else if(window.allowed&&c.status==='provisional')reason='Corrected scoring facts are incomplete; published outcome is retained for review';
    else if(window.allowed&&!hasSnapshots&&c.winnerTeamId!==m.winnerTeamId)reason='Legacy settlement lacks immutable transfer snapshots; automatic reversal cannot be proven safe';
    const metadata:CorrectionMetadata={status:canReconcile?'applied':'pending',reason,detectedAt:now,previousWinnerTeamId,previousScores,proposedWinnerTeamId:c.winnerTeamId,proposedScores:c.scores,windowClosesAt:window.windowClosesAt,nextRoundStarted:window.nextRoundStarted,requiresLineupReview:canReconcile&&c.winnerTeamId!==m.winnerTeamId&&state.round>m.round};
    if(canReconcile){if(c.winnerTeamId!==m.winnerTeamId)reverseAndCapture(state,m,c,now);else {m.scoreAtSettlement=c.scores;m.status='settled';}m.correction=metadata;}
    else {m.correction=metadata;m.status='review';}
  }
}
function locked(state:LeagueState,p:Player,now:number):boolean {const game=playerGame(state,p);return Boolean(game&&(game.startsAt<=now||game.status!=='scheduled'));}
export function canAssignLineup(state:LeagueState,teamId:string,lineup:Partial<Record<Slot,string>>,now:number):{ok:boolean;error?:string;code?:string} {
  try{
    const t=team(state,teamId);assertActiveTeam(state,t);
    check(lineup&&typeof lineup==='object'&&!Array.isArray(lineup),'INVALID_LINEUP','Lineup must be a slot-to-player map');
    const ids=Object.values(lineup);check(ids.every(id=>typeof id==='string')&&new Set(ids).size===ids.length,'DUPLICATE_PLAYER','A player can start only once per round');
    for(const [slot,id] of Object.entries(lineup)){check((SLOTS as readonly string[]).includes(slot),'INVALID_SLOT','Unknown lineup slot');const p=player(state,id);check(eligibleSlots(p).includes(slot as Slot),'INELIGIBLE_POSITION','Player is not eligible for this slot');const manager=state.managers.find(m=>m.id===t.managerId)!;check(t.playerIds.includes(id)||(state.rules.benchAllocation==='manager'&&manager.benchPlayerIds.includes(id)),'FOREIGN_PLAYER','Player does not belong to this team or its manager’s shared bench');}
    for(const slot of SLOTS){const old=t.lineup[slot],next=lineup[slot];if(old===next)continue;if(old)check(!locked(state,player(state,old),now),'PLAYER_LOCKED','A player whose NFL game started cannot be moved');if(next)check(!locked(state,player(state,next),now),'PLAYER_LOCKED','A player whose NFL game started cannot enter the lineup');}
    const newShared=ids.filter(id=>!t.playerIds.includes(id));if(newShared.length&&state.rules.assignmentLock==='round-start')check(!state.games.some(g=>g.round===state.round&&(g.startsAt<=now||g.status!=='scheduled')),'ASSIGNMENT_LOCKED','Shared-reserve team assignment closed at the round’s first kickoff');
    return {ok:true};
  }catch(error){if(error instanceof DomainError)return {ok:false,error:error.message,code:error.code};throw error;}
}
function draftPick(state:LeagueState,teamId:string,playerId:string|null,source:'manager'|'autopick'|'fixture'){
  const target=getCurrentDraftTeam(state);check(target&&target.id===teamId,'TURN_CHANGED','The displayed team is no longer on the clock');
  if(playerId){const p=player(state,playerId);check(!alreadyOwned(state,p.id),'PLAYER_UNAVAILABLE','That player was already drafted');const lineup=fitRoster([...currentRoster(state,teamId),p]);check(lineup,'ROSTER_FULL','No eligible starting slot; initial bench picks are not supported');target.playerIds.push(p.id);target.lineup=lineup;target.lineups['1']=copy(lineup);for(const id of Object.keys(state.draft.queues))state.draft.queues[id]=state.draft.queues[id].filter(p=>p!==playerId);}
  const index=state.draft.picks.length;state.draft.picks.push({index,round:Math.floor(index/16)+1,teamId,playerId,source});
  if(state.draft.picks.length===96){state.draft.status='complete';state.phase='active';refreshMatchups(state);}
}
function autopick(state:LeagueState,source:'autopick'|'fixture'){
  const t=getCurrentDraftTeam(state);check(t,'DRAFT_COMPLETE','All picks are complete');const available=(p:Player)=>!alreadyOwned(state,p.id)&&fitRoster([...currentRoster(state,t.id),p])!==null;
  const queued=(state.draft.queues[t.id]||[]).map(id=>player(state,id)).find(available),p=queued||state.players.slice().sort((a,b)=>a.rank-b.rank).find(available);
  draftPick(state,t.id,p?.id||null,source);
}
function applyLineup(state:LeagueState,t:Team,lineup:Partial<Record<Slot,string>>,now:number){
  const validation=canAssignLineup(state,t.id,lineup,now);check(validation.ok,validation.code||'INVALID_LINEUP',validation.error||'Invalid lineup');
  const manager=state.managers.find(m=>m.id===t.managerId)!,ids=Object.values(lineup);
  if(state.rules.benchAllocation==='manager'){
    const left=t.playerIds.filter(id=>!ids.includes(id));manager.benchPlayerIds=[...new Set([...manager.benchPlayerIds.filter(id=>!ids.includes(id)),...left])];t.playerIds=[...ids];
  }
  t.lineup=copy(lineup);t.lineups[String(state.round)]=copy(lineup);
}
function settle(state:LeagueState,m:Matchup,command:Extract<Command,{type:'matchup.settle'}>,now:number):boolean {
  if(m.status==='settled'){check(!command.winnerTeamId||command.winnerTeamId===m.winnerTeamId,'ALREADY_SETTLED','A settled result cannot be silently changed');return false;}
  check(m.round===state.round,'ROUND_CLOSED','Only the active round can be settled');check(m.status!=='review','REVIEW_REQUIRED','Correction review requires a defined resolution policy before another transfer');
  const result=computeMatchup(state,m.id);check(result.status!=='provisional','RESULT_PROVISIONAL','Await finalized games and complete eligible scoring facts');
  check(typeof command.reason==='string'&&command.reason.trim().length>0,'REASON_REQUIRED','Record the commissioner’s settlement reason');
  const winnerId=command.winnerTeamId||result.winnerTeamId;
  check(winnerId&&m.teamIds.includes(winnerId),'NEEDS_RESOLUTION','Tie remains unresolved; the replay requires an explicit winner and reason');
  check(!result.winnerTeamId||winnerId===result.winnerTeamId,'SETTLEMENT_CONFLICT','An explicit winner cannot override the computed outcome in this local slice');
  captureWinner(state,m,winnerId,result,command.reason.trim(),now,result.status==='tied');return true;
}
function playFixtureRound(state:LeagueState,now:number):boolean {
  const games=state.games.filter(g=>g.round===state.round);if(games.every(g=>g.status==='final'))return false;
  for(const game of games){game.status='final';game.winner=game.nflTeams[0];game.startsAt=Math.min(game.startsAt,now-1);game.completedAt=now;game.sourceRevision++;
    for(const p of state.players.filter(p=>game.nflTeams.includes(p.nflTeam))){const n=p.rank,stats:StatFact['stats']=p.position==='QB'?{passingYards:180+n*7%150,passingTouchdowns:1+n%3,interceptions:n%2,rushingYards:20+n%20}:p.position==='RB'?{rushingYards:60+n*11%75,rushingTouchdowns:n%2,receptions:3,receivingYards:30}:p.position==='WR'||p.position==='TE'?{receptions:3+n%5,receivingYards:40+n*7%80,receivingTouchdowns:n%2}:p.position==='K'?{extraPoints:2,fieldGoals:1+n%3}:{sacks:2+n%3,defensiveInterceptions:n%2,defensiveTouchdowns:n%3===0?1:0};const old=state.stats.find(f=>f.gameId===game.id&&f.playerId===p.id);setFact(state,{gameId:game.id,playerId:p.id,sourceRevision:(old?.sourceRevision||0)+1,stats,winBonusEligible:true});}
  }state.roundFirstKickoffAt={...state.roundFirstKickoffAt,[String(state.round)]:Math.min(...games.map(g=>g.startsAt))};refreshMatchups(state,now);return true;
}
function ensureFixtureRoundSchedule(state:LeagueState,now:number){
  const existing=state.games.filter(g=>g.round===state.round),alive=nflAlive(state,state.round-1),covered=new Set<string>();
  for(const game of existing)for(const nflTeam of game.nflTeams){check(alive.has(nflTeam),'SCHEDULE_CONFLICT','Existing next-round schedule contains an NFL team not known to have advanced');check(!covered.has(nflTeam),'SCHEDULE_CONFLICT','Existing next-round schedule contains duplicate NFL teams');covered.add(nflTeam);}
  const remaining=[...alive].filter(t=>!covered.has(t));check(remaining.length%2===0,'SCHEDULE_CONFLICT','The remaining fixture schedule cannot form complete games');
  const kickoff=state.roundFirstKickoffAt?.[String(state.round)],baseTime=typeof kickoff==='number'&&Number.isFinite(kickoff)?kickoff-3600000:now;
  const ids=new Set(state.games.map(g=>g.id));let number=1;
  for(const game of fixtureGames(state.round,remaining,baseTime)){while(ids.has(`fixture-r${state.round}-g${number}`))number++;game.id=`fixture-r${state.round}-g${number++}`;ids.add(game.id);state.games.push(game);}
}
export function getPublicView(state:LeagueState,actorId:string):LeagueState {
  const result=copy(state);result.draft.queues=Object.fromEntries(Object.entries(result.draft.queues).filter(([id])=>team(result,id).managerId===actorId));return result;
}
export function applyCommand(state:LeagueState,command:Command,context:CommandContext):LeagueState {
  check(command&&typeof command.type==='string','INVALID_COMMAND','Command type is required');check(Number.isFinite(context.now),'INVALID_CONTEXT','An authoritative command time is required');check(state.managers.some(m=>m.id===context.actorId),'FORBIDDEN','Unknown league member');
  const next=copy(state);let changed=true,summary=command.type as string;
  switch(command.type){
    case 'league.rename':assertCommissioner(next,context.actorId);check(next.phase==='setup','RULES_LOCKED','Rename this fixture before drafting');check(typeof command.name==='string'&&command.name.trim().length>0&&command.name.length<=80,'INVALID_NAME','Use a league name between 1 and 80 characters');next.name=command.name.trim();summary='League renamed';break;
    case 'rules.update':assertCommissioner(next,context.actorId);check(next.draft.picks.length===0&&next.draft.status==='lobby','RULES_LOCKED','In-competition rule-change governance is not selected; edit rules before drafting');validateRules(command.rules);next.rules=copy(command.rules);summary='Scoring and reserve rules updated before drafting';break;
    case 'draft.start':assertCommissioner(next,context.actorId);check(next.draft.status==='lobby'&&next.phase==='setup','DRAFT_ALREADY_STARTED','Draft has already started');validateRules(next.rules);next.draft.status='running';next.phase='draft';summary='Team-owned snake draft started';break;
    case 'draft.pick':{assertDraftRunning(next);const t=team(next,command.teamId);assertManager(t,context.actorId);check(command.expectedPickIndex===getDraftPickIndex(next),'TURN_CHANGED','The draft advanced while this pick was being reviewed');draftPick(next,t.id,command.playerId,'manager');summary=`Pick ${next.draft.picks.length} confirmed for ${t.name}`;break;}
    case 'draft.queue':{const t=team(next,command.teamId);assertManager(t,context.actorId);check(next.draft.status!=='complete','DRAFT_COMPLETE','The draft is complete');check(Array.isArray(command.playerIds)&&command.playerIds.length<=next.players.length&&new Set(command.playerIds).size===command.playerIds.length,'INVALID_QUEUE','Queue contains duplicate or invalid entries');for(const id of command.playerIds){player(next,id);check(!alreadyOwned(next,id),'PLAYER_UNAVAILABLE','A queued player was already drafted');}next.draft.queues[t.id]=[...command.playerIds];summary=`Private queue updated for ${t.name}`;break;}
    case 'draft.pause':assertCommissioner(next,context.actorId);assertDraftRunning(next);next.draft.status='paused';summary='Draft paused';break;
    case 'draft.resume':assertCommissioner(next,context.actorId);check(next.draft.status==='paused','DRAFT_NOT_PAUSED','Draft is not paused');next.draft.status='running';summary='Draft resumed';break;
    case 'draft.autopick':assertCommissioner(next,context.actorId);assertDraftRunning(next);autopick(next,'autopick');summary='Fixture timeout autopick resolved';break;
    case 'fixture.draftRemaining':assertCommissioner(next,context.actorId);assertDraftRunning(next);while(next.draft.status==='running')autopick(next,'fixture');summary='Remaining fixture picks simulated';break;
    case 'lineup.set':{check(next.phase==='active','NOT_ACTIVE','Lineups become editable when the draft finishes');const t=team(next,command.teamId);assertManager(t,context.actorId);applyLineup(next,t,command.lineup,context.now);summary=`Lineup updated for ${t.name}`;break;}
    case 'feed.game':assertCommissioner(next,context.actorId);validGame(next,command.game);changed=setGame(next,command.game);if(changed)refreshMatchups(next,context.now);summary='Revised fixture game fact applied';break;
    case 'feed.stats':assertCommissioner(next,context.actorId);validFact(next,command.fact);changed=setFact(next,command.fact);if(changed)refreshMatchups(next,context.now);summary='Revised fixture player statistics applied';break;
    case 'fixture.playRound':assertCommissioner(next,context.actorId);check(next.phase==='active','NOT_ACTIVE','Complete the draft before replaying games');changed=playFixtureRound(next,context.now);summary=`Round ${next.round} fixture games replayed`;break;
    case 'matchup.settle':{assertCommissioner(next,context.actorId);check(next.phase==='active','NOT_ACTIVE','No active round');const m=next.matchups.find(m=>m.id===command.matchupId);check(m,'NOT_FOUND','Matchup not found');changed=settle(next,m,command,context.now);summary=`Matchup ${m.id} settled by explicit commissioner replay action`;break;}
    case 'matchup.keepPublished':{assertCommissioner(next,context.actorId);const m=next.matchups.find(m=>m.id===command.matchupId);check(m&&m.correction?.status==='pending'&&m.winnerTeamId,'NO_PENDING_CORRECTION','No published outcome is awaiting a correction decision');check(typeof command.reason==='string'&&command.reason.trim().length>0,'REASON_REQUIRED','Record why the published outcome is retained');m.correction.status='kept';m.correction.decisionReason=command.reason.trim();m.status='settled';summary=`Commissioner retained published outcome for ${m.id}: ${command.reason.trim()}`;break;}
    case 'round.advance':{assertCommissioner(next,context.actorId);check(next.phase==='active','NOT_ACTIVE','No active round');const matches=next.matchups.filter(m=>m.round===next.round);check(matches.length>0&&matches.every(m=>m.status==='settled'),'ROUND_UNSETTLED','Resolve every result and affected correction before advancing');check(!next.matchups.some(m=>m.status==='review'),'REVIEW_REQUIRED','A prior result still needs review');if(next.round===4){next.phase='archived';summary='Fixture season archived';break;}const winners=matches.map(m=>m.winnerTeamId!);next.round++;for(const id of winners){const t=team(next,id);t.lineups[String(next.round)]=copy(t.lineup);}for(let i=0;i<winners.length;i+=2)next.matchups.push(newMatchup(next.round,i/2,[winners[i],winners[i+1]]));ensureFixtureRoundSchedule(next,context.now);summary=`Advanced to NFL round ${next.round}`;break;}
    default:fail('INVALID_COMMAND','Unknown command type');
  }
  if(!changed)return state;
  next.revision=state.revision+1;next.audit.push({id:`${next.id}-event-${next.revision}`,revision:next.revision,at:context.now,actorId:context.actorId,type:command.type,summary});return next;
}
