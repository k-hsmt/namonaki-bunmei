/** Production terrain progression never calls a public trial runner, factory or codec. */
import {lastObservedYear} from '../story/engine.js';
import {coupledChoiceBinding} from '../story/coupled-choice-binding-internal.js';
import {terrainProductionBoundary} from '../story/trial-boundary.js';
import {prepareEconomicProductionSave} from '../irrigation/economic-production-storage-v1.js';
import {knownEconomicProductionWorldInternal} from '../irrigation/economic-production-owned-internal.js';
import type {EconomicProductionWorld} from '../irrigation/economic-production-types-v1.js';
import {createTerrainHistory} from './terrain-revision-v1.js';
import {terrainRevisionHash} from './terrain-revision-wire-v1.js';
import {captureTerrainProductionOriginInternal} from './terrain-origin-internal.js';
import {ownTerrainProductionWorldInternal as own,knownTerrainProductionWorldInternal as known} from './terrain-production-owned-internal.js';
import {terrainProductionRuntimeRules,terrainProductionEconomicRule} from './terrain-production-contract-v1.js';
import type {TerrainProductionWorld,TerrainProductionLedger} from './terrain-production-types-v1.js';
import type {InteractionObserverInternal} from '../story/economy-observer.js';
import {continueReviewOnlyWorldInternal,markReviewOnlyWorldInternal,reviewOnlyWorldKeyInternal,type EventPolicyInternal} from '../story/event-policy-d2a-review.js';
import {terrainProductionProfile} from './terrain-profile-internal.js';
import {progressTerrainEvolutionInternal,terrainAdvanceRunInternal,terrainChoiceRunInternal} from './terrain-evolution-progression-internal.js';
export async function introduceTerrainProduction(input:EconomicProductionWorld|TerrainProductionWorld):Promise<TerrainProductionWorld>{
 if(input.format==='terrain-production-world-v1'){known(input);return input;}
 knownEconomicProductionWorldInternal(input);if(input.review.state.pending||input.review.state.year>=10000)throw Error('Terrain production requires a confirmed v7 year below 10000');
 const packet=await prepareEconomicProductionSave(input),year=lastObservedYear(input.review.state),history=await createTerrainHistory(input.review.terrain,year),originHash=await terrainRevisionHash(packet),{economicPolicyBoundary:_,...review}=input.review;
 return own({...input,format:'terrain-production-world-v1',status:'production',review:{...review,terrainPolicyBoundary:terrainProductionBoundary},terrainHistory:history,terrainDevelopment:{schemaVersion:1,ruleId:terrainProductionBoundary,policy:'cut',runtimeRules:terrainProductionRuntimeRules,economicRule:terrainProductionEconomicRule,introducedYear:year,confirmedThrough:year,originHash,originPrefix:captureTerrainProductionOriginInternal(packet),decisions:[]}});
}
async function progress(input:TerrainProductionWorld,run:Parameters<typeof progressTerrainEvolutionInternal>[3],observeInteraction?:InteractionObserverInternal,eventPolicy?:EventPolicyInternal):Promise<TerrainProductionWorld>{
 known(input);const reviewKey=continueReviewOnlyWorldInternal(input,input.review.state.year,eventPolicy);
 const result=await progressTerrainEvolutionInternal(input,input.terrainDevelopment,terrainProductionProfile,run,observeInteraction,eventPolicy);
 return reviewOnly(reviewKey,own({...result.world,format:'terrain-production-world-v1',status:'production',review:{...result.world.review,terrainPolicyBoundary:terrainProductionBoundary},economicCoupling:result.economicCoupling,terrainHistory:result.terrainHistory,terrainDevelopment:result.ledger as TerrainProductionLedger}));
}
/** Issue #40 D2a: a world advanced with a review-only event policy stays marked (it cannot be saved). */
function reviewOnly(key:string|undefined,world:TerrainProductionWorld):TerrainProductionWorld{if(key!==undefined)markReviewOnlyWorldInternal(world,key);return world;}
const keepMark=(from:TerrainProductionWorld,world:TerrainProductionWorld)=>reviewOnly(reviewOnlyWorldKeyInternal(from),world);
/**
 * `observeInteraction` (Issue #35 D3-a) is an optional read-only tap; v8's result is identical with or without it.
 * `eventPolicy` (Issue #40 D2a) is review-only: the result is marked review-only and cannot be saved.
 */
export async function advanceTerrainProductionWorld(input:TerrainProductionWorld,years:number,choices:'stop'|'automatic'='stop',options:{readonly stopAtNewRecord?:boolean}={},observeInteraction?:InteractionObserverInternal,eventPolicy?:EventPolicyInternal):Promise<TerrainProductionWorld>{
 known(input);if(!Number.isSafeInteger(years)||years<0||input.review.state.year+years>10000||!['stop','automatic'].includes(choices)||Object.keys(options).some(k=>k!=='stopAtNewRecord')||options.stopAtNewRecord!==undefined&&typeof options.stopAtNewRecord!=='boolean')throw Error('Invalid terrain production advance');if(!years)return input;
 return progress(input,terrainAdvanceRunInternal(input,input.terrainDevelopment,years,choices,options),observeInteraction,eventPolicy);
}
export async function chooseTerrainProductionWorld(input:TerrainProductionWorld,index:number|'random',binding?:string,observeInteraction?:InteractionObserverInternal,eventPolicy?:EventPolicyInternal):Promise<TerrainProductionWorld>{known(input);if(!input.review.state.pending||binding!==undefined&&binding!==coupledChoiceBinding(input.review.state))throw Error('Missing or stale terrain production choice');return progress(input,terrainChoiceRunInternal(index),observeInteraction,eventPolicy);}
export function improveTerrainProductionEnvironment(input:TerrainProductionWorld):TerrainProductionWorld{known(input);return input.environmentAppearance==='landscape-v3'?input:keepMark(input,own({...input,environmentAppearance:'landscape-v3'}));}
export function slowTerrainProductionClimate(input:TerrainProductionWorld):TerrainProductionWorld{known(input);const e=input.environment!;if(e.climateRule==='environment-coupled-v2'||e.confirmedThrough>=10000)return input;return keepMark(input,own({...input,environment:{...e,climateRule:'environment-coupled-v2',climateStart:(Math.floor(e.confirmedThrough/100)+1)*100}}));}
