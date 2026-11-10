/** Dedicated independent earthworks writer, carrying the existing combined regional economics. */
import {lastObservedYear} from '../story/engine.js';
import {coupledChoiceBinding} from '../story/coupled-choice-binding-internal.js';
import {terrainChangeTrialBoundary} from '../story/trial-boundary.js';
import {regions} from '../story/population.js';
import {runAnnualTerrainKernelInternal} from '../irrigation/annual-baseline-internal.js';
import {prepareEconomicProductionSave} from '../irrigation/economic-production-storage-v1.js';
import {knownEconomicProductionWorldInternal} from '../irrigation/economic-production-owned-internal.js';
import type {EconomicProductionWorld} from '../irrigation/economic-production-types-v1.js';
import {economicSourceCursorsInternal} from '../irrigation/economic-source-cursors-internal.js';
import {freezeReviewRecordInternal} from '../irrigation/wire-v1.js';
import {createTerrainHistory,resolveTerrainAtYear,terrainHistoryThrough,type TerrainHistory} from './terrain-revision-v1.js';
import {terrainRevisionHash} from './terrain-revision-wire-v1.js';
import {captureTerrainOriginInternal} from './terrain-trial-origin-internal.js';
import {ownTerrainTrialWorldInternal as own,knownTerrainTrialWorldInternal as known,terrainTrialViewInternal} from './terrain-trial-owned-internal.js';
import {decideNaturalTerrainCut} from './terrain-cut-policy-v1.js';
import {terrainCutRuntimeRules} from './terrain-cut-rules-v1.js';
import type {TerrainTrialWorld} from './terrain-trial-types-v1.js';
import type {VegetationEvent} from '../vegetation/history-v1.js';
import {vegetationPatchPlot} from '../vegetation/history-v1.js';
export async function createTerrainTrial(input:EconomicProductionWorld,policy:'none'|'cut'='cut'):Promise<TerrainTrialWorld>{
 knownEconomicProductionWorldInternal(input);if(!['none','cut'].includes(policy)||input.review.state.pending||input.review.state.year>=10000)throw Error('Terrain introduction requires a confirmed v7 year below 10000');
 const packet=await prepareEconomicProductionSave(input),year=lastObservedYear(input.review.state),history=await createTerrainHistory(input.review.terrain,year),originHash=await terrainRevisionHash(packet),{economicPolicyBoundary:_,...review}=input.review;
 return own({...input,format:'terrain-change-review-world-v1',status:'review-only',review:{...review,terrainChangeBoundary:terrainChangeTrialBoundary},terrainHistory:history,terrainChanges:{schemaVersion:1,ruleId:terrainChangeTrialBoundary,policy,runtimeRules:terrainCutRuntimeRules,introducedYear:year,confirmedThrough:year,originHash,originPrefix:captureTerrainOriginInternal(packet),decisions:[]}});
}
export function terrainCutVegetationEventsInternal(history:TerrainHistory,year:number):readonly VegetationEvent[]{
 return history.events.filter(e=>e.effectiveYear===year).flatMap(e=>e.disturbedPatches.map(index=>({id:'terrain-clear/'+e.id+'/'+index,year,site:'hill-side' as const,kind:'clear' as const,plot:vegetationPatchPlot(index),sourceRecordId:e.id})));
}
type KernelRun=Parameters<typeof runAnnualTerrainKernelInternal>[1];type Batch=Parameters<KernelRun>[0];type Commit=Parameters<KernelRun>[1];
async function progress(input:TerrainTrialWorld,run:(batch:Batch,commit:Commit,boundary:()=>Promise<void>)=>Promise<void>):Promise<TerrainTrialWorld>{
 known(input);const before=input.economicCoupling,receipts=[...before.receipts],checkpoints=[...before.checkpoints],decisions=[...input.terrainChanges.decisions];let applied=before.confirmedThrough,history=input.terrainHistory,projection=terrainHistoryThrough(history,Math.max(history.confirmedThrough,input.review.state.year)),yielded=performance.now();
 const boundary=async(review:Batch['review'])=>{
  history=terrainHistoryThrough(history,applied);const year=applied,t=input.terrainChanges;
  if(t.policy==='cut'&&!review.state.pending&&year>t.introducedYear&&year<10000&&year%100===0&&!decisions.some(d=>d.year===year)){const decision=await decideNaturalTerrainCut(review,history,year);history=decision.history;decisions.push(freezeReviewRecordInternal(decision.decision));}
  projection=terrainHistoryThrough(history,Math.max(history.confirmedThrough,review.state.year));if(performance.now()-yielded>=8){await new Promise(r=>setTimeout(r,0));yielded=performance.now();}
 };
 const result=await runAnnualTerrainKernelInternal(terrainTrialViewInternal(input),async(batch,commit)=>run(batch,commit,()=>boundary(batch.review)),{mode:'terrain-trial',policy:'combined',introducedYear:before.introducedYear,prepared:before.prepared,terrain:{at:(year,site)=>{if(site!=='hill-side')return history.initial;if(year>projection.confirmedThrough)projection=terrainHistoryThrough(projection,year);return resolveTerrainAtYear(projection,year);},disturbancesAt:year=>terrainCutVegetationEventsInternal(history,year)},capture(c,p){
  if(c.year!==applied+1||p.effect.sourceYear!==applied)throw Error('Duplicate terrain economic commit');const mask=(v:readonly boolean[])=>v.reduce((m,x,i)=>m|(x?1<<i:0),0);
  receipts.push(freezeReviewRecordInternal({year:c.year,effect:p.effect,gainBp:p.modifier.gainBp,costBp:p.modifier.costBp,input:[[...c.before.people],c.drought,mask(regions.map(r=>c.conditions.blockedRegions.includes(r.id))),c.conditions.granaries?mask(c.conditions.granaries):-1,c.conditions.disruptionId??null,c.records.map(r=>r.id)],harvest:[...c.totals.harvest],discarded:[...c.totals.discarded]}));applied=c.year;
 },checkpoint(year,review,phaseCount){checkpoints.push({year,economy:structuredClone(review.state.economy!),people:[...review.state.observation!.people],phaseCount:before.phases.length+phaseCount,sourceCursors:economicSourceCursorsInternal(review,year)});}});
 if(applied!==result.diagnostics.confirmedThrough)throw Error('Terrain economic confirmation differs');
 return own({...result.world,format:'terrain-change-review-world-v1',status:'review-only',review:{...result.world.review,terrainChangeBoundary:terrainChangeTrialBoundary},economicCoupling:{...before,confirmedThrough:applied,receipts,checkpoints,phases:[...before.phases,...result.diagnostics.phases],prepared:result.prepared},terrainHistory:terrainHistoryThrough(history,applied),terrainChanges:{...input.terrainChanges,confirmedThrough:applied,decisions}});
}
export async function advanceTerrainTrial(input:TerrainTrialWorld,years:number,choices:'stop'|'automatic'='stop',options:{readonly stopAtNewRecord?:boolean}={}):Promise<TerrainTrialWorld>{
 known(input);if(!Number.isSafeInteger(years)||years<0||input.review.state.year+years>10000||!['stop','automatic'].includes(choices)||Object.keys(options).some(k=>k!=='stopAtNewRecord')||options.stopAtNewRecord!==undefined&&typeof options.stopAtNewRecord!=='boolean')throw Error('Invalid terrain trial advance');if(!years)return input;
 const target=input.review.state.year+years,historyLength=input.review.state.history.length;
 return progress(input,async(batch,commit,boundary)=>{
  while(batch.review.state.year<target){
   if(batch.review.state.pending){if(choices==='stop')break;batch.choose('random',commit);await boundary();}
   else {const end=input.terrainChanges.policy==='none'?target:Math.min(target,(Math.floor(batch.review.state.year/100)+1)*100);batch.advance(end-batch.review.state.year,choices,options.stopAtNewRecord,commit);await boundary();}
   if(batch.review.state.pending&&choices==='stop'||options.stopAtNewRecord&&batch.review.state.history.length>historyLength)break;
  }
 });
}
export async function chooseTerrainTrial(input:TerrainTrialWorld,index:number|'random',binding?:string):Promise<TerrainTrialWorld>{known(input);if(!input.review.state.pending||binding!==undefined&&binding!==coupledChoiceBinding(input.review.state))throw Error('Missing or stale terrain choice');return progress(input,async(batch,commit,boundary)=>{batch.choose(index,commit);await boundary();});}
