/**
 * Issue #40 D2b: review-only autonomous choice and issue-based branches (ruleId civilization-decisions-d2b-review).
 *
 * Used only through the D2a review event policy (createEventPolicyD2a(..., {decisions:true})); production never passes it.
 * D0 §7 and the D2a Human review:
 *  - a branch is presented only when its issue is confirmed (ledgers and records of year - 1 and before, never this
 *    year's draft); a template whose text states a premise the current model cannot confirm is suspended, not presented;
 *  - no yearly lottery: a branch is presented when its issue ARISES (it was confirmed in year - 1: a record of that year,
 *    or a value that crossed into it), not every year a state lasts; a per-template interval and a minimum gap between
 *    branches bound the frequency (initial values; final in D4c);
 *  - stable keys (templateId / actionId) and the records that raised the issue are kept with the branch;
 *  - the civilization's own choice is drawn once when the branch is presented (one RNG draw) and kept in the pending
 *    branch. Choosing manually draws nothing more, so the same action chosen manually or by the people leads to the same
 *    world (only the record of who chose differs);
 *  - choosing is an intent: the action's effects are production's (impacts and institutions); nothing physical is claimed.
 */
import {decisionTemplatesV1} from './decision-templates-v1.js';
import {siteAt} from './settlement-history.js';
import {metricsAt} from './observations.js';
import type {CivilizationState,LegacyKind} from './engine.js';

export const DECISION_POLICY_D2B_ID='civilization-decisions-d2b-review' as const;
/** Initial values (D4c tunes them). */
export const DECISION_TIMING=Object.freeze({templateInterval:200,minimumGap:85});

export type DecisionIssue='shortage-recorded'|'arrival'|'bridge-lost-to-flood'|'record-keeping-began'|'homes-vacated'|'plenty-reached';
export interface DecisionTemplateEntry {
 readonly templateId:string;readonly actionIds:readonly string[];
 readonly issue:DecisionIssue|'suspended';readonly reason?:string;
}
/** One entry per decisionTemplatesV1 template, in its order (the content is shared, not copied). */
export const DECISION_CATALOG:readonly DecisionTemplateEntry[]=Object.freeze(([
 {templateId:'scarce-stores',actionIds:['share-stores','local-judgement','seek-new-land'],issue:'shortage-recorded'},
 {templateId:'visitors',actionIds:['welcome-to-live','trade-only','keep-distance'],issue:'arrival'},
 {templateId:'waterway-damage',actionIds:['work-day','own-fields-first','try-new-method'],issue:'suspended',reason:'水路の傷みを抽選時に確定事実として読めない（水路の状態はstep()の外）'},
 {templateId:'festival-form',actionIds:['accept-new-form','keep-old-form','leave-to-settlements'],issue:'suspended',reason:'若者の提案という前提を確定事実で確かめられない'},
 {templateId:'old-tree',actionIds:['keep-tree','rebuild-with-timber'],issue:'suspended',reason:'古い木と建設計画を確定事実で確かめられない'},
 {templateId:'fish-decline',actionIds:['limit-fishing','move-upstream','try-new-net'],issue:'suspended',reason:'魚の減少を確定するモデルがない'},
 {templateId:'bridge-lost',actionIds:['rebuild-together','ferry-crossing'],issue:'bridge-lost-to-flood'},
 {templateId:'records-memory',actionIds:['keep-both','record-as-canon','oral-keepers'],issue:'record-keeping-began'},
 {templateId:'vacant-homes',actionIds:['repair-keep','reuse-materials'],issue:'homes-vacated'},
 {templateId:'surplus',actionIds:['add-stores','festival-share','gift-far'],issue:'plenty-reached'},
] as DecisionTemplateEntry[]).map(e=>Object.freeze({...e,actionIds:Object.freeze([...e.actionIds])})));
/** The institution an action continues (its existing effect in choose()); its strength makes the action more likely. */
export const ACTION_TENDENCY:Readonly<Record<string,LegacyKind>>=Object.freeze({
 'share-stores':'granary','add-stores':'granary','welcome-to-live':'migration','trade-only':'trade_network','gift-far':'trade_network',
 'rebuild-together':'waterworks','keep-both':'archive','record-as-canon':'archive',
});

/** The confirmed facts an issue reads, with the records that raised it. */
export interface DecisionIssueFacts {readonly holds:boolean;readonly sources:readonly string[];readonly evidence:readonly string[]}
const none:DecisionIssueFacts=Object.freeze({holds:false,sources:Object.freeze([]),evidence:Object.freeze([])});
const found=(sources:string[],evidence:string[]=[]):DecisionIssueFacts=>Object.freeze({holds:true,sources:Object.freeze(sources),evidence:Object.freeze(evidence)});
/** Whether `issue` arose in year `s.year - 1` (records of that year; ledgers and values at its end and the year before). */
export function decisionIssueAt(s:CivilizationState,issue:DecisionIssue):DecisionIssueFacts {
 const y=s.year-1,ledger=s.observation!,of=(r:{year:number})=>r.year===y;
 switch(issue){
  case 'shortage-recorded':{// the economy records a shortage once it has lasted 3 years
   const records=new Map(s.history.map(r=>[r.id,r]));
   const ids=(s.economy?.districts??[]).map(d=>d.shortageRecord).filter((id):id is string=>!!id&&records.get(id)?.year===y);
   return ids.length?found(ids,['economy:shortage-record@'+y]):none;}
  case 'arrival':{
   const r=s.history.find(r=>of(r)&&r.kind==='arrival');
   return r?found([r.id]):none;}
  case 'bridge-lost-to-flood':{
   const records=new Map(s.history.map(r=>[r.id,r]));
   for(const damage of s.history.filter(r=>of(r)&&r.kind==='building-damaged')){
    const flood=damage.relatedIds?.map(id=>records.get(id)).find(r=>r?.kind==='flood');
    const bridge=[0,1,2].flatMap(i=>siteAt(ledger.sites,i,y)?.buildings??[]).find(b=>b.id===damage.buildingId&&b.kind==='bridge'&&b.condition==='damaged');
    if(flood&&bridge)return found([damage.id,flood.id],['bridge:'+bridge.id]);
   }
   return none;}
  case 'record-keeping-began':{
   const archive=s.history.find(r=>of(r)&&r.kind==='first_archive');
   const practice=[0,1,2].flatMap(i=>siteAt(ledger.sites,i,y)?.practices??[]).find(p=>p.kind==='archive'&&p.active&&s.history.some(r=>r.id===p.recordId&&of(r)));
   const ids=[...(archive?[archive.id]:[]),...(practice?[practice.recordId]:[])];
   return ids.length?found(ids):none;}
  case 'homes-vacated':{
   const r=s.history.find(r=>of(r)&&r.kind==='housing-vacated');
   return r?found([r.id]):none;}
  case 'plenty-reached':{// food rose to 70 or more in year - 1, with every district covered for the last 5 years
   const districts=s.economy?.districts??[],food=metricsAt(ledger,y)?.[0],before=metricsAt(ledger,y-1)?.[0];
   const covered=districts.length>0&&districts.every(d=>d.coverage.length===5&&d.coverage.every(c=>c>=.9));
   return covered&&food!==undefined&&before!==undefined&&food>=70&&before<70?found([],['economy:coverage>=0.90@'+(y-4)+'..'+y,'metrics:food '+before.toFixed(1)+'→'+food.toFixed(1)+'@'+y]):none;}
 }
}

export interface ReviewDecision {
 readonly ruleId:typeof DECISION_POLICY_D2B_ID;readonly templateId:string;readonly actionIds:readonly string[];
 readonly sources:readonly string[];readonly evidence:readonly string[];
 readonly weights:readonly number[];readonly autonomousIndex:number;
}
/** The branch to present this year, or null. Deterministic: no RNG. Earliest template in catalog order when several hold. */
export function proposeReviewDecision(s:CivilizationState):{templateIndex:number;facts:DecisionIssueFacts}|null {
 const lastYear=s.decisions.at(-1)?.year;
 if(lastYear!==undefined&&s.year-lastYear<DECISION_TIMING.minimumGap)return null;
 for(let i=0;i<DECISION_CATALOG.length;i++){
  const e=DECISION_CATALOG[i]!;if(e.issue==='suspended')continue;
  const previous=[...s.decisions].reverse().find(d=>(d as {templateId?:string}).templateId===e.templateId);
  if(previous&&s.year-previous.year<DECISION_TIMING.templateInterval)continue;
  const facts=decisionIssueAt(s,e.issue);if(facts.holds)return {templateIndex:i,facts};
 }
 return null;
}
/** Weights of the civilization's own choice: 1 + 2 × (strength of the institution the action continues) / 100, in 1..3. */
export function autonomousWeights(s:CivilizationState,templateIndex:number):number[] {
 return DECISION_CATALOG[templateIndex]!.actionIds.map(a=>{const k=ACTION_TENDENCY[a];const strength=k?(s.memory?.legacies[k]?.strength??0):0;return 1+2*Math.min(100,Math.max(0,strength))/100;});
}
export function weightedIndex(draw:number,weights:readonly number[]):number {
 const sum=weights.reduce((a,w)=>a+w,0);let x=draw*sum;
 for(let i=0;i<weights.length;i++){x-=weights[i]!;if(x<0)return i;}
 return weights.length-1;
}
export function checkDecisionCatalog():void {
 if(DECISION_CATALOG.length!==decisionTemplatesV1.length)throw Error('decision policy: catalog differs from the templates');
 DECISION_CATALOG.forEach((e,i)=>{if(e.actionIds.length!==decisionTemplatesV1[i]!.options.length)throw Error('decision policy: actions of '+e.templateId);});
}
