/** Independent trial entry points retain their own world and packet ownership. */
import {lastObservedYear} from '../story/engine.js';
import {coupledChoiceBinding} from '../story/coupled-choice-binding-internal.js';
import {terrainChangeTrialBoundary} from '../story/trial-boundary.js';
import {prepareEconomicProductionSave} from '../irrigation/economic-production-storage-v1.js';
import {knownEconomicProductionWorldInternal} from '../irrigation/economic-production-owned-internal.js';
import type {EconomicProductionWorld} from '../irrigation/economic-production-types-v1.js';
import {createTerrainHistory} from './terrain-revision-v1.js';
import {terrainRevisionHash} from './terrain-revision-wire-v1.js';
import {captureTerrainOriginInternal} from './terrain-origin-internal.js';
import {ownTerrainTrialWorldInternal as own,knownTerrainTrialWorldInternal as known} from './terrain-trial-owned-internal.js';
import {terrainCutRuntimeRules} from './terrain-cut-rules-v1.js';
import type {TerrainTrialWorld,TerrainChangeLedger} from './terrain-trial-types-v1.js';
import {terrainTrialProfile} from './terrain-profile-internal.js';
import {progressTerrainEvolutionInternal,terrainAdvanceRunInternal,terrainChoiceRunInternal} from './terrain-evolution-progression-internal.js';
export {terrainCutVegetationEventsInternal} from './terrain-evolution-events-internal.js';
export async function createTerrainTrial(input:EconomicProductionWorld,policy:'none'|'cut'='cut'):Promise<TerrainTrialWorld>{
 knownEconomicProductionWorldInternal(input);if(!['none','cut'].includes(policy)||input.review.state.pending||input.review.state.year>=10000)throw Error('Terrain introduction requires a confirmed v7 year below 10000');
 const packet=await prepareEconomicProductionSave(input),year=lastObservedYear(input.review.state),history=await createTerrainHistory(input.review.terrain,year),originHash=await terrainRevisionHash(packet),{economicPolicyBoundary:_,...review}=input.review;
 return own({...input,format:'terrain-change-review-world-v1',status:'review-only',review:{...review,terrainChangeBoundary:terrainChangeTrialBoundary},terrainHistory:history,terrainChanges:{schemaVersion:1,ruleId:terrainChangeTrialBoundary,policy,runtimeRules:terrainCutRuntimeRules,introducedYear:year,confirmedThrough:year,originHash,originPrefix:captureTerrainOriginInternal(packet),decisions:[]}});
}

async function progress(input:TerrainTrialWorld,run:Parameters<typeof progressTerrainEvolutionInternal>[3]):Promise<TerrainTrialWorld>{
 known(input);const result=await progressTerrainEvolutionInternal(input,input.terrainChanges,terrainTrialProfile,run);
 return own({...result.world,format:'terrain-change-review-world-v1',status:'review-only',review:{...result.world.review,terrainChangeBoundary:terrainChangeTrialBoundary},economicCoupling:result.economicCoupling,terrainHistory:result.terrainHistory,terrainChanges:result.ledger as TerrainChangeLedger});
}
export async function advanceTerrainTrial(input:TerrainTrialWorld,years:number,choices:'stop'|'automatic'='stop',options:{readonly stopAtNewRecord?:boolean}={}):Promise<TerrainTrialWorld>{
 known(input);if(!Number.isSafeInteger(years)||years<0||input.review.state.year+years>10000||!['stop','automatic'].includes(choices)||Object.keys(options).some(k=>k!=='stopAtNewRecord')||options.stopAtNewRecord!==undefined&&typeof options.stopAtNewRecord!=='boolean')throw Error('Invalid terrain trial advance');if(!years)return input;
 return progress(input,terrainAdvanceRunInternal(input,input.terrainChanges,years,choices,options));
}
export async function chooseTerrainTrial(input:TerrainTrialWorld,index:number|'random',binding?:string):Promise<TerrainTrialWorld>{known(input);if(!input.review.state.pending||binding!==undefined&&binding!==coupledChoiceBinding(input.review.state))throw Error('Missing or stale terrain choice');return progress(input,terrainChoiceRunInternal(index));}
