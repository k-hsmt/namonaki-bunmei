import type {EconomicProductionWorld} from '../irrigation/economic-production-types-v1.js';
import {knownEconomicProductionWorldInternal} from '../irrigation/economic-production-owned-internal.js';
import {introduceEconomicProduction,advanceEconomicProductionWorld,chooseEconomicProductionWorld,improveEconomicProductionEnvironment,slowEconomicProductionClimate} from '../irrigation/economic-production-progression-v1.js';
import {prepareEconomicProductionSave} from '../irrigation/economic-production-storage-v1.js';
import {restoreEconomicProductionSave} from '../irrigation/economic-production-history-v1.js';
import {observeEconomicProductionScene} from '../scene/economic-production-scene-v1.js';
import type {GeneratedSceneObservation} from '../scene/generated-scene-review.js';
import {assertProductionBoundary} from './trial-boundary.js';
import {introduceProductionIrrigation,slowProductionClimate} from '../irrigation/production-progression-v1.js';
import {ownProductionWorld} from '../irrigation/production-history-v1.js';
import {relaxEnvironment} from '../environment/progression-v1.js';
import type {CoupledVegetation} from '../environment/model-v1.js';
/** One explicit mode controls progression, observation and persistence together. */
import {advance,choose,chooseAutomatically,legacyNames,type CivilizationState} from './engine.js';
import {advanceGeneratedBridgeReview,chooseGeneratedBridgeReview,chooseAutomaticallyGeneratedBridgeReview,type GeneratedBridgeReview} from './generated-bridge-review.js';
import {createGeneratedWorldSave,generatedWorld,restoreGeneratedWorld,validateWorldSave,type WorldSave,type LegacyWorldSave} from './world-save.js';
import {snapshotAt,type SiteSnapshot} from '../scene/model.js';
import {drawScene} from '../scene/draw.js';
import {observeGeneratedSceneReview} from '../scene/generated-scene-review.js';
import {drawGeneratedSceneReview} from '../scene/draw-generated-review.js';
export type BaselineGeneratedSession={mode:'generated';review:GeneratedBridgeReview;state:CivilizationState};
export type EconomicGeneratedSession={mode:'generated';review:EconomicProductionWorld;state:CivilizationState};
export type WorldSession=BaselineGeneratedSession|EconomicGeneratedSession|{mode:'legacy-fixed';template:LegacyWorldSave;state:CivilizationState};
function economic(session:WorldSession):session is EconomicGeneratedSession {
 if(session.mode!=='generated'||session.review.format!=='irrigation-economic-production-world-v1')return false;
 knownEconomicProductionWorldInternal(session.review);if(session.state!==session.review.review.state)throw Error('Economic session state differs from its owned world');return true;
}
export function economicProductionSession(review:EconomicProductionWorld):EconomicGeneratedSession{knownEconomicProductionWorldInternal(review);return {mode:'generated',review,state:review.review.state};}

export function generatedSession(review:GeneratedBridgeReview):BaselineGeneratedSession {assertProductionBoundary(review);
 if(review.review.reservationMode!=='field-only')throw Error('Unapproved session policy');return {mode:'generated',review,state:review.review.state};
}
export function restoreWorldSession(save:WorldSave):WorldSession {
 const valid=validateWorldSave(save);if(valid.version===7)return economicProductionSession(restoreEconomicProductionSave(valid));if(generatedWorld(valid))return generatedSession(restoreGeneratedWorld(valid));
 if(!valid.state.history.length)throw Error('Missing legacy birth record');
 if(valid.state.memory){const memory=valid.state.memory;if(!memory.legacies||typeof memory.legacies!=='object'||Array.isArray(memory.legacies)||!Array.isArray(memory.log)||memory.log.some(e=>!e||!Number.isSafeInteger(e.year)||e.year<0||e.year>valid.state.year||!Object.hasOwn(legacyNames,e.kind)))throw Error('Invalid legacy memory');}
 return {mode:'legacy-fixed',template:valid,state:structuredClone(valid.state)};
}
export function saveWorldSession(session:WorldSession):WorldSave {if(economic(session))throw Error('Economic sessions require prepareWorldSessionSave');if(session.mode==='generated')assertProductionBoundary(session.review);
 return session.mode==='generated'?createGeneratedWorldSave(session.review):validateWorldSave({...session.template,state:session.state});
}
export function advanceWorldSession(session:WorldSession,maxYears=36):WorldSession {
 if(economic(session)){if(!Number.isSafeInteger(maxYears)||maxYears<0||maxYears>10000)throw Error('Invalid world advance');const years=Math.min(maxYears,Math.max(0,10000-session.state.year));return years?economicProductionSession(advanceEconomicProductionWorld(session.review,years,'stop',{stopAtNewRecord:true})):session;}
 if(session.mode==='generated')assertProductionBoundary(session.review);
 if(!Number.isSafeInteger(maxYears)||maxYears<0||maxYears>10000)throw Error('Invalid world advance');
 if(session.mode==='generated'&&session.review.irrigation){maxYears=Math.min(maxYears,Math.max(0,10000-session.state.year));if(!maxYears)return session;}
 if(session.mode==='generated')return generatedSession(advanceGeneratedBridgeReview(session.review,maxYears,'stop',{stopAtNewRecord:true}));
 const state=structuredClone(session.state),start=state.history.length;
 for(let i=0;i<maxYears&&!state.pending;i++){advance(state,1);if(state.history.length>start)break;}return {...session,state};
}
export function chooseWorldSession(session:WorldSession,index:number|'random'):WorldSession {if(economic(session))return economicProductionSession(chooseEconomicProductionWorld(session.review,index));if(session.mode==='generated')assertProductionBoundary(session.review);
 if(session.mode==='generated')return generatedSession(index==='random'?chooseAutomaticallyGeneratedBridgeReview(session.review):chooseGeneratedBridgeReview(session.review,index));
 const state=structuredClone(session.state);if(index==='random')chooseAutomatically(state);else choose(state,index);return {...session,state};
}
export function observeWorldSession(session:WorldSession,year:number,siteIndex=0):SiteSnapshot {
 return session.mode==='generated'?observeGeneratedWorldSession(session,year,siteIndex).snapshot:snapshotAt(session.state,year,siteIndex);
}
export function drawWorldSession(canvas:HTMLCanvasElement,session:WorldSession,year:number,siteIndex=0):SiteSnapshot {
 if(session.mode==='generated'){const o=observeGeneratedWorldSession(session,year,siteIndex);drawGeneratedSceneReview(canvas,o);return o.snapshot;}
 const s=snapshotAt(session.state,year,siteIndex);drawScene(canvas,s,session.state.seed,session.state.housing);return s;
}

/** Explicit future-only opt-in. Existing foundations, records and terrain stay intact. */
export function improveWorldGrowth(session:WorldSession):WorldSession {if(economic(session))return session;if(session.mode==='generated')assertProductionBoundary(session.review);
 if(session.mode!=='generated')throw Error('Fixed worlds do not support generated growth');
 if(session.review.review.growthPattern==='organic-v3')return session;
 return generatedSession({...session.review,review:{...session.review.review,growthPattern:'organic-v3'}});
}

/** Explicit appearance upgrade; every recorded model value stays intact. */
export function improveWorldEnvironment(session:WorldSession):WorldSession {if(economic(session))return economicProductionSession(improveEconomicProductionEnvironment(session.review));if(session.mode==='generated')assertProductionBoundary(session.review);
 if(session.mode!=='generated'||!session.review.environment)throw Error('No recorded environment');
 if(session.review.environmentAppearance==='landscape-v3')return session;
 const next={...session.review,environmentAppearance:'landscape-v3' as const};return generatedSession(next.irrigation?ownProductionWorld(next):next);
}

/** Switch only future climate; observation, civilization and past ecology stay identical. */
export function slowWorldClimate(session:WorldSession):WorldSession {if(economic(session))return economicProductionSession(slowEconomicProductionClimate(session.review));if(session.mode==='generated')assertProductionBoundary(session.review);
 if(session.mode!=='generated'||!session.review.environment)throw Error('No recorded environment');
 if(session.review.irrigation)return generatedSession(slowProductionClimate(session.review));
 const environment=relaxEnvironment(session.review.environment,session.review.vegetation as CoupledVegetation,session.review.review);
 return environment===session.review.environment?session:generatedSession({...session.review,environment});
}

export function enableWorldIrrigation(session:WorldSession):WorldSession {if(economic(session))return session;if(session.mode!=='generated')throw Error('Generated environment required');return generatedSession(introduceProductionIrrigation(session.review));}

/** Complete async v7 hashing before exposing a WorldSave to the common storage envelope. */
export async function prepareWorldSessionSave(session:WorldSession):Promise<WorldSave>{return economic(session)?prepareEconomicProductionSave(session.review):saveWorldSession(session);}
export async function enableWorldEconomicCoupling(session:WorldSession):Promise<WorldSession>{
 if(economic(session))return session;if(session.mode!=='generated')throw Error('Generated v6 required');
 return economicProductionSession(await introduceEconomicProduction(session.review));
}
export function observeGeneratedWorldSession(session:BaselineGeneratedSession|EconomicGeneratedSession,year:number,siteIndex=0):GeneratedSceneObservation{
 return economic(session)?observeEconomicProductionScene(session.review,year,siteIndex):observeGeneratedSceneReview(session.review,year,siteIndex);
}
