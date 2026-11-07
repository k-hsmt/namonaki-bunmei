/** Production v5 contract. Frozen trial readers implement the approved v1 rules. */
import {createGeneratedSaveDraft,validateGeneratedSaveDraft,restoreGeneratedSaveDraft,generatedDraftMaxBytes,type GeneratedSaveDraftReview} from './generated-save-draft-review.js';
import {migrateLegacySave,validateLegacySaveDraft,type LegacySaveDraft} from './legacy-terrain-save.js';
import type {GeneratedBridgeReview} from './generated-bridge-review.js';
import {wireObject} from './generated-state-review.js';
import {groundReviewLimits} from '../terrain/ground-access-review.js';
export const WORLD_SAVE_KEY='namonaki-story-v5';
export const productionPlacementPolicy=Object.freeze({id:'terrain-placement-v1' as const,reservationMode:'field-only' as const,limits:groundReviewLimits});
export type GeneratedWorldSave=Omit<GeneratedSaveDraftReview,'format'|'status'|'progressionPolicy'|'rendererId'>&{
 readonly format:'namonaki-world-save';readonly progressionPolicy:typeof productionPlacementPolicy;readonly rendererId:'generated-scene-v1';
};
export type LegacyWorldSave=Omit<LegacySaveDraft,'format'|'status'>&{readonly format:'namonaki-world-save'};
export type WorldSave=GeneratedWorldSave|LegacyWorldSave;
export function generatedWorld(save:WorldSave):save is GeneratedWorldSave{return save.initialTerrain.mode==='generated';}
function promoteGenerated(d:GeneratedSaveDraftReview):GeneratedWorldSave {
 const {format:_,status:__,progressionPolicy:___,rendererId:____,...payload}=d;
 return {...payload,format:'namonaki-world-save',progressionPolicy:productionPlacementPolicy,rendererId:'generated-scene-v1'};
}
function promoteLegacy(d:LegacySaveDraft):LegacyWorldSave {const {format:_,status:__,...payload}=d;return {...payload,format:'namonaki-world-save'};}
export function validateWorldSave(raw:unknown):WorldSave {
 const d=wireObject(raw,['format','version','schemaVersion','initialTerrain','progressionPolicy','state'],['rendererId','landHistory','origin']);
 if(d.format!=='namonaki-world-save'||d.version!==5||d.schemaVersion!==1)throw Error('Unknown world save contract');
 const t=d.initialTerrain as {mode?:unknown}|null;
 if(t?.mode==='generated'){
  wireObject(d,['format','version','schemaVersion','initialTerrain','progressionPolicy','rendererId','landHistory','state']);
  const p=wireObject(d.progressionPolicy,['id','reservationMode','limits']);
  if(p.id!=='terrain-placement-v1'||p.reservationMode!=='field-only'||d.rendererId!=='generated-scene-v1')throw Error('Unknown production policy or renderer');
  const draft=validateGeneratedSaveDraft({...d,format:'namonaki-generated-save-draft',status:'review-only',rendererId:'generated-scene-review-v1',progressionPolicy:{...p,id:'generated-land-review-v1'}});
  return promoteGenerated(draft);
 }
 if(t?.mode==='legacy-fixed'){
  wireObject(d,['format','version','schemaVersion','initialTerrain','progressionPolicy','origin','state']);
  return promoteLegacy(validateLegacySaveDraft({...d,format:'namonaki-legacy-save-draft',status:'review-only'}));
 }
 throw Error('Unknown world terrain mode');
}
export function createGeneratedWorldSave(review:GeneratedBridgeReview):GeneratedWorldSave {
 if(review.review.reservationMode!=='field-only')throw Error('Unapproved production reservation mode');return promoteGenerated(createGeneratedSaveDraft(review));
}
export function restoreGeneratedWorld(save:GeneratedWorldSave):GeneratedBridgeReview {
 const valid=validateWorldSave(save) as GeneratedWorldSave;
 return restoreGeneratedSaveDraft({...valid,format:'namonaki-generated-save-draft',status:'review-only',rendererId:'generated-scene-review-v1',progressionPolicy:{...valid.progressionPolicy,id:'generated-land-review-v1'}});
}
export function migrateOldWorld(raw:unknown):LegacyWorldSave{return promoteLegacy(migrateLegacySave(raw));}
export function parseWorldSave(json:string):WorldSave {
 if(typeof json!=='string'||new TextEncoder().encode(json).length>generatedDraftMaxBytes)throw Error('World save exceeds 16MiB');
 const raw:unknown=JSON.parse(json);if(raw&&typeof raw==='object'&&'version' in raw&&[2,3,4].includes(raw.version as number)&&!('format' in raw))return migrateOldWorld(raw);
 return validateWorldSave(raw);
}
export function serializeWorldSave(save:WorldSave):string{return JSON.stringify(validateWorldSave(save));}
