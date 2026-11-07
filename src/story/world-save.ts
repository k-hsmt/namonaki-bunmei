/** Production v5 contract. Versioned readers preserve compact v1 and organic v2 progression. */
import {validateVegetationHistory,type VegetationHistory} from '../vegetation/history-v1.js';
import {createGeneratedSaveDraft,validateGeneratedSaveDraft,restoreGeneratedSaveDraft,generatedDraftMaxBytes,type GeneratedSaveDraftReview} from './generated-save-draft-review.js';
import {migrateLegacySave,validateLegacySaveDraft,type LegacySaveDraft} from './legacy-terrain-save.js';
import type {GeneratedBridgeReview} from './generated-bridge-review.js';
import {wireObject} from './generated-state-review.js';
import {groundReviewLimits} from '../terrain/ground-access-review.js';
export const WORLD_SAVE_KEY='namonaki-story-v5';
export const compactPlacementPolicy=Object.freeze({id:'terrain-placement-v1' as const,reservationMode:'field-only' as const,limits:groundReviewLimits});
export const organicPlacementPolicy=Object.freeze({id:'terrain-placement-v2' as const,reservationMode:'field-only' as const,limits:groundReviewLimits});
export const productionPlacementPolicy=Object.freeze({id:'terrain-placement-v3' as const,reservationMode:'field-only' as const,limits:groundReviewLimits});
export type GeneratedWorldSave=Omit<GeneratedSaveDraftReview,'format'|'status'|'progressionPolicy'|'rendererId'>&{
 readonly format:'namonaki-world-save';readonly progressionPolicy:typeof productionPlacementPolicy|typeof organicPlacementPolicy|typeof compactPlacementPolicy;readonly rendererId:'generated-scene-v1'|'generated-scene-v2';readonly vegetation?:VegetationHistory;
};
export type LegacyWorldSave=Omit<LegacySaveDraft,'format'|'status'>&{readonly format:'namonaki-world-save'};
export type WorldSave=GeneratedWorldSave|LegacyWorldSave;
export function generatedWorld(save:WorldSave):save is GeneratedWorldSave{return save.initialTerrain.mode==='generated';}
function promoteGenerated(d:GeneratedSaveDraftReview):GeneratedWorldSave {
 const {format:_,status:__,progressionPolicy:___,rendererId:____,...payload}=d;
 return {...payload,format:'namonaki-world-save',progressionPolicy:d.progressionPolicy.id==='generated-land-review-v3'?productionPlacementPolicy:d.progressionPolicy.id==='generated-land-review-v2'?organicPlacementPolicy:compactPlacementPolicy,rendererId:'generated-scene-v1'};
}
function promoteLegacy(d:LegacySaveDraft):LegacyWorldSave {const {format:_,status:__,...payload}=d;return {...payload,format:'namonaki-world-save'};}
export function validateWorldSave(raw:unknown):WorldSave {
 const d=wireObject(raw,['format','version','schemaVersion','initialTerrain','progressionPolicy','state'],['rendererId','landHistory','origin','vegetation']);
 if(d.format!=='namonaki-world-save'||d.version!==5||d.schemaVersion!==1)throw Error('Unknown world save contract');
 const t=d.initialTerrain as {mode?:unknown}|null;
 if(t?.mode==='generated'){
  wireObject(d,['format','version','schemaVersion','initialTerrain','progressionPolicy','rendererId','landHistory','state'],['vegetation']);
  const p=wireObject(d.progressionPolicy,['id','reservationMode','limits']);
  if(!['terrain-placement-v1','terrain-placement-v2','terrain-placement-v3'].includes(p.id as string)||p.reservationMode!=='field-only'||!['generated-scene-v1','generated-scene-v2'].includes(d.rendererId as string))throw Error('Unknown production policy or renderer');
  const {vegetation,...payload}=d;
  if((vegetation!==undefined)!==(d.rendererId==='generated-scene-v2'))throw Error('Vegetation renderer mismatch');
  const draft=validateGeneratedSaveDraft({...payload,format:'namonaki-generated-save-draft',status:'review-only',rendererId:'generated-scene-review-v1',progressionPolicy:{...p,id:p.id==='terrain-placement-v3'?'generated-land-review-v3':p.id==='terrain-placement-v2'?'generated-land-review-v2':'generated-land-review-v1'}});
  const base=promoteGenerated(draft);if(vegetation===undefined)return base;
  return {...base,rendererId:'generated-scene-v2',vegetation:validateVegetationHistory(vegetation,restoreGeneratedSaveDraft(draft).review)};
 }
 if(t?.mode==='legacy-fixed'){
  wireObject(d,['format','version','schemaVersion','initialTerrain','progressionPolicy','origin','state']);
  return promoteLegacy(validateLegacySaveDraft({...d,format:'namonaki-legacy-save-draft',status:'review-only'}));
 }
 throw Error('Unknown world terrain mode');
}
export function createGeneratedWorldSave(review:GeneratedBridgeReview):GeneratedWorldSave {
 if(review.review.reservationMode!=='field-only')throw Error('Unapproved production reservation mode');const base=promoteGenerated(createGeneratedSaveDraft(review));return review.vegetation?{...base,rendererId:'generated-scene-v2',vegetation:validateVegetationHistory(review.vegetation,review.review)}:base;
}
export function restoreGeneratedWorld(save:GeneratedWorldSave):GeneratedBridgeReview {
 const valid=validateWorldSave(save) as GeneratedWorldSave,{vegetation,...payload}=valid;
 const restored=restoreGeneratedSaveDraft({...payload,format:'namonaki-generated-save-draft',status:'review-only',rendererId:'generated-scene-review-v1',progressionPolicy:{...valid.progressionPolicy,id:valid.progressionPolicy.id==='terrain-placement-v3'?'generated-land-review-v3':valid.progressionPolicy.id==='terrain-placement-v2'?'generated-land-review-v2':'generated-land-review-v1'}});
 return vegetation?{...restored,vegetation:validateVegetationHistory(vegetation,restored.review)}:restored;
}
export function migrateOldWorld(raw:unknown):LegacyWorldSave{return promoteLegacy(migrateLegacySave(raw));}
export function parseWorldSave(json:string):WorldSave {
 if(typeof json!=='string'||new TextEncoder().encode(json).length>generatedDraftMaxBytes)throw Error('World save exceeds 16MiB');
 const raw:unknown=JSON.parse(json);if(raw&&typeof raw==='object'&&'version' in raw&&[2,3,4].includes(raw.version as number)&&!('format' in raw))return migrateOldWorld(raw);
 return validateWorldSave(raw);
}
export function serializeWorldSave(save:WorldSave):string{return JSON.stringify(validateWorldSave(save));}
