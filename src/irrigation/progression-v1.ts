/** Explicit independent trial writer; production progression is only advanced through its existing API. */
import {advanceGeneratedBridgeReview,chooseGeneratedBridgeReview,chooseAutomaticallyGeneratedBridgeReview,type GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import {createGeneratedWorldSave,restoreGeneratedWorld} from '../story/world-save.js';
import {lastObservedYear} from '../story/engine.js';
import {proposeIrrigation} from './geometry-v1.js';
import {replayIrrigation} from './replay-v1.js';
import {ownIrrigationReview,knownIrrigationReview,validateControls} from './history-v1.js';
import {reviewBaseHash} from './wire-v1.js';
import {irrigationHistoryLimits as limits,type IrrigationReview,type IrrigationControl} from './review-types-v1.js';
async function commit(world:GeneratedBridgeReview,introducedYear:number,mode:'natural'|'controlled',controls:readonly IrrigationControl[],previous?:IrrigationReview):Promise<IrrigationReview>{
 const base=createGeneratedWorldSave(world),end=lastObservedYear(world.review.state);if(!base.environment||world.vegetation?.schemaVersion!==2||!Number.isSafeInteger(introducedYear)||introducedYear<0||introducedYear>end||end>limits.maxYears)throw Error('Invalid irrigation introduction');
 const input=structuredClone(validateControls(controls,mode,introducedYear,end)),replay=replayIrrigation(base,introducedYear,input,proposeIrrigation,previous);
 return ownIrrigationReview({format:'irrigation-review-v1',schemaVersion:1,ruleId:'irrigation-history-v1',status:'review-only',mode,introducedYear,confirmedThrough:end,base,baseHash:await reviewBaseHash(base),controls:structuredClone(input),...replay});
}
export async function createIrrigationReview(world:GeneratedBridgeReview,introducedYear=lastObservedYear(world.review.state),mode:'natural'|'controlled'='natural',controls:readonly IrrigationControl[]=[]):Promise<IrrigationReview>{if(!['natural','controlled'].includes(mode))throw Error('Invalid irrigation trial mode');return commit(world,introducedYear,mode,controls);}
export async function advanceIrrigationReview(trial:IrrigationReview,years:number,choices:'stop'|'automatic'='automatic',controls:readonly IrrigationControl[]=[]):Promise<IrrigationReview>{
 knownIrrigationReview(trial);if(!['stop','automatic'].includes(choices)||!Number.isSafeInteger(years)||years<0||trial.base.state.year+years>limits.maxYears)throw Error('Invalid trial advance');
 for(const c of controls)if(c.year<=trial.confirmedThrough)throw Error('Cannot alter confirmed controls');
 const world=advanceGeneratedBridgeReview(restoreGeneratedWorld(trial.base),years,choices);return commit(world,trial.introducedYear,trial.mode,[...trial.controls,...controls],trial);
}
export async function chooseIrrigationReview(trial:IrrigationReview,index:number|'random',controls:readonly IrrigationControl[]=[]):Promise<IrrigationReview>{
 knownIrrigationReview(trial);const base=restoreGeneratedWorld(trial.base);if(!base.review.state.pending)throw Error('No pending trial choice');for(const c of controls)if(c.year<=trial.confirmedThrough)throw Error('Cannot alter confirmed controls');
 const world=index==='random'?chooseAutomaticallyGeneratedBridgeReview(base):chooseGeneratedBridgeReview(base,index);return commit(world,trial.introducedYear,trial.mode,[...trial.controls,...controls],trial);
}
