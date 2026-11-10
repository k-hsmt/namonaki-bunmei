import {bindTerrainReviewInternal,type TerrainReviewProvider} from '../story/terrain-review-binding-internal.js';
import type {VegetationEvent} from '../vegetation/history-v1.js';
/** Neutral annual ecology foundation. Still B, not an economic C2 trial/save. */
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import {createGeneratedFacilityBatch,createCoupledFacilityBatch,createEconomicProductionFacilityBatch,createTerrainChangeFacilityBatch,createTerrainProductionFacilityBatch} from '../story/generated-facility-batch-internal.js';
import {coupledAnnualModifier,type CoupledAnnualModifier} from '../story/coupled-economy-policy-internal.js';
import {coupledTrialBoundary,economicProductionBoundary,terrainChangeTrialBoundary,terrainProductionBoundary} from '../story/trial-boundary.js';
import type {EconomyCapture} from '../story/economy-observer.js';
import {economyEffectCalculator} from './economy-effect-core-v1.js';
import type {EconomyEffect,EconomyPolicy} from './economy-types-v1.js';
import {freezeReview,freezeReviewRecordInternal} from './wire-v1.js';
import type {GeneratedAdvanceOptions} from '../story/generated-facility-review.js';
import {generatedPublicSpaceExtension,validateGeneratedPublicSpaceLedger} from '../story/generated-public-space-review.js';
import {validateGeneratedBridgeLedger} from '../story/generated-bridge-history-review.js';
import {lastObservedYear} from '../story/engine.js';
import {annualLandSources} from '../environment/annual-land-sources-internal.js';
import {irrigationEnvironmentRunner,type CoupledVegetation,type IrrigationPatchEffects} from '../environment/model-v1.js';
import {calmClimateTarget,climateTarget} from '../environment/progression-v1.js';
import {incrementalIrrigationSources} from './sources-v1.js';
import {channelLifecycle} from './lifecycle-v1.js';
import {kernelGeometry,productionGeometry} from './production-types-v1.js';
import {proposeIrrigation} from './geometry-v1.js';
import {irrigationEffects,channelPatches} from './ecology-v1.js';
import {validateProductionWorld,ownProductionWorld,climateRule} from './production-history-v1.js';
import {boundedRngDraws} from '../story/rng-phase-diagnostics.js';
import type {BaselinePhaseReceipt} from './coupled-baseline-audit-v1.js';
export interface AnnualReceipt extends BaselinePhaseReceipt {readonly ecologyBefore:number;readonly ecologyAfter:number}
export interface PreparedCoupledEffect {readonly effect:EconomyEffect;readonly modifier:CoupledAnnualModifier}
export interface CoupledKernelHooks {
 readonly mode?:'trial'|'production'|'terrain-trial'|'terrain-production';
 readonly terrain?:{readonly at:TerrainReviewProvider;readonly disturbancesAt:(year:number)=>readonly VegetationEvent[]};
 readonly introducedYear:number;readonly policy:EconomyPolicy;readonly prepared:PreparedCoupledEffect|null;
 readonly capture:(capture:EconomyCapture,prepared:PreparedCoupledEffect)=>void;
 readonly checkpoint?:(year:number,review:GeneratedBridgeReview['review'],phaseCount:number)=>void;
}

function annualKernelSessionInternal(input:GeneratedBridgeReview,options:GeneratedAdvanceOptions={},trial?:CoupledKernelHooks){
 const terrainMode=trial?.mode==='terrain-trial'||trial?.mode==='terrain-production',terrainHooks=terrainMode?trial.terrain:undefined;
 if(terrainMode){
  if(!trial||!terrainHooks||trial.policy!=='combined'||input.review.economicPolicyBoundary!==undefined||input.review.trialBoundary!==undefined||(trial.mode==='terrain-production'?(input.review.terrainPolicyBoundary!==terrainProductionBoundary||input.review.terrainChangeBoundary!==undefined):(input.review.terrainChangeBoundary!==terrainChangeTrialBoundary||input.review.terrainPolicyBoundary!==undefined)))throw Error('Missing terrain annual boundary');bindTerrainReviewInternal(input.review,terrainHooks.at);
 }else if(trial?.mode==='production'){if(input.review.economicPolicyBoundary!==economicProductionBoundary||input.review.trialBoundary!==undefined||input.review.terrainChangeBoundary!==undefined||input.review.terrainPolicyBoundary!==undefined||trial.policy!=='combined')throw Error('Missing annual production boundary');}else if(trial){if(input.review.trialBoundary!==coupledTrialBoundary||input.review.terrainChangeBoundary!==undefined||input.review.terrainPolicyBoundary!==undefined)throw Error('Missing annual trial boundary');}else validateProductionWorld(input);
 validateGeneratedBridgeLedger(input.review);validateGeneratedPublicSpaceLedger(input.review,lastObservedYear(input.review.state));
 let prepare:()=>CoupledAnnualModifier=()=>{throw Error('Annual prefix not initialized');},prepared=trial?.prepared??null;
 const capture=(c:EconomyCapture)=>{if(!trial||!prepared)throw Error('Missing prepared economy effect');trial.capture(c,prepared);};
 const batch=terrainMode?(trial!.mode==='terrain-production'?createTerrainProductionFacilityBatch:createTerrainChangeFacilityBatch)(input.review,generatedPublicSpaceExtension,()=>prepare(),capture,terrainHooks!.at):trial?(trial.mode==='production'?createEconomicProductionFacilityBatch:createCoupledFacilityBatch)(input.review,generatedPublicSpaceExtension,()=>prepare(),capture):createGeneratedFacilityBatch(input.review,generatedPublicSpaceExtension,options.observeEconomy);
 const world={...input,review:{...batch.review,plans:input.review.plans,bridgeReview:{...batch.review.bridgeReview!,hydrology:input.review.bridgeReview!.hydrology}}};
 if(terrainHooks)bindTerrainReviewInternal(world.review,terrainHooks.at);
 const e=input.environment!,i=input.irrigation!,v=input.vegetation as CoupledVegetation;
 const cursor=annualLandSources(world.review),prefix=cursor.take(),index=incrementalIrrigationSources(world);index.append(prefix);
 const lifecycle=channelLifecycle(index.source,{systems:i.systems.map(s=>({...s,geometry:kernelGeometry(s.geometry)})),events:i.events,attempts:i.attempts,channel:e.current.channel??null},[],proposeIrrigation);
 let effects:IrrigationPatchEffects={moisture:Array(440).fill(0),occupiedPatches:[],disturbedPatches:[]},cached=effects,key='',through=e.confirmedThrough,totalDraws=0,ecologySteps=0;
 let prefixChannelEvents=i.events.filter(event=>event.year===through);
 const runner=irrigationEnvironmentRunner(v,world.review,e.uses,e.current,()=>effects),targets=[...e.targets],checkpoints=[...e.checkpoints],uses=[...e.uses],events=[...v.events],phases:AnnualReceipt[]=[];
 if(trial){
  const requirePrefix=(y:number)=>{if(y!==through)throw Error('Economy must read the previous confirmed prefix');};
  const calculate=economyEffectCalculator(world.review,index.source,{channelAt:y=>{requirePrefix(y);return lifecycle.channel;},system:id=>lifecycle.systems.find(s=>s.id===id),eventsAt:y=>{requirePrefix(y);return prefixChannelEvents;},environmentAt:y=>{requirePrefix(y);return {humidity:runner.climate().humidity,patchAt:i=>runner.patchAt('river-bank',i)};}},trial.introducedYear);
  prepare=()=>{
   if(!prepared||prepared.effect.sourceYear!==through){const effect=calculate(through+1);prepared=freezeReviewRecordInternal({effect:freezeReviewRecordInternal(effect),modifier:freezeReviewRecordInternal(coupledAnnualModifier(through+1,trial.policy,effect))});}
   if(prepared.modifier.year!==through+1||prepared.modifier.policy!==trial.policy)throw Error('Stale annual economy effect');return prepared.modifier;
  };
 }
 const commit=(phase:import('../story/generated-land-batch-internal.js').LandPhaseReceipt)=>{
  const draws=boundedRngDraws(phase.rngBefore,phase.rngAfter,phase.phase==='step'?64:phase.phase==='manual-choice'?0:1);
  if(phase.phase==='step'?draws<6:phase.phase==='automatic-choice'?draws!==1:draws!==0)throw Error('Unexpected annual RNG consumption');
  totalDraws+=draws;if(totalDraws>1000000)throw Error('Annual RNG batch exceeds bound');
  const ecologyBefore=through,record=()=>phases.push(freezeReviewRecordInternal({...phase,draws,ecologyBefore,ecologyAfter:through}));
  if(phase.confirmedBefore!==through)throw Error('Ecology did not commit before next phase');
  if(phase.confirmedAfter===through){if(!phase.pending)throw Error('Missing annual commit');record();return;}
  const year=phase.confirmedAfter;if(year!==through+1||phase.pending||year>10000)throw Error('Invalid annual ecology boundary');
  const delta=cursor.take();let vegetationEvents=delta.events;
  if(terrainHooks){const disturbances=terrainHooks.disturbancesAt(year);if(disturbances.length)vegetationEvents=[...vegetationEvents,...disturbances];}
  index.append(delta);uses.push(...delta.uses);events.push(...vegetationEvents);runner.append(delta.uses,vegetationEvents);
  const next=lifecycle.step(year),nextKey=[next.channel?.id,next.channel?.status,next.channel?.status==='active'?index.source.keyAt(year):0].join('/');
  prefixChannelEvents=next.events;
  if(key!==nextKey){cached=irrigationEffects(next.system,next.channel,next.channel?.status==='active'?next.frame:undefined);key=nextKey;}
  effects={...cached,disturbedPatches:[...new Set(next.events.filter(ev=>ev.kind==='built'||ev.kind==='backfilled').flatMap(ev=>channelPatches(lifecycle.systems.find(s=>s.id===ev.systemId)!)))].sort((a,b)=>a-b)};
  const slow=climateRule(e)==='environment-coupled-v2'&&year>=e.climateStart!;
  if(year%100===0)targets.push(slow?calmClimateTarget(e.seed,year,e.climateStart):climateTarget(e.seed,year));
  runner.step(targets[Math.floor(year/100)]!,slow);through=year;ecologySteps++;
  if((year-i.introducedYear)%100===0)checkpoints.push({...runner.snapshot(),channel:next.channel});
  record();
  if(trial&&(year-trial.introducedYear)%100===0)trial.checkpoint?.(year,world.review,phases.length);
 };
 const finish=()=>{
 const completed={...world,vegetation:{...v,confirmedThrough:through,events},environment:{...e,confirmedThrough:through,targets,uses,checkpoints,current:{...runner.snapshot(),channel:lifecycle.channel}},irrigation:{...i,confirmedThrough:through,systems:lifecycle.systems.map(s=>({...s,geometry:productionGeometry(s.geometry)})),events:lifecycle.events,attempts:lifecycle.attempts}},result=trial?freezeReview(completed):ownProductionWorld(completed);
 validateGeneratedBridgeLedger(result.review);validateGeneratedPublicSpaceLedger(result.review,through);
 return Object.freeze({world:result,prepared:result.review.state.pending?prepared:null,diagnostics:Object.freeze({format:'irrigation-annual-baseline-audit-v1' as const,originPending:!!input.review.state.pending,originPendingStepDraws:null,totalDraws,ecologySteps,confirmedThrough:through,phases:Object.freeze(phases)})});
 };
 return {batch,commit,finish};
}
export function runAnnualKernel(input:GeneratedBridgeReview,run:(batch:ReturnType<typeof createGeneratedFacilityBatch>,commit:(p:import('../story/generated-land-batch-internal.js').LandPhaseReceipt)=>void)=>void,options:GeneratedAdvanceOptions={},trial?:CoupledKernelHooks){const session=annualKernelSessionInternal(input,options,trial);run(session.batch,session.commit);return session.finish();}
/** D4 alone may pause its private batch for an asynchronous terrain commitment. */
export async function runAnnualTerrainKernelInternal(input:GeneratedBridgeReview,run:(batch:ReturnType<typeof createGeneratedFacilityBatch>,commit:(p:import('../story/generated-land-batch-internal.js').LandPhaseReceipt)=>void)=>Promise<void>,trial:CoupledKernelHooks){if(trial.mode!=='terrain-trial'&&trial.mode!=='terrain-production')throw Error('Asynchronous annual kernel requires terrain boundary');const session=annualKernelSessionInternal(input,{},trial);await run(session.batch,session.commit);return session.finish();}
export function advanceAnnualBaseline(input:GeneratedBridgeReview,years:number,choices:'stop'|'automatic'='automatic',options:GeneratedAdvanceOptions={}){
 if(!Number.isSafeInteger(years)||years<0||years>10000||input.review.state.year+years>10000||!['stop','automatic'].includes(choices))throw Error('Invalid annual baseline advance');
 return runAnnualKernel(input,(batch,commit)=>batch.advance(years,choices,options.stopAtNewRecord,commit),options);
}
export function chooseAnnualBaseline(input:GeneratedBridgeReview,index:number|'random'){
 return runAnnualKernel(input,(batch,commit)=>batch.choose(index,commit));
}
