import {assertProductionBoundary} from '../story/trial-boundary.js';
/** Production writer. Imported only by progression/new-world entry points. */
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import {lastObservedYear} from '../story/engine.js';
import {validateEnvironment,validateCoupledVegetation,baseVegetation} from '../environment/history-v1.js';
import {coupleVegetation,climateTarget,calmClimateTarget} from '../environment/progression-v1.js';
import {landUseEvents,type CoupledVegetation} from '../environment/model-v1.js';
import {syncVegetationHistory} from '../vegetation/history-v1.js';
import {proposeIrrigation} from './geometry-v1.js';
import {replayProduction,ownProductionWorld,climateRule} from './production-history-v1.js';
export function introduceProductionIrrigation(input:GeneratedBridgeReview):GeneratedBridgeReview {assertProductionBoundary(input);
 if(input.irrigation)return input;
 if(!input.environment||input.vegetation?.schemaVersion!==2||input.review.growthPattern!=='organic-v3')throw Error('Irrigation requires recorded environment and cross-river growth');
 const v=validateCoupledVegetation(input.vegetation,input.review),e=validateEnvironment(input.environment,v,input.review),year=lastObservedYear(input.review.state),checkpoints=e.checkpoints.map(s=>({...s,channel:null}));if(checkpoints.at(-1)!.year!==year)checkpoints.push({...e.current,channel:null});
 if(year>10000)throw Error('Irrigation exceeds 10000 years');
 const copy=structuredClone({...input.review,terrain:null}),review={...copy,terrain:input.review.terrain};
 return ownProductionWorld({...input,review,vegetation:v,environment:{...e,schemaVersion:2,ruleId:'environment-irrigated-v1',climateRule:e.ruleId as 'environment-coupled-v1'|'environment-coupled-v2',checkpoints,current:{...e.current,channel:null}},irrigation:{schemaVersion:1,ruleId:'irrigation-production-v1',introducedYear:year,confirmedThrough:year,preIntroductionRendererId:input.environmentAppearance==='landscape-v3'?'generated-scene-v5':input.environmentAppearance==='landscape-v2'?'generated-scene-v4':'generated-scene-v3',systems:[],events:[],attempts:[]}});
}
export function advanceProductionEnvironment(input:GeneratedBridgeReview):GeneratedBridgeReview {assertProductionBoundary(input);
 const previous={irrigation:input.irrigation!,environment:input.environment!},e=previous.environment,end=lastObservedYear(input.review.state);if(end>10000)throw Error('Irrigation exceeds 10000 years');if(end<e.confirmedThrough)throw Error('Cannot rewind irrigation writer');
 const vegetation=coupleVegetation(syncVegetationHistory(baseVegetation(input.vegetation as CoupledVegetation),input.review)),targets=[...e.targets];
 for(let y=e.confirmedThrough+1;y<=end;y++)if(y%100===0)targets.push(climateRule(e)==='environment-coupled-v2'&&y>=e.climateStart!?calmClimateTarget(e.seed,y,e.climateStart):climateTarget(e.seed,y));
 const world={...input,vegetation,environment:{...e,confirmedThrough:end,targets,uses:landUseEvents(input.review)},irrigation:{...previous.irrigation,confirmedThrough:end}},task=replayProduction(world,proposeIrrigation,previous);
 for(;;){const result=task.next();if(result.done)return ownProductionWorld({...world,...result.value});}
}
export function slowProductionClimate(input:GeneratedBridgeReview):GeneratedBridgeReview {assertProductionBoundary(input);const e=input.environment!;if(e.climateRule==='environment-coupled-v2')return input;return ownProductionWorld({...input,environment:{...e,climateRule:'environment-coupled-v2',climateStart:(Math.floor(e.confirmedThrough/100)+1)*100}});}
