import {terrainCutRuntimeRules} from './terrain-cut-rules-v1.js';
import {decodeRecordPhysics} from './terrain-record-raster-v1.js';
import {resolveTerrainAtYear} from './terrain-revision-v1.js';
import {reviewPhysicalPlot} from './ground-access-review.js';
/** Native D4 verification. No writer, candidate search, generator or RNG next entry points. */
import {wireObject,assertJsonWire,sameWire,validateGeneratedState} from '../story/generated-state-review.js';
import {validateTerrainRecord} from './terrain-record.js';
import {validateRiverReaches} from './river-reaches-review.js';
import {validatePlans,decodeReviewPartsInternal,validateDecodedReviewPartsInternal} from '../story/generated-save-draft-review.js';
import {terrainChangeTrialBoundary,economicProductionBoundary} from '../story/trial-boundary.js';
import {productionPlacementPolicy,parseWorldSaveAsync,type GeneratedWorldSave} from '../story/world-save.js';
import {lastObservedYear} from '../story/engine.js';
import {validateCoupledVegetation} from '../environment/history-v1.js';
import {vegetationSourceEvents,type VegetationEvent} from '../vegetation/history-v1.js';
import {recordedEnvironmentStateInternal,productionChannelAt} from '../irrigation/production-history-v1.js';
import {inflateEconomicTuplesInternal} from '../irrigation/economic-tuples-internal.js';
import {economicOriginDialect,type EconomicProductionLedger} from '../irrigation/economic-production-types-v1.js';
import {hydrateEconomicOriginInternal} from '../irrigation/economic-origin-internal.js';
import {verifyRecordedEconomyInternal} from '../irrigation/economic-proof-internal.js';
import {coupledRuntimeRules} from '../irrigation/coupled-types-v1.js';
import {irrigationEconomyRule} from '../irrigation/economy-types-v1.js';
import {validateEconomicProductionSave,restoreEconomicProductionSave} from '../irrigation/economic-production-history-v1.js';
import {freezeReview,reviewBaseHash} from '../irrigation/wire-v1.js';
import {createTerrainHistory,terrainHistoryThrough,type TerrainHistory} from './terrain-revision-v1.js';
import {terrainRevisionHash} from './terrain-revision-wire-v1.js';
import {terrainCutContextsAtInternal} from './terrain-cut-context-internal.js';
import {replayTerrainCutInternal} from './terrain-earthwork-v1.js';
import {hydrateTerrainOriginInternal} from './terrain-trial-origin-internal.js';
import {terrainTrialMaxBytes,type TerrainTrialSave} from './terrain-trial-wire-v1.js';
import type {TerrainTrialWorld,TerrainChangeLedger} from './terrain-trial-types-v1.js';
import {ownTerrainTrialWorldInternal,ownTerrainTrialPacketInternal,terrainTrialPacketWorldInternal,terrainTrialProviderInternal,terrainTrialViewInternal} from './terrain-trial-owned-internal.js';
import {bindTerrainReviewInternal} from '../story/terrain-review-binding-internal.js';
import {vegetationPatchPlot} from '../vegetation/history-v1.js';
import type {GeneratedFacilityReview} from '../story/generated-facility-review.js';
const nat=(v:unknown,max=10000):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const exact=(a:unknown,b:unknown,message:string)=>{if(!sameWire(a,b))throw Error(message);};
async function replayHistory(raw:Record<string,unknown>,ledger:TerrainChangeLedger,review:GeneratedFacilityReview,end:number):Promise<TerrainHistory>{
 let history=await createTerrainHistory(review.terrain,ledger.introducedYear),cursor=0;
 if(raw.format!==history.format||raw.schemaVersion!==1||raw.status!=='review-only'||raw.ruleId!==history.ruleId||raw.baseHash!==history.baseHash||raw.confirmedThrough!==end||!Array.isArray(raw.events)||raw.events.length>4)throw Error('Invalid terrain history header');
 const events=raw.events;
 if(ledger.policy==='none'){if(events.length||ledger.decisions.length)throw Error('Neutral terrain trial contains changes');return terrainHistoryThrough(history,end);}
 const expectedYears=[];for(let year=(Math.floor(ledger.introducedYear/100)+1)*100;year<=end&&year<10000;year+=100)expectedYears.push(year);
 if(ledger.decisions.length!==expectedYears.length)throw Error('Missing terrain decision years');
 for(const [n,rawDecision]of ledger.decisions.entries()){
  const d=wireObject(rawDecision,['id','year','outcome','reason','fieldId','changeId','score','metrics']),year=expectedYears[n]!;if(d.year!==year||d.id!=='terrain-review-'+year||!['built','hold'].includes(d.outcome as string))throw Error('Invalid terrain decision boundary');history=terrainHistoryThrough(history,year);
  const m=wireObject(d.metrics,['enumerated','physicalEligible','accessChecks','holds']);for(const key of ['enumerated','physicalEligible','accessChecks'])if(!nat(m[key],2000000))throw Error('Invalid terrain decision metrics');if(Number(m.physicalEligible)>Number(m.enumerated)||Number(m.accessChecks)>Number(m.physicalEligible))throw Error('Invalid terrain decision counts');
  if(!m.holds||typeof m.holds!=='object'||Array.isArray(m.holds))throw Error('Invalid terrain hold counts');let total=0;for(const [reason,count]of Object.entries(m.holds)){if(!['unconfirmed-year','unsupported-site','outside-ground','unchanged','unstable','cut-limit','water','occupied','no-access','limit'].includes(reason)||!nat(count,2000000))throw Error('Invalid terrain hold reason');total+=count;}if(total>Number(m.accessChecks))throw Error('Invalid terrain hold total');
  const zero=()=>{if(m.enumerated!==0||m.physicalEligible!==0||m.accessChecks!==0||total)throw Error('Unexpected early terrain search');};
  const early=history.events.length>=4?'limit':history.events.some(e=>year-e.approvedYear<500)?'cooldown':null;
  const contexts=early?[]:terrainCutContextsAtInternal(review,history,year),reason=early??(!contexts.length?'no-continuous-field':null);
  if(d.outcome==='hold'){
   if(d.fieldId!==null||d.changeId!==null||d.score!==null||d.reason!==(reason??'no-safe-cut'))throw Error('Invalid terrain hold receipt');if(reason)zero();else if(m.enumerated!==contexts.length*4964)throw Error('Terrain enumeration count differs');continue;
  }
  if(reason||d.reason!==null||typeof d.fieldId!=='string'||typeof d.changeId!=='string'||!Array.isArray(d.score)||d.score.length!==4||d.score.some(x=>!nat(x,1000000))||Number(m.accessChecks)<1||m.enumerated!==contexts.length*4964)throw Error('Invalid terrain construction receipt');
  const context=contexts.find(c=>c.field.id===d.fieldId),event=events[cursor++];if(!context||!event)throw Error('Missing terrain construction source');const cutWire=event as {ruleId?:unknown;plot?:unknown};if(cutWire.ruleId!=='terrain-cut-review-v2'||!cutWire.plot||reviewPhysicalPlot(decodeRecordPhysics(resolveTerrainAtYear(history,year).sites['hill-side'].physics),'field',cutWire.plot as import('./ground-access-review.js').GroundPlot).status==='clear')throw Error('Natural cut does not create new usable field ground');
  const replay=await replayTerrainCutInternal(event,context),cut=replay.history.events.at(-1)!;if(d.changeId!==cut.id)throw Error('Terrain change identity differs');exact(d.score,[cut.cutVolume,replay.fieldWalkDistance,cut.plot.y,cut.plot.x],'Terrain construction score differs');history=replay.history;
 }
 if(cursor!==events.length)throw Error('Unused terrain change');return terrainHistoryThrough(history,end);
}
function cutEvents(history:TerrainHistory,end:number):readonly VegetationEvent[]{return history.events.filter(e=>e.effectiveYear<=end).flatMap(e=>e.disturbedPatches.map(index=>({id:'terrain-clear/'+e.id+'/'+index,year:e.effectiveYear,site:'hill-side' as const,kind:'clear' as const,plot:vegetationPatchPlot(index),sourceRecordId:e.id})));}
export async function validateTerrainTrialSave(raw:unknown):Promise<TerrainTrialSave>{
 if(terrainTrialPacketWorldInternal(raw))return raw as TerrainTrialSave;
 assertJsonWire(raw);if(new TextEncoder().encode(JSON.stringify(raw)).length>terrainTrialMaxBytes)throw Error('Terrain trial exceeds 16MiB');const packet=freezeReview(structuredClone(raw)),d=wireObject(packet,['format','schemaVersion','status','world','terrainHistory','terrainChanges','payloadHash']),{payloadHash,...payload}=d;
 if(d.format!=='terrain-change-review-save-v1'||d.schemaVersion!==1||d.status!=='review-only'||!hash(payloadHash)||await terrainRevisionHash(payload)!==payloadHash)throw Error('Invalid terrain trial commitment');
 const w=wireObject(d.world,['format','schemaVersion','initialTerrain','progressionPolicy','rendererId','landHistory','state','vegetation','environment','irrigation','economicCoupling'],['environmentAppearance']);if(w.format!=='terrain-change-recorded-world-v1'||w.schemaVersion!==1||w.rendererId!=='terrain-scene-review-v1'||!sameWire(w.progressionPolicy,productionPlacementPolicy)||w.environmentAppearance!==undefined&&!['landscape-v2','landscape-v3'].includes(w.environmentAppearance as string))throw Error('Unknown terrain recorded world');
 const initial=wireObject(w.initialTerrain,['schemaVersion','mode','record','hydrology','plans']);if(initial.schemaVersion!==1||initial.mode!=='generated')throw Error('Terrain trial requires generated land');
 const terrain=validateTerrainRecord(initial.record),hydrology=validateRiverReaches(initial.hydrology,terrain),plans=validatePlans(initial.plans,terrain),state=validateGeneratedState(w.state,terrain.source.seed),end=lastObservedYear(state),land=wireObject(w.landHistory,['schemaVersion','events','terrainChangeBoundary']);if(land.terrainChangeBoundary!==terrainChangeTrialBoundary)throw Error('Missing persisted terrain boundary');const cleanLand={schemaVersion:land.schemaVersion,events:land.events};
 const review=decodeReviewPartsInternal(terrain,hydrology,plans,'field-only',state,cleanLand,'organic-v3',undefined,undefined,terrainChangeTrialBoundary);
 const t=wireObject(d.terrainChanges,['schemaVersion','ruleId','policy','runtimeRules','introducedYear','confirmedThrough','originHash','originPrefix','decisions']);if(t.schemaVersion!==1||t.ruleId!==terrainChangeTrialBoundary||!sameWire(t.runtimeRules,terrainCutRuntimeRules)||!['none','cut'].includes(t.policy as string)||!nat(t.introducedYear)||t.introducedYear>=10000||t.introducedYear>end||t.confirmedThrough!==end||!hash(t.originHash)||!Array.isArray(t.decisions)||t.decisions.length>99)throw Error('Invalid terrain change ledger');const terrainChanges=t as unknown as TerrainChangeLedger;
 const h=wireObject(d.terrainHistory,['format','schemaVersion','status','ruleId','baseHash','confirmedThrough','events']),terrainHistory=await replayHistory(h,terrainChanges,review,end);
 const c=wireObject(w.economicCoupling,['schemaVersion','ruleId','policy','formula','runtimeRules','introducedYear','confirmedThrough','originPending','originRngState','initialEconomy','originPrefix','originHash','receipts','phases','checkpoints','prepared','storageEncoding']);
 if(c.schemaVersion!==1||c.ruleId!==economicProductionBoundary||c.policy!=='combined'||c.originPending!==false||c.storageEncoding!=='economic-production-tuples-v1'||!sameWire(c.formula,irrigationEconomyRule)||!sameWire(c.runtimeRules,coupledRuntimeRules)||!nat(c.introducedYear)||c.introducedYear>t.introducedYear||c.confirmedThrough!==end||!nat(c.originRngState,0xffffffff)||!hash(c.originHash)||!Array.isArray(c.checkpoints)||c.checkpoints.length!==Math.floor((end-c.introducedYear)/100))throw Error('Invalid carried terrain economics');
 const {storageEncoding:_,...baseLedger}=c,records=inflateEconomicTuplesInternal(c.receipts,c.phases,c.introducedYear);if(records.receipts.length!==end-c.introducedYear)throw Error('Missing terrain economic years');const economicCoupling={...baseLedger,...records} as unknown as EconomicProductionLedger;
 const rawVegetation=wireObject(w.vegetation,['schemaVersion','ruleId','introducedYear','confirmedThrough','seed','initial','events']),standard=vegetationSourceEvents(review),baseVegetation=validateCoupledVegetation({...rawVegetation,events:standard},review),expectedEvents=[...standard.map(e=>({e,extra:false})),...cutEvents(terrainHistory,end).map(e=>({e,extra:true}))].sort((a,b)=>a.e.year-b.e.year||Number(a.extra)-Number(b.extra)).map(x=>x.e);exact(rawVegetation.events,expectedEvents,'Terrain vegetation sources differ');const vegetation=freezeReview({...baseVegetation,events:expectedEvents});
 let environment=w.environment as TerrainTrialWorld['environment'];const current=environment?.current as unknown as {format?:string;index?:number};if(current?.format==='terrain-environment-checkpoint-ref-v1'){const ref=wireObject(current,['format','index']);if(!environment||!Array.isArray(environment.checkpoints)||ref.index!==environment.checkpoints.length-1||environment.checkpoints[Number(ref.index)]?.year!==end)throw Error('Invalid terrain environment reference');environment={...environment,current:environment.checkpoints[Number(ref.index)]!};}
 const world={format:'terrain-change-review-world-v1',status:'review-only',review,economicCoupling,terrainHistory,terrainChanges,vegetation,environment,irrigation:w.irrigation,...(w.environmentAppearance?{environmentAppearance:w.environmentAppearance}:{})} as TerrainTrialWorld;
 bindTerrainReviewInternal(review,terrainTrialProviderInternal(world));validateDecodedReviewPartsInternal(review,cleanLand);freezeReview(world);
 const originPacket=await validateEconomicProductionSave(hydrateTerrainOriginInternal(t.originPrefix,w)),originWorld=restoreEconomicProductionSave(originPacket);if(originPacket.state.pending||originPacket.state.year!==t.introducedYear||await terrainRevisionHash(originPacket)!==t.originHash)throw Error('Terrain origin binding differs');
 const previousClimate=originWorld.environment!,currentClimate=world.environment!;if(previousClimate.climateRule!==currentClimate.climateRule||previousClimate.climateStart!==currentClimate.climateStart){if(previousClimate.climateRule!=='environment-coupled-v1'||currentClimate.climateRule!=='environment-coupled-v2'||!nat(currentClimate.climateStart)||currentClimate.climateStart<=terrainChanges.introducedYear||currentClimate.climateStart%100)throw Error('Terrain climate upgrade changes the source past');}
 // The carried D3 prefix remains anchored to its original validated v6 introduction.
 const candidate=hydrateEconomicOriginInternal({origin:economicCoupling.originPrefix,initialEconomy:economicCoupling.initialEconomy,world:terrainTrialViewInternal(world)},economicOriginDialect).save,introduced=economicCoupling.introducedYear,{terrainChangeBoundary:__,...plainReview}=review;
 const original={format:'generated-bridge-review' as const,status:'review-only' as const,review:{...plainReview,state:candidate.state as typeof state,placements:review.placements.filter(p=>p.builtYear<=introduced),bridgeReview:{...review.bridgeReview!,bridges:review.bridgeReview!.bridges.filter(b=>b.builtYear<=introduced)}},environment:candidate.environment,vegetation:candidate.vegetation,irrigation:candidate.irrigation};
 const reconstructed={...candidate,environment:{...candidate.environment!,current:{...recordedEnvironmentStateInternal(original,introduced,true),channel:productionChannelAt(original,introduced).channel}}},origin=await parseWorldSaveAsync(JSON.stringify(reconstructed)) as GeneratedWorldSave;
 if(origin.version!==6||origin.state.pending||origin.state.year!==introduced||origin.state.rngState!==c.originRngState||await reviewBaseHash(origin)!==c.originHash)throw Error('Carried economic origin differs');
 await verifyRecordedEconomyInternal({...economicCoupling,choiceProtocol:'production-mixed-v1',world:terrainTrialViewInternal(world)},origin);
 const owned=ownTerrainTrialWorldInternal(world);return ownTerrainTrialPacketInternal(packet as TerrainTrialSave,owned);
}
export function restoreTerrainTrialSave(packet:TerrainTrialSave):TerrainTrialWorld{const world=terrainTrialPacketWorldInternal(packet);if(!world)throw Error('Use a validated terrain trial packet');return world;}
