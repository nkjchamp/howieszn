import type { Game, LeagueState, Player, Score, ScorePart, ScoringRule, StatKey, Team } from './types.ts';
export const STAT_DEFINITIONS: Record<StatKey, {label: string; rule: ScoringRule}> = {
  passingYards: {label:'Passing yards',rule:{enabled:true,value:25,mode:'yardsPerPoint'}},
  passingTouchdowns:{label:'Passing touchdowns',rule:{enabled:true,value:4,mode:'points'}},
  interceptions:{label:'Interceptions thrown',rule:{enabled:true,value:-2,mode:'points'}},
  rushingYards:{label:'Rushing yards',rule:{enabled:true,value:10,mode:'yardsPerPoint'}},
  rushingTouchdowns:{label:'Rushing touchdowns',rule:{enabled:true,value:6,mode:'points'}},
  receptions:{label:'Receptions',rule:{enabled:true,value:0.5,mode:'points'}},
  receivingYards:{label:'Receiving yards',rule:{enabled:true,value:10,mode:'yardsPerPoint'}},
  receivingTouchdowns:{label:'Receiving touchdowns',rule:{enabled:true,value:6,mode:'points'}},
  fumblesLost:{label:'Fumbles lost',rule:{enabled:true,value:-2,mode:'points'}},
  extraPoints:{label:'Extra points',rule:{enabled:true,value:1,mode:'points'}},
  fieldGoals:{label:'Field goals (flat fixture rule)',rule:{enabled:true,value:3,mode:'points'}},
  sacks:{label:'Defense sacks',rule:{enabled:true,value:1,mode:'points'}},
  defensiveInterceptions:{label:'Defense interceptions',rule:{enabled:true,value:2,mode:'points'}},
  defensiveTouchdowns:{label:'Defense touchdowns',rule:{enabled:true,value:6,mode:'points'}},
  nflTeamWins:{label:'NFL team wins',rule:{enabled:false,value:5,mode:'points'}},
};
export const copy = <T>(value:T):T => JSON.parse(JSON.stringify(value));
export function baseScoring():Record<StatKey,ScoringRule> {return Object.fromEntries(Object.entries(STAT_DEFINITIONS).map(([key,value])=>[key,{...value.rule}])) as Record<StatKey,ScoringRule>;}
type Fraction = [bigint,bigint];
function fraction(value:number):Fraction {
  const [coefficient,exponentText='0']=value.toString().toLowerCase().split('e');
  const [whole,decimal='']=coefficient.split('.');
  let numerator=BigInt(whole+decimal), scale=decimal.length-Number(exponentText);
  if(scale<0){numerator*=10n**BigInt(-scale);scale=0;}
  return [numerator,10n**BigInt(scale)];
}
function add([a,b]:Fraction,[c,d]:Fraction):Fraction{return [a*d+c*b,b*d];}
function contribution(raw:number,rule:ScoringRule,fractional:boolean):Fraction {
  const [a,b]=fraction(raw),[c,d]=fraction(rule.value);
  if(rule.mode==='points')return [a*c,b*d];
  let n=a*d,denominator=b*c;
  if(denominator<0n){n=-n;denominator=-denominator;}
  return fractional?[n,denominator]:[n/denominator,1n];
}
function round([n,d]:Fraction):number {const sign=n<0n?-1:1,abs=n<0n?-n:n;return sign*Number((abs*200n+d)/(2n*d))/100;}
export function nflAlive(state:LeagueState,afterRound:number):Set<string>{
  const alive=new Set(state.players.map(p=>p.nflTeam));
  for(const game of state.games)if(game.round<=afterRound&&game.status==='final')for(const team of game.nflTeams)if(team!==game.winner)alive.delete(team);
  return alive;
}
export function playerGame(state:LeagueState,player:Player,roundNumber=state.round):Game|undefined{return state.games.find(g=>g.round===roundNumber&&g.nflTeams.includes(player.nflTeam));}
export function roundLineup(team:Team,roundNumber:number):Partial<Team['lineup']>{return team.lineups[String(roundNumber)]||{};}
export function scorePlayer(state:LeagueState,playerId:string,roundNumber=state.round):Score {
  const player=state.players.find(p=>p.id===playerId);
  if(!player)return {total:0,parts:[],provisional:true,issues:['Unknown player']};
  if(!nflAlive(state,roundNumber-1).has(player.nflTeam))return {total:0,parts:[],provisional:false,issues:[]};
  const game=playerGame(state,player,roundNumber);
  if(!game){
    if(state.byeTeams?.[String(roundNumber)]?.includes(player.nflTeam))return {total:0,parts:[],provisional:false,issues:[]};
    return {total:0,parts:[],provisional:true,issues:['Awaiting game schedule; no explicit bye is recorded']};
  }
  const fact=state.stats.find(s=>s.gameId===game.id&&s.playerId===playerId),issues:string[]=[];
  if(!fact)issues.push('Awaiting player statistics or explicit inactive record');
  let sum:Fraction=[0n,1n];const parts:ScorePart[]=[];
  for(const key of Object.keys(STAT_DEFINITIONS) as StatKey[]){
    const rule=state.rules.scoring.positions[player.position]?.[key]||state.rules.scoring.base[key];
    if(!rule.enabled)continue;
    let raw=fact?.stats[key]||0;
    if(key==='nflTeamWins'){
      if(fact?.winBonusEligible===null||!fact)issues.push('NFL win-bonus eligibility is unresolved');
      raw=game.status==='final'&&game.winner===player.nflTeam&&fact?.winBonusEligible===true?1:0;
    }
    if(!raw)continue;
    const points=contribution(raw,rule,state.rules.fractionalYardage);sum=add(sum,points);
    parts.push({key,label:STAT_DEFINITIONS[key].label,raw,value:rule.value,points:round(points)});
  }
  const total=round(sum),displayed=round(parts.reduce((sum,p)=>add(sum,fraction(p.points)),[0n,1n] as Fraction));
  const adjustment=round(add(fraction(total),fraction(-displayed)));
  if(adjustment)parts.push({key:'roundingAdjustment',label:'Rounding adjustment',raw:0,value:0,points:adjustment});
  return {total,parts,provisional:game.status!=='final'||issues.length>0,issues};
}
export function scoreTeam(state:LeagueState,teamId:string,roundNumber=state.round):Score {
  const team=state.teams.find(t=>t.id===teamId);
  if(!team)return {total:0,parts:[],provisional:true,issues:['Unknown team']};
  if(team.eliminatedRound!==null&&roundNumber>team.eliminatedRound)return {total:0,parts:[],provisional:false,issues:[]};
  const results=Object.values(roundLineup(team,roundNumber)).map(id=>scorePlayer(state,id,roundNumber));
  const total=round(results.reduce((sum,s)=>add(sum,fraction(s.total)),[0n,1n] as Fraction));
  return {total,parts:results.flatMap(s=>s.parts),provisional:results.some(s=>s.provisional),issues:results.flatMap(s=>s.issues)};
}
