/** Shared private annual mechanics; returns data without registering either world profile. */
import {regions} from '../story/population.js';
import {runAnnualTerrainKernelInternal} from '../irrigation/annual-baseline-internal.js';
import {economicSourceCursorsInternal} from '../irrigation/economic-source-cursors-internal.js';
import {freezeReviewRecordInternal,freezeReviewWriterDataInternal} from '../irrigation/wire-v1.js';
import {resolveTerrainAtYear,terrainHistoryThrough} from './terrain-revision-v1.js';
import {terrainEvolutionViewInternal} from './terrain-evolution-view-internal.js';
import {selectNaturalTerrainCutInternal} from './terrain-cut-selection-internal.js';
import {terrainCutVegetationEventsInternal} from './terrain-evolution-events-internal.js';
import type {TerrainEvolutionWorld,TerrainEvolutionLedger} from './terrain-evolution-types-internal.js';
import type {TerrainEvolutionProfile} from './terrain-profile-internal.js';
type KernelRun=Parameters<typeof runAnnualTerrainKernelInternal>[1];type Batch=Parameters<KernelRun>[0];type Commit=Parameters<KernelRun>[1];
export async function progressTerrainEvolutionInternal(input:TerrainEvolutionWorld,ledger:TerrainEvolutionLedger,profile:TerrainEvolutionProfile,run:(batch:Batch,commit:Commit,boundary:()=>Promise<void>)=>Promise<void>,observeInteraction?:import('../story/economy-observer.js').InteractionObserverInternal){
 const before=input.economicCoupling,receipts=[...before.receipts],checkpoints=[...before.checkpoints],decisions=[...ledger.decisions];let applied=before.confirmedThrough,history=input.terrainHistory,projection=terrainHistoryThrough(history,Math.max(history.confirmedThrough,input.review.state.year)),yielded=performance.now();
 const boundary=async(review:Batch['review'])=>{
  history=terrainHistoryThrough(history,applied);const year=applied,t=ledger;
  if(t.policy==='cut'&&!review.state.pending&&year>t.introducedYear&&year<10000&&year%100===0&&!decisions.some(d=>d.year===year)){const decision=await selectNaturalTerrainCutInternal(review,history,year,profile.cutRule);history=decision.history;decisions.push(freezeReviewRecordInternal(decision.decision));}
  projection=terrainHistoryThrough(history,Math.max(history.confirmedThrough,review.state.year));if(performance.now()-yielded>=8){await new Promise(r=>setTimeout(r,0));yielded=performance.now();}
 };
 const result=await runAnnualTerrainKernelInternal(terrainEvolutionViewInternal(input),async(batch,commit)=>run(batch,commit,()=>boundary(batch.review)),{mode:profile.kind==='production'?'terrain-production':'terrain-trial',...(observeInteraction?{observeInteraction}:{}),policy:'combined',introducedYear:before.introducedYear,prepared:before.prepared,terrain:{at:(year,site)=>{if(site!=='hill-side')return history.initial;if(year>projection.confirmedThrough)projection=terrainHistoryThrough(projection,year);return resolveTerrainAtYear(projection,year);},disturbancesAt:year=>terrainCutVegetationEventsInternal(history,year)},capture(c,p){
  if(c.year!==applied+1||p.effect.sourceYear!==applied)throw Error('Duplicate terrain economic commit');const mask=(v:readonly boolean[])=>v.reduce((m,x,i)=>m|(x?1<<i:0),0);
  receipts.push(freezeReviewWriterDataInternal({year:c.year,effect:p.effect,gainBp:p.modifier.gainBp,costBp:p.modifier.costBp,input:[c.before.people,c.drought,mask(regions.map(r=>c.conditions.blockedRegions.includes(r.id))),c.conditions.granaries?mask(c.conditions.granaries):-1,c.conditions.disruptionId??null,c.records.map(r=>r.id)],harvest:c.totals.harvest,discarded:c.totals.discarded}));applied=c.year;
 },checkpoint(year,review,phaseCount){checkpoints.push({year,economy:structuredClone(review.state.economy!),people:[...review.state.observation!.people],phaseCount:before.phases.length+phaseCount,sourceCursors:economicSourceCursorsInternal(review,year)});}});
 if(applied!==result.diagnostics.confirmedThrough)throw Error('Terrain economic confirmation differs');
 return {world:result.world,economicCoupling:{...before,confirmedThrough:applied,receipts,checkpoints,phases:[...before.phases,...result.diagnostics.phases],prepared:result.prepared},terrainHistory:terrainHistoryThrough(history,applied),ledger:{...ledger,confirmedThrough:applied,decisions}};
}

export function terrainAdvanceRunInternal(input:TerrainEvolutionWorld,ledger:TerrainEvolutionLedger,years:number,choices:'stop'|'automatic',options:{readonly stopAtNewRecord?:boolean}={}){
 const target=input.review.state.year+years,historyLength=input.review.state.history.length;
 return async(batch:Batch,commit:Commit,boundary:()=>Promise<void>)=>{
  while(batch.review.state.year<target){
   if(batch.review.state.pending){if(choices==='stop')break;batch.choose('random',commit);await boundary();}
   else {const end=ledger.policy==='none'?target:Math.min(target,(Math.floor(batch.review.state.year/100)+1)*100);batch.advance(end-batch.review.state.year,choices,options.stopAtNewRecord,commit);await boundary();}
   if(batch.review.state.pending&&choices==='stop'||options.stopAtNewRecord&&batch.review.state.history.length>historyLength)break;
  }
 };
}
export const terrainChoiceRunInternal=(index:number|'random')=>async(batch:Batch,commit:Commit,boundary:()=>Promise<void>)=>{batch.choose(index,commit);await boundary();};
