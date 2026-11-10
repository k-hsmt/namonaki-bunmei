import {introduceTerrainProduction} from '../terrain/terrain-production-progression-v1.js';
import {terrainProductionSession,type TerrainGeneratedSession} from './world-session.js';
import {introduceEconomicProduction} from '../irrigation/economic-production-progression-v1.js';
import {economicProductionSession,type EconomicGeneratedSession} from './world-session.js';
import {introduceProductionIrrigation} from '../irrigation/production-progression-v1.js';
import {coupleVegetation,createEnvironment} from '../environment/progression-v1.js';
/** This producer is loaded only when explicitly creating a new generated world. */
import {createInitialVegetation} from '../vegetation/initial-v1.js';
import {validateVegetationHistory} from '../vegetation/history-v1.js';
import {generateWorldPrototype} from '../terrain/world-prototype.js';
import {captureTerrainRecord} from '../terrain/capture-terrain-record.js';
import {captureRiverReaches} from '../terrain/river-reaches-review.js';
import {createGeneratedBridgeReview} from './generated-bridge-review.js';
import {generatedSession,observeWorldSession,type BaselineGeneratedSession} from './world-session.js';
export function createNewWorld(seed:number,policy?:'terrain-placement-v1'|'terrain-placement-v2'|'terrain-placement-v3',vegetation=policy===undefined,environment=policy===undefined&&vegetation):BaselineGeneratedSession {
 if(!Number.isSafeInteger(seed)||seed<1||seed>0xffffffff)throw Error('Invalid world seed');
 policy??='terrain-placement-v3';
 if(!['terrain-placement-v1','terrain-placement-v2','terrain-placement-v3'].includes(policy))throw Error('Unknown new-world policy');
 const result=generateWorldPrototype(seed);if(result.status!=='ok')throw Error('No viable world');
 const terrain=captureTerrainRecord(result.world,'world-terrain-v1'),review=createGeneratedBridgeReview(terrain,captureRiverReaches(terrain),'field-only',policy==='terrain-placement-v3'?'organic-v3':policy==='terrain-placement-v2'?'organic-v2':undefined);
 if(review.status!=='review-only')throw Error('No viable initial settlement');if(environment&&!vegetation)throw Error('Environment requires vegetation');
 const initial=vegetation?validateVegetationHistory(createInitialVegetation(review.review),review.review):undefined,v=initial&&environment?coupleVegetation(initial):initial;
 const session=generatedSession({...review,...(v?{vegetation:v}:{}),...(v?.schemaVersion===2?{environment:createEnvironment(v,review.review,true),environmentAppearance:'landscape-v3' as const}:{})});
 for(let i=0;i<3;i++)observeWorldSession(session,0,i);return session;
}

/** Versioned B producer; retained for old saves, fixtures and independent comparisons. */
export function createNewIrrigatedWorld(seed:number):BaselineGeneratedSession {const world=createNewWorld(seed);if(world.mode!=='generated')throw Error('Generated world required');return generatedSession(introduceProductionIrrigation(world.review));}

/** Versioned v7 producer; retained when the normal UI moves to terrain-aware worlds. */
export async function createNewEconomicWorld(seed:number):Promise<EconomicGeneratedSession>{
 const source=createNewIrrigatedWorld(seed);return economicProductionSession(await introduceEconomicProduction(source.review));
}

/** Current new-world default. The immutable v7 origin is generated once at the chosen seed. */
export async function createNewTerrainWorld(seed:number):Promise<TerrainGeneratedSession>{
 const source=await createNewEconomicWorld(seed);return terrainProductionSession(await introduceTerrainProduction(source.review));
}
