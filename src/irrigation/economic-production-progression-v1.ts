import {economicProductionViewInternal} from './economic-production-view-internal.js';
/** Dedicated production writer. No public C2 progression, codec or ownership calls. */
import {economicProductionBoundary,assertProductionBoundary} from '../story/trial-boundary.js';
import {createGeneratedWorldSave,restoreGeneratedWorld,validateWorldSave,type GeneratedWorldSave} from '../story/world-save.js';
import {lastObservedYear} from '../story/engine.js';
import {createRegionalEconomy} from '../story/regional-economy.js';
import {coupledChoiceBinding} from '../story/coupled-choice-binding-internal.js';
import {regions} from '../story/population.js';
import {coupledRuntimeRules} from './coupled-types-v1.js';
import {irrigationEconomyRule} from './economy-types-v1.js';
import {runAnnualKernel} from './annual-baseline-internal.js';
import {captureEconomicOriginInternal} from './economic-origin-internal.js';
import {economicSourceCursorsInternal} from './economic-source-cursors-internal.js';
import {reviewBaseHash,freezeReviewRecordInternal} from './wire-v1.js';
import {economicOriginDialect,type EconomicProductionWorld} from './economic-production-types-v1.js';
import {ownEconomicProductionWorldInternal as own,knownEconomicProductionWorldInternal as known} from './economic-production-owned-internal.js';
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
export async function introduceEconomicProduction(input:GeneratedBridgeReview|EconomicProductionWorld):Promise<EconomicProductionWorld>{
 if(input.format==='irrigation-economic-production-world-v1'){known(input);return input;}
 assertProductionBoundary(input);return createEconomicProductionFromSave(createGeneratedWorldSave(input));
}
export async function createEconomicProductionFromSave(input:GeneratedWorldSave):Promise<EconomicProductionWorld>{
 const save=validateWorldSave(input) as GeneratedWorldSave;
 if(save.version!==6||save.state.pending||save.state.year>=10000)throw Error('Economic introduction requires a confirmed v6 year below 10000');
 const base=restoreGeneratedWorld(save),year=lastObservedYear(base.review.state);
 const originPrefix=captureEconomicOriginInternal(save,economicOriginDialect),originHash=await reviewBaseHash(save);
 return own({...base,format:'irrigation-economic-production-world-v1',status:'production',review:{...base.review,economicPolicyBoundary:economicProductionBoundary},economicCoupling:{schemaVersion:1,ruleId:economicProductionBoundary,policy:'combined',formula:irrigationEconomyRule,runtimeRules:coupledRuntimeRules,introducedYear:year,confirmedThrough:year,originPending:false,originRngState:base.review.state.rngState,initialEconomy:structuredClone(base.review.state.economy??createRegionalEconomy()),originPrefix,originHash,receipts:[],phases:[],checkpoints:[],prepared:null}});
}
function progress(input:EconomicProductionWorld,run:Parameters<typeof runAnnualKernel>[1]):EconomicProductionWorld{
 known(input);const before=input.economicCoupling,receipts=[...before.receipts],checkpoints=[...before.checkpoints];let applied=before.confirmedThrough;
 const result=runAnnualKernel(economicProductionViewInternal(input),run,{}, {mode:'production',policy:'combined',introducedYear:before.introducedYear,prepared:before.prepared,capture(c,p){
  if(c.year!==applied+1||p.effect.sourceYear!==applied)throw Error('Duplicate economic production commit');
  const mask=(v:readonly boolean[])=>v.reduce((m,x,i)=>m|(x?1<<i:0),0);
  receipts.push(freezeReviewRecordInternal({year:c.year,effect:p.effect,gainBp:p.modifier.gainBp,costBp:p.modifier.costBp,input:[[...c.before.people],c.drought,mask(regions.map(r=>c.conditions.blockedRegions.includes(r.id))),c.conditions.granaries?mask(c.conditions.granaries):-1,c.conditions.disruptionId??null,c.records.map(r=>r.id)],harvest:[...c.totals.harvest],discarded:[...c.totals.discarded]}));applied=c.year;
 },checkpoint(year,review,phaseCount){checkpoints.push({year,economy:structuredClone(review.state.economy!),people:[...review.state.observation!.people],phaseCount:before.phases.length+phaseCount,sourceCursors:economicSourceCursorsInternal(review,year)});}});
 if(applied!==result.diagnostics.confirmedThrough)throw Error('Economic production confirmation differs');
 return own({...result.world,format:'irrigation-economic-production-world-v1',status:'production',review:{...result.world.review,economicPolicyBoundary:economicProductionBoundary},economicCoupling:{...before,confirmedThrough:applied,receipts,checkpoints,phases:[...before.phases,...result.diagnostics.phases],prepared:result.prepared}});
}
export function advanceEconomicProductionWorld(input:EconomicProductionWorld,years:number,choices:'stop'|'automatic'='stop',options:{readonly stopAtNewRecord?:boolean}={}):EconomicProductionWorld{
 known(input);if(!Number.isSafeInteger(years)||years<0||years>10000||input.review.state.year+years>10000||!['stop','automatic'].includes(choices)||Object.keys(options).some(k=>k!=='stopAtNewRecord')||options.stopAtNewRecord!==undefined&&typeof options.stopAtNewRecord!=='boolean')throw Error('Invalid economic production advance');
 if(!years)return input;return progress(input,(batch,commit)=>batch.advance(years,choices,options.stopAtNewRecord,commit));
}
export function chooseEconomicProductionWorld(input:EconomicProductionWorld,index:number|'random',binding?:string):EconomicProductionWorld{
 known(input);if(!input.review.state.pending||binding!==undefined&&binding!==coupledChoiceBinding(input.review.state))throw Error('Missing or stale economic production choice');
 return progress(input,(batch,commit)=>batch.choose(index,commit));
}
