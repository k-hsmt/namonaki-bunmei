/** Neutral annual ecology foundation. Still B, not an economic C2 trial/save. */
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import {createGeneratedFacilityBatch} from '../story/generated-facility-batch-internal.js';
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
import {boundedRngDraws,type BaselinePhaseReceipt} from './coupled-baseline-audit-v1.js';
interface AnnualReceipt extends BaselinePhaseReceipt {readonly ecologyBefore:number;readonly ecologyAfter:number}

function annualBaseline(input:GeneratedBridgeReview,run:(batch:ReturnType<typeof createGeneratedFacilityBatch>,commit:(p:import('../story/generated-land-batch-internal.js').LandPhaseReceipt)=>void)=>void,options:GeneratedAdvanceOptions={}){
 validateProductionWorld(input);validateGeneratedBridgeLedger(input.review);validateGeneratedPublicSpaceLedger(input.review,lastObservedYear(input.review.state));
 const batch=createGeneratedFacilityBatch(input.review,generatedPublicSpaceExtension,options.observeEconomy);
 const world={...input,review:{...batch.review,plans:input.review.plans,bridgeReview:{...batch.review.bridgeReview!,hydrology:input.review.bridgeReview!.hydrology}}};
 const e=input.environment!,i=input.irrigation!,v=input.vegetation as CoupledVegetation;
 const cursor=annualLandSources(world.review),prefix=cursor.take(),index=incrementalIrrigationSources(world);index.append(prefix);
 const lifecycle=channelLifecycle(index.source,{systems:i.systems.map(s=>({...s,geometry:kernelGeometry(s.geometry)})),events:i.events,attempts:i.attempts,channel:e.current.channel??null},[],proposeIrrigation);
 let effects:IrrigationPatchEffects={moisture:Array(440).fill(0),occupiedPatches:[],disturbedPatches:[]},cached=effects,key='',through=e.confirmedThrough,totalDraws=0,ecologySteps=0;
 const runner=irrigationEnvironmentRunner(v,world.review,e.uses,e.current,()=>effects),targets=[...e.targets],checkpoints=[...e.checkpoints],uses=[...e.uses],events=[...v.events],phases:AnnualReceipt[]=[];
 run(batch,phase=>{
  const draws=boundedRngDraws(phase.rngBefore,phase.rngAfter,phase.phase==='step'?64:phase.phase==='manual-choice'?0:1);
  if(phase.phase==='step'?draws<6:phase.phase==='automatic-choice'?draws!==1:draws!==0)throw Error('Unexpected annual RNG consumption');
  totalDraws+=draws;if(totalDraws>1000000)throw Error('Annual RNG batch exceeds bound');
  const ecologyBefore=through,record=()=>phases.push(Object.freeze({...phase,draws,ecologyBefore,ecologyAfter:through}));
  if(phase.confirmedBefore!==through)throw Error('Ecology did not commit before next phase');
  if(phase.confirmedAfter===through){if(!phase.pending)throw Error('Missing annual commit');record();return;}
  const year=phase.confirmedAfter;if(year!==through+1||phase.pending||year>10000)throw Error('Invalid annual ecology boundary');
  const delta=cursor.take();index.append(delta);uses.push(...delta.uses);events.push(...delta.events);runner.append(delta.uses,delta.events);
  const next=lifecycle.step(year),nextKey=[next.channel?.id,next.channel?.status,next.channel?.status==='active'?index.source.keyAt(year):0].join('/');
  if(key!==nextKey){cached=irrigationEffects(next.system,next.channel,next.channel?.status==='active'?next.frame:undefined);key=nextKey;}
  effects={...cached,disturbedPatches:[...new Set(next.events.filter(ev=>ev.kind==='built'||ev.kind==='backfilled').flatMap(ev=>channelPatches(lifecycle.systems.find(s=>s.id===ev.systemId)!)))].sort((a,b)=>a-b)};
  const slow=climateRule(e)==='environment-coupled-v2'&&year>=e.climateStart!;
  if(year%100===0)targets.push(slow?calmClimateTarget(e.seed,year,e.climateStart):climateTarget(e.seed,year));
  runner.step(targets[Math.floor(year/100)]!,slow);through=year;ecologySteps++;
  if((year-i.introducedYear)%100===0)checkpoints.push({...runner.snapshot(),channel:next.channel});
  record();
 });
 const result=ownProductionWorld({...world,vegetation:{...v,confirmedThrough:through,events},environment:{...e,confirmedThrough:through,targets,uses,checkpoints,current:{...runner.snapshot(),channel:lifecycle.channel}},irrigation:{...i,confirmedThrough:through,systems:lifecycle.systems.map(s=>({...s,geometry:productionGeometry(s.geometry)})),events:lifecycle.events,attempts:lifecycle.attempts}});
 validateGeneratedBridgeLedger(result.review);validateGeneratedPublicSpaceLedger(result.review,through);
 return Object.freeze({world:result,diagnostics:Object.freeze({format:'irrigation-annual-baseline-audit-v1' as const,originPending:!!input.review.state.pending,originPendingStepDraws:null,totalDraws,ecologySteps,confirmedThrough:through,phases:Object.freeze(phases)})});
}
export function advanceAnnualBaseline(input:GeneratedBridgeReview,years:number,choices:'stop'|'automatic'='automatic',options:GeneratedAdvanceOptions={}){
 if(!Number.isSafeInteger(years)||years<0||years>10000||input.review.state.year+years>10000||!['stop','automatic'].includes(choices))throw Error('Invalid annual baseline advance');
 return annualBaseline(input,(batch,commit)=>batch.advance(years,choices,options.stopAtNewRecord,commit),options);
}
export function chooseAnnualBaseline(input:GeneratedBridgeReview,index:number|'random'){
 return annualBaseline(input,(batch,commit)=>batch.choose(index,commit));
}
