import {verifyRecordedEconomyInternal,economicRowsInternal} from './economic-proof-internal.js';
import {coupledRuntimeRules} from './coupled-types-v1.js';
/** Independent C2 reader: stored inputs/decisions only; no progression or proposal search. */
import {wireObject,assertJsonWire,sameWire,validateGeneratedState} from '../story/generated-state-review.js';
import {validateTerrainRecord} from '../terrain/terrain-record.js';
import {validateRiverReaches} from '../terrain/river-reaches-review.js';
import {validatePlans,reviewFromParts} from '../story/generated-save-draft-review.js';
import {captureGeneratedLandFoundations} from '../story/generated-land-foundations-review.js';
import {validateCoupledVegetation} from '../environment/history-v1.js';
import {recordedEnvironmentStateInternal,projectRecordedEnvironmentInternal,productionChannelAt} from './production-history-v1.js';
import {parseWorldSaveAsync,type GeneratedWorldSave} from '../story/world-save.js';
import {hydrateCoupledOrigin} from './coupled-origin-v1.js';
import {knownCoupledReview,ownCoupledReview,isOwnedCoupledReview} from './coupled-owned-internal.js';
import {freezeReview,reviewBaseHash} from './wire-v1.js';
import {coupledTrialBoundary} from '../story/trial-boundary.js';
import {irrigationEconomyRule,economyPolicies} from './economy-types-v1.js';
import type {IrrigationCoupledReview,CoupledReviewWorld} from './coupled-types-v1.js';
import type {GeneratedBridgeReview} from '../story/generated-bridge-review.js';
import {inflateCoupledWire,coupledMaxBytes} from './coupled-wire-v1.js';

const nat=(n:unknown,max=10000):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=max;
const u32=(n:unknown):n is number=>nat(n,0xffffffff);
const compare=(a:unknown,b:unknown,message:string)=>{if(!sameWire(a,b))throw Error(message);};
const adapters=new WeakMap<object,GeneratedBridgeReview>();
function adapter(world:CoupledReviewWorld):GeneratedBridgeReview{let value=adapters.get(world);if(!value){value=freezeReview({...world,format:'generated-bridge-review' as const});adapters.set(world,value);}return value;}
function validateLand(t:IrrigationCoupledReview):IrrigationCoupledReview {
 const w=wireObject(t.world,['format','status','review','irrigation','vegetation','environment'],['environmentAppearance']);
 if(w.format!=='irrigation-coupled-review-world-v1'||w.status!=='review-only'||w.environmentAppearance!==undefined&&!['landscape-v2','landscape-v3'].includes(w.environmentAppearance as string))throw Error('Invalid coupled world');
 const r=wireObject(w.review,['trialBoundary','format','status','placementPolicy','terrain','plans','reservationMode','state','growthPattern','placements','bridgeReview','diagnostics']);
 if(r.trialBoundary!==coupledTrialBoundary||r.format!=='generated-facility-review'||r.status!=='review-only'||r.placementPolicy!==null||r.reservationMode!=='field-only'||r.growthPattern!=='organic-v3'||!Array.isArray(r.placements)||r.placements.length>10000)throw Error('Invalid coupled land');
 compare(r.diagnostics,{holds:{},fullSearches:0},'Non-persistent diagnostics in coupled wire');
 const terrain=validateTerrainRecord(r.terrain),b=wireObject(r.bridgeReview,['schemaVersion','hydrology','bridges']),hydrology=validateRiverReaches(b.hydrology,terrain),plans=validatePlans(r.plans,terrain),state=validateGeneratedState(r.state,terrain.source.seed);
 for(const p of r.placements)wireObject(p,['objectId','site','kind','plot','entrance','builtYear','sourceRecordId']);
 const review={...t.world.review,terrain,plans,state,bridgeReview:{...t.world.review.bridgeReview!,hydrology}};
 const rebuilt=reviewFromParts(terrain,hydrology,plans,'field-only',state,captureGeneratedLandFoundations(review),'organic-v3',coupledTrialBoundary);
 compare(rebuilt.placements,review.placements,'Coupled placements differ from source history');compare(rebuilt.bridgeReview,review.bridgeReview,'Coupled bridges differ');
 const vegetation=validateCoupledVegetation(t.world.vegetation,review);
 return {...t,world:{...t.world,review,vegetation}};
}
/** Detached before every await. Exact frozen roots alone acquire continuation ownership. */
export async function validateCoupledReview(raw:unknown):Promise<IrrigationCoupledReview>{
 if(isOwnedCoupledReview(raw))return raw;assertJsonWire(raw);if(new TextEncoder().encode(JSON.stringify(raw)).length>coupledMaxBytes)throw Error('Coupled wire exceeds 16MiB');
 const packet=freezeReview(structuredClone(raw)) as Record<string,unknown>,{payloadHash,...payload}=packet;
 if(typeof payloadHash!=='string'||await reviewBaseHash(payload)!==payloadHash)throw Error('Coupled payload commitment differs');
 let t=inflateCoupledWire(payload);freezeReview(t);
 if(t.format!==coupledTrialBoundary||t.schemaVersion!==1||t.status!=='review-only'||t.ruleId!=='irrigation-economy-coupled-v1'||!sameWire(t.runtimeRules,coupledRuntimeRules)||!sameWire(t.formula,irrigationEconomyRule)||!economyPolicies.includes(t.policy)||!['automatic-per-branch-v1','common-explicit-v1'].includes(t.choiceProtocol)||!nat(t.introducedYear)||!nat(t.confirmedThrough)||t.confirmedThrough<t.introducedYear||typeof t.originPending!=='boolean'||!u32(t.originRngState)||typeof t.originHash!=='string'||!/^[a-f0-9]{64}$/.test(t.originHash)||!Array.isArray(t.checkpoints)||t.checkpoints.length!==Math.floor((t.confirmedThrough-t.introducedYear)/100)||t.receipts.length!==t.confirmedThrough-t.introducedYear)throw Error('Invalid coupled contract');
 t=validateLand(t);freezeReview(t);
 const hydrated=hydrateCoupledOrigin(t),candidate=hydrated.save;
 // Only the reconstructed pre-effect v6 prefix is a production value.
 const original={format:'generated-bridge-review' as const,status:'review-only' as const,review:{...t.world.review,state:candidate.state as GeneratedBridgeReview['review']['state'],placements:t.world.review.placements.filter(p=>p.builtYear<=t.introducedYear),bridgeReview:{...t.world.review.bridgeReview!,bridges:t.world.review.bridgeReview!.bridges.filter(p=>p.builtYear<=t.introducedYear)}},environment:candidate.environment,vegetation:candidate.vegetation,irrigation:candidate.irrigation};
 const reconstructed={...candidate,environment:{...candidate.environment!,current:{...recordedEnvironmentStateInternal(original,t.introducedYear,true),channel:productionChannelAt(original,t.introducedYear).channel}}};
 const origin=await parseWorldSaveAsync(JSON.stringify(reconstructed)) as GeneratedWorldSave;if(origin.version!==6||origin.environment!.confirmedThrough!==t.introducedYear||origin.state.rngState!==t.originRngState||!!origin.state.pending!==t.originPending||await reviewBaseHash(origin)!==t.originHash)throw Error('Coupled origin binding differs');
 await verifyRecordedEconomyInternal({...t,world:adapter(t.world)},origin);
 return ownCoupledReview(t);
}

export function coupledRows(t:IrrigationCoupledReview){knownCoupledReview(t);return economicRowsInternal({...t,world:adapter(t.world)});}
export function coupledEnvironment(t:IrrigationCoupledReview,year:number,site:'river-bank'|'hill-side'|'coast-inlet'){knownCoupledReview(t);if(!nat(year,t.confirmedThrough))throw Error('Unconfirmed coupled observation');return projectRecordedEnvironmentInternal(adapter(t.world),year,site);}
export function coupledChannel(t:IrrigationCoupledReview,year:number,site:'river-bank'|'hill-side'|'coast-inlet'){knownCoupledReview(t);return productionChannelAt(adapter(t.world),year,site);}
