import {coupledRuntimeRules} from './coupled-types-v1.js';
import {ownCoupledReview as own,knownCoupledReview as known} from './coupled-owned-internal.js';
import {captureCoupledOrigin,coupledSourceCursors} from './coupled-origin-v1.js';
/** Independent carried economics. No production save, session, or owner cache. */
import {validateWorldSave,restoreGeneratedWorld,type GeneratedWorldSave} from '../story/world-save.js';
import {lastObservedYear} from '../story/engine.js';
import {createRegionalEconomy} from '../story/regional-economy.js';
import {regions} from '../story/population.js';
import {coupledChoiceBinding} from '../story/coupled-choice-binding-internal.js';
import {coupledTrialBoundary} from '../story/trial-boundary.js';
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import {freezeReview,reviewBaseHash,freezeReviewWriterDataInternal} from './wire-v1.js';
import {economyPolicies,irrigationEconomyRule,type EconomyPolicy} from './economy-types-v1.js';
import {runAnnualKernel} from './annual-baseline-internal.js';
import type {IrrigationCoupledReview,CoupledChoiceProtocol,CoupledEconomyReceipt,CoupledReviewWorld} from './coupled-types-v1.js';

function trialWorld(world:GeneratedBridgeReview):CoupledReviewWorld {return {...world,format:'irrigation-coupled-review-world-v1',review:{...world.review,trialBoundary:coupledTrialBoundary}};}

export async function createCoupledReview(input:GeneratedWorldSave,policy:EconomyPolicy,choiceProtocol:CoupledChoiceProtocol='automatic-per-branch-v1'):Promise<IrrigationCoupledReview>{
 if(!economyPolicies.includes(policy)||!['automatic-per-branch-v1','common-explicit-v1'].includes(choiceProtocol))throw Error('Unknown coupled trial policy');
 const save=validateWorldSave(input);if(save.version!==6)throw Error('Coupled trial requires a validated v6 origin');
 // Validated save/world are owned and frozen before native hash yields.
 const world=restoreGeneratedWorld(save as GeneratedWorldSave),originHash=await reviewBaseHash(save),year=lastObservedYear(world.review.state);
 if(world.review.state.year>10000)throw Error('Coupled origin exceeds the trial horizon');
 return own({format:coupledTrialBoundary,schemaVersion:1,status:'review-only',ruleId:'irrigation-economy-coupled-v1',runtimeRules:coupledRuntimeRules,formula:irrigationEconomyRule,policy,choiceProtocol,originHash,introducedYear:year,confirmedThrough:year,originPending:!!world.review.state.pending,originRngState:world.review.state.rngState,initialEconomy:structuredClone(world.review.state.economy??createRegionalEconomy()),origin:captureCoupledOrigin(save as GeneratedWorldSave),checkpoints:[],world:trialWorld(world),receipts:[],phases:[],prepared:null});
}
function progress(input:IrrigationCoupledReview,run:Parameters<typeof runAnnualKernel>[1]):IrrigationCoupledReview {
 known(input);const receipts=[...input.receipts],checkpoints=[...input.checkpoints];let applied=input.confirmedThrough;
 // Internal geometry adapter keeps the land boundary. No production factory accepts it.
 const adapter={...input.world,format:'generated-bridge-review' as const};
 const result=runAnnualKernel(adapter,run,{}, {introducedYear:input.introducedYear,policy:input.policy,prepared:input.prepared,capture(c,p){
  if(c.year!==applied+1||p.modifier.year!==c.year||p.effect.sourceYear!==applied)throw Error('Duplicate or unconfirmed coupled economy application');
  const mask=(values:readonly boolean[])=>values.reduce((m,v,i)=>m|(v?1<<i:0),0);
  const blocked=mask(regions.map(region=>c.conditions.blockedRegions.includes(region.id)));
  const receipt:CoupledEconomyReceipt=freezeReviewWriterDataInternal({year:c.year,effect:p.effect,gainBp:p.modifier.gainBp,costBp:p.modifier.costBp,input:[c.before.people,c.drought,blocked,c.conditions.granaries?mask(c.conditions.granaries):-1,c.conditions.disruptionId??null,c.records.map(r=>r.id)],harvest:c.totals.harvest,discarded:c.totals.discarded});
  receipts.push(receipt);applied=c.year;
 },checkpoint(year,review,phaseCount){checkpoints.push({year,economy:structuredClone(review.state.economy!),people:[...review.state.observation!.people],phaseCount:input.phases.length+phaseCount,sourceCursors:coupledSourceCursors(review,year)});}});
 if(applied!==result.diagnostics.confirmedThrough)throw Error('Economy and ecology confirmation differ');
 return own({...input,confirmedThrough:applied,world:trialWorld(result.world),receipts,checkpoints,phases:[...input.phases,...result.diagnostics.phases],prepared:result.prepared});
}
export function advanceCoupledReview(input:IrrigationCoupledReview,years:number,choices:'stop'|'automatic'='automatic'):IrrigationCoupledReview {
 known(input);if(!Number.isSafeInteger(years)||years<0||years>10000||input.world.review.state.year+years>10000||!['stop','automatic'].includes(choices)||years>0&&input.choiceProtocol==='common-explicit-v1'&&choices!=='stop')throw Error('Invalid coupled advance or choice protocol');
 if(years===0)return input;
 return progress(input,(batch,commit)=>batch.advance(years,choices,false,commit));
}
/** Full versioned content binding; Decision.id alone only contains the year. */
export function coupledDecisionFingerprint(input:IrrigationCoupledReview):string {
 known(input);return coupledChoiceBinding(input.world.review.state);
}
export function chooseCoupledReview(input:IrrigationCoupledReview,index:number|'random',fingerprint?:string):IrrigationCoupledReview {
 known(input);
 if(!input.world.review.state.pending)throw Error('No coupled choice pending');
 if(input.choiceProtocol==='automatic-per-branch-v1'){if(index!=='random'||fingerprint!==undefined)throw Error('Automatic branch requires its own random choice');}
 else if(index==='random'||!Number.isSafeInteger(index)||fingerprint!==coupledDecisionFingerprint(input))throw Error('Explicit choice requires matching decision content');
 return progress(input,(batch,commit)=>batch.choose(index,commit));
}
/** Compare first, then commit each private branch. A mismatch advances none. */
export function chooseCommonCoupledReviews(inputs:readonly IrrigationCoupledReview[],index:number):readonly IrrigationCoupledReview[] {
 if(inputs.length<2)throw Error('Common choice requires multiple branches');
 const first=inputs[0]!,fingerprint=coupledDecisionFingerprint(first);
 for(const r of inputs){known(r);if(r.originHash!==first.originHash||r.choiceProtocol!=='common-explicit-v1'||coupledDecisionFingerprint(r)!==fingerprint)throw Error('Common coupled decision mismatch');}
 return Object.freeze(inputs.map(r=>chooseCoupledReview(r,index,fingerprint)));
}
