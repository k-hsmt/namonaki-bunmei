/** One explicit mode controls progression, observation and persistence together. */
import {advance,choose,chooseAutomatically,legacyNames,type CivilizationState} from './engine.js';
import {advanceGeneratedBridgeReview,chooseGeneratedBridgeReview,chooseAutomaticallyGeneratedBridgeReview,type GeneratedBridgeReview} from './generated-bridge-review.js';
import {createGeneratedWorldSave,generatedWorld,restoreGeneratedWorld,validateWorldSave,type WorldSave,type LegacyWorldSave} from './world-save.js';
import {snapshotAt,type SiteSnapshot} from '../scene/model.js';
import {drawScene} from '../scene/draw.js';
import {observeGeneratedSceneReview} from '../scene/generated-scene-review.js';
import {drawGeneratedSceneReview} from '../scene/draw-generated-review.js';
export type WorldSession={mode:'generated';review:GeneratedBridgeReview;state:CivilizationState}|{mode:'legacy-fixed';template:LegacyWorldSave;state:CivilizationState};
export function generatedSession(review:GeneratedBridgeReview):WorldSession {
 if(review.review.reservationMode!=='field-only')throw Error('Unapproved session policy');return {mode:'generated',review,state:review.review.state};
}
export function restoreWorldSession(save:WorldSave):WorldSession {
 const valid=validateWorldSave(save);if(generatedWorld(valid))return generatedSession(restoreGeneratedWorld(valid));
 if(!valid.state.history.length)throw Error('Missing legacy birth record');
 if(valid.state.memory){const memory=valid.state.memory;if(!memory.legacies||typeof memory.legacies!=='object'||Array.isArray(memory.legacies)||!Array.isArray(memory.log)||memory.log.some(e=>!e||!Number.isSafeInteger(e.year)||e.year<0||e.year>valid.state.year||!Object.hasOwn(legacyNames,e.kind)))throw Error('Invalid legacy memory');}
 return {mode:'legacy-fixed',template:valid,state:structuredClone(valid.state)};
}
export function saveWorldSession(session:WorldSession):WorldSave {
 return session.mode==='generated'?createGeneratedWorldSave(session.review):validateWorldSave({...session.template,state:session.state});
}
export function advanceWorldSession(session:WorldSession,maxYears=36):WorldSession {
 if(!Number.isSafeInteger(maxYears)||maxYears<0||maxYears>10000)throw Error('Invalid world advance');
 if(session.mode==='generated')return generatedSession(advanceGeneratedBridgeReview(session.review,maxYears,'stop',{stopAtNewRecord:true}));
 const state=structuredClone(session.state),start=state.history.length;
 for(let i=0;i<maxYears&&!state.pending;i++){advance(state,1);if(state.history.length>start)break;}return {...session,state};
}
export function chooseWorldSession(session:WorldSession,index:number|'random'):WorldSession {
 if(session.mode==='generated')return generatedSession(index==='random'?chooseAutomaticallyGeneratedBridgeReview(session.review):chooseGeneratedBridgeReview(session.review,index));
 const state=structuredClone(session.state);if(index==='random')chooseAutomatically(state);else choose(state,index);return {...session,state};
}
export function observeWorldSession(session:WorldSession,year:number,siteIndex=0):SiteSnapshot {
 return session.mode==='generated'?observeGeneratedSceneReview(session.review,year,siteIndex).snapshot:snapshotAt(session.state,year,siteIndex);
}
export function drawWorldSession(canvas:HTMLCanvasElement,session:WorldSession,year:number,siteIndex=0):SiteSnapshot {
 if(session.mode==='generated'){const o=observeGeneratedSceneReview(session.review,year,siteIndex);drawGeneratedSceneReview(canvas,o);return o.snapshot;}
 const s=snapshotAt(session.state,year,siteIndex);drawScene(canvas,s,session.state.seed,session.state.housing);return s;
}

/** Explicit future-only opt-in. Existing foundations, records and terrain stay intact. */
export function improveWorldGrowth(session:WorldSession):WorldSession {
 if(session.mode!=='generated')throw Error('Fixed worlds do not support generated growth');
 if(session.review.review.growthPattern==='organic-v3')return session;
 return generatedSession({...session.review,review:{...session.review.review,growthPattern:'organic-v3'}});
}
