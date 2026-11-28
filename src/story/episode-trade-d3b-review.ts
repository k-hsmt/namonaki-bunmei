/**
 * Issue #40 D3b: the trade system on the D2c episode frame (review-only; definition set `trade-d3b`).
 *
 * D0 §4.2 trade. The canonical facts are the regional economy's routes (blocked, the year's trade, the closure,
 * joint-upkeep and upkeep-pause records), the districts' coverage and shortage years, the settlement ledger's practices
 * and the chronicle. The episode copies none of them and applies no effect: the existing annual processing is the only
 * writer. A route's state and its trade are kept apart: a year without trade is not a broken relation (trade only
 * fills deficits), so no episode starts, spreads or ends on zero trade alone.
 *
 *  - started: a route that traded within the last 20 years was closed (the closure record); the joint upkeep of a
 *    route lapsed (the pause record); or a route came under joint upkeep (the agreement record: long, steady trade).
 *  - reassessed: route-closed (a closure on a route concerned, or on another route that traded within 20 years);
 *    upkeep-lapsed (a pause, outside a running joint upkeep of that route); route-reopened (no route concerned is
 *    blocked any more); trade-resumed (every route concerned traded again since it reopened or lapsed).
 *  - resolved: relation-stable (trade resumed, then 20 years without a closure or lapse, and every route concerned
 *    traded within the last 20 years); supply-converted (another means of supply is running, the routes concerned
 *    carried nothing for 20 years and every district at their ends had 5 years at 0.90 coverage or more).
 *  - response-started / response-changed, from confirmed records since the last response change:
 *      joint-upkeep       a route concerned came under joint upkeep (the trial to keep the relation);
 *      alternative-route  another route touching a district concerned came under joint upkeep;
 *      local-storage      a granary practice took root in a district concerned.
 *    The last two are actual changes during the episode, not a claimed motive. No D2b branch cites a route record, so
 *    no decision is a trade response.
 *  - response-failed: upkeep-lapsed (the running joint upkeep of a route was paused); supply-still-short (another
 *    means ran 15 years and a district concerned is still 15 years in shortage).
 *  - abandoned: after a failure, 50 years without another response while trade has not resumed. The relation is not
 *    claimed restored or ended.
 *  - not implemented: a settled rupture. In the economy, a closure lasts as long as its flood (it always reopens) and
 *    nothing records a relation as lost; trade ceasing alone cannot ground it (D0 §4.2).
 * One transition per year, in this order: closure, lapse, reopening, trade resumed, resolved, response, failure,
 * conversion, abandonment.
 */
import {defineEpisodeSet,type EpisodeDefinition,type EpisodeYear,type EvidenceRef,type ActiveEpisode,type EpisodeProposal} from './episode-d2c-review.js';
import {links} from './regional-economy.js';
import {siteAt} from './settlement-history.js';
import {siteNames} from './society.js';

export const TRADE_EPISODE_D3B=Object.freeze({recentTradeYears:20,stableYears:20,failureYears:15,convertYears:20,abandonYears:50,coverage:.9,recoveryYears:5});
export type TradeResponse='joint-upkeep'|'alternative-route'|'local-storage';
type Origin='closure'|'lapse'|'agreement';
interface TradeState {
 readonly origin:Origin;readonly routes:readonly number[];
 readonly phase:'closed'|'open'|'trading';readonly since:number;
 readonly response:{readonly kind:TradeResponse;readonly since:number;readonly record:string;readonly route:number|null}|null;
 readonly responseYear:number;readonly failedYear:number|null;
}
const C=TRADE_EPISODE_D3B;
const label=(j:number)=>`${siteNames[links[j]!.from]}と${siteNames[links[j]!.to]}`;
const titles={closure:(j:number)=>`${label(j)}を結ぶ往来が途絶える`,agreement:(j:number)=>`${label(j)}が交易路を共同で維持する`,pause:(j:number)=>`${label(j)}の共同管理が休止する`};
const GRANARY=(i:number)=>`${siteNames[i]}で共同備蓄が根づく`;
const rec=(id:string):EvidenceRef=>({type:'record',id});
const led=(key:string,year:number):EvidenceRef=>({type:'ledger',key,year});

/** This year's records of a kind, per route. */
const routeRecords=(y:EpisodeYear,kind:keyof typeof titles)=>links.flatMap((_,j)=>y.records.filter(r=>r.title===titles[kind](j)).map(r=>({j,id:r.id})));
const tradeYears=(y:EpisodeYear,j:number)=>y.state.economy?.routes[j]?.tradeYears??[];
const recentlyTraded=(y:EpisodeYear,j:number)=>tradeYears(y,j).slice(-C.recentTradeYears).some(Boolean);
/** Traded in a year from `since` to this year (the economy keeps 20 years; beyond them every kept year is after since). */
const tradedSince=(y:EpisodeYear,j:number,since:number)=>tradeYears(y,j).slice(-Math.min(C.recentTradeYears,y.year-since+1)).some(Boolean);
const blocked=(y:EpisodeYear,j:number)=>y.state.economy?.routes[j]?.blocked??false;
const ends=(routes:readonly number[])=>[...new Set(routes.flatMap(j=>[links[j]!.from,links[j]!.to]))].sort((a,b)=>a-b);
const phaseOf=(y:EpisodeYear,routes:readonly number[]):'closed'|'open'=>routes.some(j=>blocked(y,j))?'closed':'open';
const add=(routes:readonly number[],more:readonly number[])=>[...new Set([...routes,...more])].sort((a,b)=>a-b);

/** The first response recorded after `from` (exclusive), in the order joint upkeep, another route, storage. */
function responseSince(y:EpisodeYear,s:TradeState,from:number):{kind:TradeResponse;record:string;route:number|null}|null {
 const h=y.state.history,districts=new Set(ends(s.routes));
 const found:{kind:TradeResponse;record:string;route:number|null}[]=[];
 for(let k=h.length-1;k>=0&&h[k]!.year>from;k--){
  const r=h[k]!;
  for(let j=0;j<links.length;j++){
   if(r.title!==titles.agreement(j))continue;
   if(s.routes.includes(j))found.push({kind:'joint-upkeep',record:r.id,route:j});
   else if(districts.has(links[j]!.from)||districts.has(links[j]!.to))found.push({kind:'alternative-route',record:r.id,route:j});
  }
 }
 const pick=(kind:TradeResponse)=>found.filter(f=>f.kind===kind).at(-1);// the earliest of the kind (scanned backwards)
 const r=pick('joint-upkeep')??pick('alternative-route');if(r)return r;
 for(const i of districts){
  const p=siteAt(y.state.observation!.sites,i,y.year)?.practices.find(p=>p.kind==='granary'&&p.active);
  const formed=p&&y.record(p.recordId);
  if(formed&&formed.year>from&&formed.title===GRANARY(i))return {kind:'local-storage',record:p.recordId,route:null};
 }
 return null;
}

const trade:EpisodeDefinition={kind:'trade',definitionId:'trade-d3b',
 start:y=>{
  const closed=routeRecords(y,'closure').filter(r=>recentlyTraded(y,r.j)),lapsed=routeRecords(y,'pause'),agreed=routeRecords(y,'agreement');
  const origin:Origin|null=closed.length?'closure':lapsed.length?'lapse':agreed.length?'agreement':null;if(!origin)return null;
  const rs=origin==='closure'?closed:origin==='lapse'?lapsed:agreed,routes=add([],rs.map(r=>r.j));
  // an agreement is itself the upkeep: the response window opens a year earlier so that it is taken next year
  const state:TradeState={origin,routes,phase:origin==='agreement'?'trading':phaseOf(y,routes),since:y.year,response:null,responseYear:origin==='agreement'?y.year-1:y.year,failedYear:null};
  return {evidence:rs.map(r=>rec(r.id)),state:state as never};
 },
 advance:(y,e:ActiveEpisode)=>{
  const s=e.state as unknown as TradeState,year=y.year,running=e.response==='running';
  const next=(kind:EpisodeProposal['kind'],evidence:EvidenceRef[],state:TradeState,reason:string):EpisodeProposal=>({kind,evidence,state:state as never,reason});
  // a closure
  const closed=routeRecords(y,'closure').filter(r=>s.routes.includes(r.j)||recentlyTraded(y,r.j));
  if(closed.length){const routes=add(s.routes,closed.map(r=>r.j));
   return next('reassessed',closed.map(r=>rec(r.id)),{...s,routes,phase:'closed',since:year},'route-closed');}
  // a lapse
  const lapsed=routeRecords(y,'pause');
  const own=running&&s.response?.kind==='joint-upkeep'?lapsed.find(r=>r.j===s.response!.route):undefined;
  if(own)return next('response-failed',[rec(own.id),rec(s.response!.record)],{...s,phase:phaseOf(y,s.routes),since:year,responseYear:year,failedYear:year},'upkeep-lapsed');
  if(lapsed.length){const routes=add(s.routes,lapsed.map(r=>r.j));
   return next('reassessed',lapsed.map(r=>rec(r.id)),{...s,routes,phase:phaseOf(y,routes),since:year},'upkeep-lapsed');}
  // reopening and trade
  if(s.phase==='closed'){
   if(phaseOf(y,s.routes)==='open')return next('reassessed',[led('economy.routes.blocked=false',year)],{...s,phase:'open',since:year},'route-reopened');
  }else if(s.phase==='open'){
   if(s.routes.every(j=>tradedSince(y,j,s.since)))return next('reassessed',[led(`economy.routes.traded-since-${s.since}`,year)],{...s,phase:'trading',since:year},'trade-resumed');
  }else if(year-s.since>=C.stableYears&&s.routes.every(j=>recentlyTraded(y,j)))
   return next('resolved',[led(`economy.routes.traded-within-${C.recentTradeYears}`,year),led('episode.trade.trading',s.since)],s,'relation-stable');
  // a response
  const r=responseSince(y,s,s.responseYear);
  if(r&&!(running&&r.kind===s.response?.kind))
   return next(running?'response-changed':'response-started',[rec(r.record)],{...s,response:{kind:r.kind,since:year,record:r.record,route:r.route},responseYear:year},running?'to-'+r.kind:r.kind);
  const other=running&&s.response!.kind!=='joint-upkeep',ds=y.state.economy?.districts??[],districts=ends(s.routes);
  // another means of supply failed
  if(other&&year-s.response!.since>=C.failureYears){
   const still=districts.find(i=>(ds[i]?.shortageYears??0)>=C.failureYears);
   if(still!==undefined)return next('response-failed',[rec(s.response!.record),led(`economy.districts.${still}.shortageYears>=${C.failureYears}`,year)],{...s,responseYear:year,failedYear:year},'supply-still-short');
  }
  // another means of supply took over
  if(other&&s.routes.every(j=>{const t=tradeYears(y,j);return t.length>=C.convertYears&&!t.slice(-C.convertYears).some(Boolean);})
   &&districts.every(i=>{const c=ds[i]?.coverage??[];return c.length===C.recoveryYears&&c.every(v=>v>=C.coverage);}))
   return next('resolved',[rec(s.response!.record),led(`economy.routes.traded=0x${C.convertYears}`,year),led(`economy.districts.coverage>=${C.coverage}x${C.recoveryYears}`,year)],s,'supply-converted');
  // abandonment
  if(e.response==='failed'&&s.failedYear!==null&&year-s.failedYear>=C.abandonYears&&s.phase!=='trading')
   return next('abandoned',[led('episode.trade.failed',s.failedYear),led(`episode.trade.${s.phase}`,s.since)],s,'no-response-after-failure');
  return null;
 }};
export const EPISODE_TRADE_D3B=defineEpisodeSet('trade-d3b',[trade]);
