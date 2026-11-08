/** Explicit independent trial writer; production progression is only advanced through its existing API. */
import {advanceGeneratedBridgeReview,chooseGeneratedBridgeReview,chooseAutomaticallyGeneratedBridgeReview,type GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import {createGeneratedWorldSave,restoreGeneratedWorld} from '../story/world-save.js';
import {lastObservedYear} from '../story/engine.js';
import {proposeIrrigation} from './geometry-v1.js';
import {replayIrrigation} from './replay-v1.js';
import {ownIrrigationReview,knownIrrigationReview,validateControls} from './history-v1.js';
import {reviewBaseHash} from './wire-v1.js';
import {irrigationHistoryLimits as limits,type IrrigationReview,type IrrigationControl} from './review-types-v1.js';
export interface IrrigationAdvanceTimings {restoreMs:number;civilizationMs:number;snapshotMs:number;ecologyMs:number;bindingMs:number;ownershipMs:number;totalMs:number}
async function commit(world:GeneratedBridgeReview,introducedYear:number,mode:'natural'|'controlled',controls:readonly IrrigationControl[],previous?:IrrigationReview,timing?:IrrigationAdvanceTimings):Promise<IrrigationReview>{
 let mark=timing?performance.now():0;const base=createGeneratedWorldSave(world),end=lastObservedYear(world.review.state);if(!base.environment||world.vegetation?.schemaVersion!==2||!Number.isSafeInteger(introducedYear)||introducedYear<0||introducedYear>end||end>limits.maxYears)throw Error('Invalid irrigation introduction');
 if(timing){timing.snapshotMs=performance.now()-mark;mark=performance.now();}
 const input=structuredClone(validateControls(controls,mode,introducedYear,end)),replay=replayIrrigation(base,introducedYear,input,proposeIrrigation,previous);
 if(timing){timing.ecologyMs=performance.now()-mark;mark=performance.now();}
 const baseHash=await reviewBaseHash(base);if(timing){timing.bindingMs=performance.now()-mark;mark=performance.now();}
 const result=ownIrrigationReview({format:'irrigation-review-v1',schemaVersion:1,ruleId:'irrigation-history-v1',status:'review-only',mode,introducedYear,confirmedThrough:end,base,baseHash,controls:structuredClone(input),...replay});if(timing)timing.ownershipMs=performance.now()-mark;return result;
}
export async function createIrrigationReview(world:GeneratedBridgeReview,introducedYear=lastObservedYear(world.review.state),mode:'natural'|'controlled'='natural',controls:readonly IrrigationControl[]=[]):Promise<IrrigationReview>{if(!['natural','controlled'].includes(mode))throw Error('Invalid irrigation trial mode');return commit(world,introducedYear,mode,controls);}
async function advanceTrial(trial:IrrigationReview,years:number,choices:'stop'|'automatic'='automatic',controls:readonly IrrigationControl[]=[],timing?:IrrigationAdvanceTimings):Promise<IrrigationReview>{
 knownIrrigationReview(trial);if(!['stop','automatic'].includes(choices)||!Number.isSafeInteger(years)||years<0||trial.base.state.year+years>limits.maxYears)throw Error('Invalid trial advance');
 for(const c of controls)if(c.year<=trial.confirmedThrough)throw Error('Cannot alter confirmed controls');
 const begin=timing?performance.now():0,base=restoreGeneratedWorld(trial.base);if(timing)timing.restoreMs=performance.now()-begin;const mark=timing?performance.now():0,world=advanceGeneratedBridgeReview(base,years,choices);if(timing)timing.civilizationMs=performance.now()-mark;const result=await commit(world,trial.introducedYear,trial.mode,[...trial.controls,...controls],trial,timing);if(timing)timing.totalMs=performance.now()-begin;return result;
}
export async function advanceIrrigationReview(trial:IrrigationReview,years:number,choices:'stop'|'automatic'='automatic',controls:readonly IrrigationControl[]=[]):Promise<IrrigationReview>{return advanceTrial(trial,years,choices,controls);}
/** Same pipeline, separate non-persistent timings; no phase is subtracted from totalMs. */
export async function measureIrrigationAdvance(trial:IrrigationReview,years:number){const timing:IrrigationAdvanceTimings={restoreMs:0,civilizationMs:0,snapshotMs:0,ecologyMs:0,bindingMs:0,ownershipMs:0,totalMs:0};const review=await advanceTrial(trial,years,'automatic',[],timing);return {review,timing};}
export async function chooseIrrigationReview(trial:IrrigationReview,index:number|'random',controls:readonly IrrigationControl[]=[]):Promise<IrrigationReview>{
 knownIrrigationReview(trial);const base=restoreGeneratedWorld(trial.base);if(!base.review.state.pending)throw Error('No pending trial choice');for(const c of controls)if(c.year<=trial.confirmedThrough)throw Error('Cannot alter confirmed controls');
 const world=index==='random'?chooseAutomaticallyGeneratedBridgeReview(base):chooseGeneratedBridgeReview(base,index);return commit(world,trial.introducedYear,trial.mode,[...trial.controls,...controls],trial);
}
