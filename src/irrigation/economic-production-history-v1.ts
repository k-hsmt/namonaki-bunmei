/** External v7 proof. Never runs the writer, new water search, climate producer or RNG next. */
import {wireObject,assertJsonWire,sameWire,validateGeneratedState} from '../story/generated-state-review.js';
import {validateTerrainRecord} from '../terrain/terrain-record.js';
import {validateRiverReaches} from '../terrain/river-reaches-review.js';
import {validatePlans,reviewFromParts} from '../story/generated-save-draft-review.js';
import {validateCoupledVegetation} from '../environment/history-v1.js';
import {recordedEnvironmentStateInternal,productionChannelAt} from './production-history-v1.js';
import {parseWorldSaveAsync,productionPlacementPolicy,type GeneratedWorldSave} from '../story/world-save.js';
import {lastObservedYear} from '../story/engine.js';
import {economicProductionBoundary} from '../story/trial-boundary.js';
import {economicOriginDialect,type EconomicProductionWorld,type EconomicProductionLedger} from './economic-production-types-v1.js';
import {economicProductionViewInternal} from './economic-production-view-internal.js';
import {ownEconomicProductionWorldInternal as own,ownEconomicProductionPacketInternal,knownEconomicProductionPacketInternal} from './economic-production-owned-internal.js';
import {economicProductionMaxBytes,type EconomicProductionSave} from './economic-production-wire-v1.js';
import {hydrateEconomicOriginInternal} from './economic-origin-internal.js';
import {inflateEconomicTuplesInternal} from './economic-tuples-internal.js';
import {verifyRecordedEconomyInternal} from './economic-proof-internal.js';
import {coupledRuntimeRules} from './coupled-types-v1.js';
import {irrigationEconomyRule} from './economy-types-v1.js';
import {freezeReview,reviewBaseHash} from './wire-v1.js';
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
const nat=(v:unknown,max=10000):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
export async function validateEconomicProductionSave(raw:unknown):Promise<EconomicProductionSave>{
 if(knownEconomicProductionPacketInternal(raw))return raw as EconomicProductionSave;
 assertJsonWire(raw);if(new TextEncoder().encode(JSON.stringify(raw)).length>economicProductionMaxBytes)throw Error('Economic world exceeds 16MiB');
 const packet=freezeReview(structuredClone(raw)),d=wireObject(packet,['format','version','schemaVersion','initialTerrain','progressionPolicy','rendererId','landHistory','state','vegetation','environment','irrigation','economicCoupling','payloadHash'],['environmentAppearance']);
 const {payloadHash,...payload}=d;if(typeof payloadHash!=='string'||await reviewBaseHash(payload)!==payloadHash)throw Error('Economic payload commitment differs');
 if(d.format!=='namonaki-world-save'||d.version!==7||d.schemaVersion!==1||d.rendererId!=='generated-scene-v6'||!sameWire(d.progressionPolicy,productionPlacementPolicy)||d.environmentAppearance!==undefined&&!['landscape-v2','landscape-v3'].includes(d.environmentAppearance as string))throw Error('Unknown economic production v7 contract');
 const initial=wireObject(d.initialTerrain,['schemaVersion','mode','record','hydrology','plans']);if(initial.schemaVersion!==1||initial.mode!=='generated')throw Error('Economic world requires generated terrain');
 const terrain=validateTerrainRecord(initial.record),hydrology=validateRiverReaches(initial.hydrology,terrain),plans=validatePlans(initial.plans,terrain),state=validateGeneratedState(d.state,terrain.source.seed);
 const review=reviewFromParts(terrain,hydrology,plans,'field-only',state,d.landHistory,'organic-v3',undefined,economicProductionBoundary),vegetation=validateCoupledVegetation(d.vegetation,review);
 const c=wireObject(d.economicCoupling,['schemaVersion','ruleId','policy','formula','runtimeRules','introducedYear','confirmedThrough','originPending','originRngState','initialEconomy','originPrefix','originHash','receipts','phases','checkpoints','prepared','storageEncoding']);
 if(c.schemaVersion!==1||c.ruleId!==economicProductionBoundary||c.policy!=='combined'||c.originPending!==false||c.storageEncoding!=='economic-production-tuples-v1'||!sameWire(c.formula,irrigationEconomyRule)||!sameWire(c.runtimeRules,coupledRuntimeRules)||!nat(c.introducedYear)||c.introducedYear>=10000||!nat(c.confirmedThrough)||c.confirmedThrough<c.introducedYear||c.confirmedThrough!==lastObservedYear(state)||!nat(c.originRngState,0xffffffff)||typeof c.originHash!=='string'||!/^[a-f0-9]{64}$/.test(c.originHash)||!Array.isArray(c.checkpoints)||c.checkpoints.length!==Math.floor((c.confirmedThrough-c.introducedYear)/100))throw Error('Invalid economic production ledger');
 const {storageEncoding:_,...ledger}=c,records=inflateEconomicTuplesInternal(c.receipts,c.phases,c.introducedYear);
 if(records.receipts.length!==c.confirmedThrough-c.introducedYear)throw Error('Missing economic production years');
 const economicCoupling={...ledger,...records} as unknown as EconomicProductionLedger;
 let environment=d.environment as GeneratedBridgeReview['environment'];const current=environment?.current as unknown as {format?:string;index?:number};
 if(current?.format==='economic-environment-checkpoint-ref-v1'){
  const ref=wireObject(current,['format','index']);if(!environment||!Array.isArray(environment.checkpoints)||ref.index!==environment.checkpoints.length-1||environment.checkpoints[Number(ref.index)]?.year!==c.confirmedThrough)throw Error('Invalid economic environment reference');environment={...environment,current:environment.checkpoints[Number(ref.index)]!};
 }
 const world={format:'irrigation-economic-production-world-v1',status:'production',review,vegetation,environment,irrigation:d.irrigation,...(d.environmentAppearance?{environmentAppearance:d.environmentAppearance}:{}),economicCoupling} as EconomicProductionWorld;freezeReview(world);
 const candidate=hydrateEconomicOriginInternal({origin:economicCoupling.originPrefix,initialEconomy:economicCoupling.initialEconomy,world},economicOriginDialect).save;
 const introducedYear=c.introducedYear;
 const original={format:'generated-bridge-review' as const,status:'review-only' as const,review:{...review,state:candidate.state as GeneratedBridgeReview['review']['state'],placements:review.placements.filter(p=>p.builtYear<=introducedYear),bridgeReview:{...review.bridgeReview!,bridges:review.bridgeReview!.bridges.filter(p=>p.builtYear<=introducedYear)}},environment:candidate.environment,vegetation:candidate.vegetation,irrigation:candidate.irrigation};
 const reconstructed={...candidate,environment:{...candidate.environment!,current:{...recordedEnvironmentStateInternal(original,c.introducedYear,true),channel:productionChannelAt(original,c.introducedYear).channel}}};
 const origin=await parseWorldSaveAsync(JSON.stringify(reconstructed)) as GeneratedWorldSave;
 if(origin.version!==6||origin.state.pending||origin.state.year!==c.introducedYear||origin.environment!.confirmedThrough!==c.introducedYear||origin.state.rngState!==c.originRngState||await reviewBaseHash(origin)!==c.originHash)throw Error('Economic origin binding differs');
 await verifyRecordedEconomyInternal({...economicCoupling,choiceProtocol:'production-mixed-v1',world:economicProductionViewInternal(world)},origin);
 const owned=own(world);return ownEconomicProductionPacketInternal(packet as EconomicProductionSave,owned);
}
export function restoreEconomicProductionSave(packet:EconomicProductionSave):EconomicProductionWorld{const world=knownEconomicProductionPacketInternal(packet);if(!world)throw Error('Use a validated economic production save');return world;}
