/**
 * Issue #40 D3a: the food system on the D2c episode frame (review-only; definition set `food-d3a`).
 *
 * D0 §4.2 food. The canonical facts are the regional economy (coverage, shortage years, shortage records, routes,
 * moves), the settlement ledger's practices, the chronicle and the decisions; the episode copies none of them and
 * applies no effect: the existing annual processing is the only writer (one applier of each effect).
 *
 *  - started: a district shortage was recorded this year (the economy records it once it lasted 3 years), or a famine
 *    happened this year. A food value alone never starts one.
 *  - reassessed: another district's shortage was recorded or a famine happened (spread); supply relapsed under 0.90 in
 *    a district concerned (relapse); every district concerned had 5 years at 0.90 or more (recovering).
 *  - resolved: 20 more years of recovery without relapse (25 years in all): hysteresis against crossing back and forth.
 *  - response-started / response-changed: a confirmed record of a response since the last response change:
 *      decision:<actionId>   the scarce-stores branch chosen with this episode's shortage records as its sources (intent);
 *      relocation            the economy moved people out of a district concerned, citing its shortage record;
 *      communal-storage      a granary practice took root in a district concerned (raises its reserve cap);
 *      trade-supplement      a route touching a district concerned came under joint upkeep (doubles its capacity).
 *    The last two are actual changes in the district during the episode, not a claimed motive. A running response
 *    is not restarted by more of the same kind; after a failure the same kind can be tried again (a new record).
 *  - response-failed: a response ran 15 years and a district concerned is still 15 years in shortage.
 *  - abandoned: after a failure, 50 years in shortage without another response. The shortage may remain; a new episode
 *    needs a new origin record.
 *  - no response at all is allowed: an episode can continue or resolve without one.
 * One transition per year, in this order: spread, relapse, recovering, resolved, response, failure, abandonment.
 */
import {defineEpisodeSet,type EpisodeDefinition,type EpisodeYear,type EvidenceRef,type ActiveEpisode,type EpisodeProposal} from './episode-d2c-review.js';
import {links} from './regional-economy.js';
import {siteAt} from './settlement-history.js';

export const FOOD_EPISODE_D3A=Object.freeze({recoveryYears:5,stableYears:20,failureYears:15,abandonYears:50,coverage:.9});
export type FoodResponse=`decision:${string}`|'relocation'|'communal-storage'|'trade-supplement';
interface FoodState {
 readonly districts:readonly number[];readonly shortages:readonly string[];readonly famine:boolean;
 readonly phase:'short'|'recovering';readonly since:number;
 readonly response:{readonly kind:FoodResponse;readonly since:number;readonly record:string}|null;
 readonly responseYear:number;readonly failedYear:number|null;
}
const C=FOOD_EPISODE_D3A;
const SHORTAGE=/の食糧不足が続く$/,RELOCATION=/へ住まいを移す人々$/;

/** Shortage records of this year, with their districts. */
const shortagesOf=(y:EpisodeYear)=>(y.state.economy?.districts??[]).map((d,i)=>({i,id:d.shortageRecord}))
 .filter((d):d is {i:number;id:string}=>!!d.id&&y.record(d.id)?.year===y.year);
const faminesOf=(y:EpisodeYear)=>y.records.filter(r=>r.kind==='famine');
const concerned=(y:EpisodeYear,s:FoodState)=>s.districts.length?s.districts:(y.state.economy?.districts??[]).map((_,i)=>i);
const rec=(id:string):EvidenceRef=>({type:'record',id});
const led=(key:string,year:number):EvidenceRef=>({type:'ledger',key,year});

/** The first response recorded after `from` (exclusive), in the order decision, relocation, storage, trade. */
function responseSince(y:EpisodeYear,s:FoodState,from:number):{kind:FoodResponse;record:string}|null {
 const st=y.state,districts=new Set(concerned(y,s)),shortages=new Set(s.shortages);
 const choices=new Map<number,string>(),moves:string[]=[];
 for(let i=st.history.length-1;i>=0&&st.history[i]!.year>from;i--){
  const r=st.history[i]!;
  if(r.tag==='選択'&&r.relatedIds?.some(id=>shortages.has(id)))choices.set(r.year,r.id);
  if(RELOCATION.test(r.title)&&r.relatedIds?.some(id=>shortages.has(id)))moves.push(r.id);
 }
 const decision=st.decisions.find(d=>d.year>from&&d.templateId==='scarce-stores'&&d.actionId&&choices.has(d.year));
 if(decision)return {kind:`decision:${decision.actionId}`,record:choices.get(decision.year)!};
 if(moves.length)return {kind:'relocation',record:moves.at(-1)!};
 const ledger=st.observation!;
 for(const i of districts){
  const p=siteAt(ledger.sites,i,y.year)?.practices.find(p=>p.kind==='granary'&&p.active);
  const formed=p&&y.record(p.recordId);if(formed&&formed.year>from)return {kind:'communal-storage',record:p.recordId};
 }
 for(let j=0;j<links.length;j++){
  const l=links[j]!,id=st.economy?.routes[j]?.agreementRecord;
  if(!id||!(districts.has(l.from)||districts.has(l.to)))continue;
  const formed=y.record(id);if(formed&&formed.year>from)return {kind:'trade-supplement',record:id};
 }
 return null;
}

const food:EpisodeDefinition={kind:'food',definitionId:'food-d3a',
 start:y=>{
  const sh=shortagesOf(y),fa=faminesOf(y);if(!sh.length&&!fa.length)return null;
  const state:FoodState={districts:sh.map(d=>d.i).sort((a,b)=>a-b),shortages:sh.map(d=>d.id),famine:fa.length>0,phase:'short',since:y.year,response:null,responseYear:y.year,failedYear:null};
  return {evidence:[...sh.map(d=>rec(d.id)),...fa.map(r=>rec(r.id))],state:state as never};
 },
 advance:(y,e:ActiveEpisode)=>{
  const s=e.state as unknown as FoodState,year=y.year,ds=y.state.economy?.districts??[];
  const next=(kind:EpisodeProposal['kind'],evidence:EvidenceRef[],state:FoodState,reason:string):EpisodeProposal=>({kind,evidence,state:state as never,reason});
  // spread
  const known=new Set(s.districts),fresh=shortagesOf(y).filter(d=>!known.has(d.i)),famines=faminesOf(y);
  if(fresh.length||famines.length)return next('reassessed',[...fresh.map(d=>rec(d.id)),...famines.map(r=>rec(r.id))],
   {...s,districts:[...s.districts,...fresh.map(d=>d.i)].sort((a,b)=>a-b),shortages:[...s.shortages,...fresh.map(d=>d.id)],famine:s.famine||famines.length>0,phase:'short',since:s.phase==='short'?s.since:year},
   fresh.length?'shortage-spread':'famine');
  const cs=concerned(y,s);
  // relapse
  if(s.phase==='recovering'){
   const low=cs.find(i=>(ds[i]?.coverage.at(-1)??1)<C.coverage);
   if(low!==undefined)return next('reassessed',[led(`economy.districts.${low}.coverage<${C.coverage}`,year)],{...s,phase:'short',since:year},'supply-relapsed');
   if(year-s.since>=C.stableYears)return next('resolved',[led(`economy.districts.coverage>=${C.coverage}`,year),led('episode.food.recovering',s.since)],s,'supply-stable');
  }else if(cs.length&&cs.every(i=>{const c=ds[i]?.coverage??[];return c.length===C.recoveryYears&&c.every(v=>v>=C.coverage);}))
   return next('reassessed',[led(`economy.districts.coverage>=${C.coverage}x${C.recoveryYears}`,year)],{...s,phase:'recovering',since:year},'supply-recovering');
  // a response
  const r=responseSince(y,s,s.responseYear);
  const running=e.response==='running';
  if(r&&!(running&&r.kind===s.response?.kind)){
   return next(running?'response-changed':'response-started',[rec(r.record)],{...s,response:{kind:r.kind,since:year,record:r.record},responseYear:year},running?'to-'+r.kind:r.kind);
  }
  if(s.phase!=='short')return null;
  // failure
  if(e.response==='running'&&s.response&&year-s.response.since>=C.failureYears){
   const still=cs.find(i=>(ds[i]?.shortageYears??0)>=C.failureYears);
   if(still!==undefined)return next('response-failed',[rec(s.response.record),led(`economy.districts.${still}.shortageYears>=${C.failureYears}`,year)],{...s,responseYear:year,failedYear:year},'shortage-persisted');
  }
  // abandonment
  if(e.response==='failed'&&s.failedYear!==null&&year-s.failedYear>=C.abandonYears){
   const still=cs.find(i=>(ds[i]?.shortageYears??0)>0);
   if(still!==undefined)return next('abandoned',[led(`economy.districts.${still}.shortageYears>0`,year),led('episode.food.failed',s.failedYear)],s,'no-response-after-failure');
  }
  return null;
 }};
export const EPISODE_FOOD_D3A=defineEpisodeSet('food-d3a',[food]);
