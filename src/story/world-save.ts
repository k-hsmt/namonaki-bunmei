import type {TerrainProductionSave} from '../terrain/terrain-production-wire-v1.js';
import {knownArchitecturePacket,validateArchitectureSave,type ArchitectureProductionSave} from '../architecture/production-v1.js';
import {terrainProductionPacketWorldInternal} from '../terrain/terrain-production-owned-internal.js';
import {validateTerrainProductionSave} from '../terrain/terrain-production-history-v1.js';
import type {EconomicProductionSave} from '../irrigation/economic-production-wire-v1.js';
import {knownEconomicProductionPacketInternal} from '../irrigation/economic-production-owned-internal.js';
import {validateEconomicProductionSave} from '../irrigation/economic-production-history-v1.js';
import {assertProductionBoundary} from './trial-boundary.js';
import {validateCoupledVegetation,validateEnvironment,type CoupledVegetation,type EnvironmentHistory} from '../environment/history-v1.js';
import {validateProductionWorld,validateProductionWorldAsync,ownProductionWorld} from '../irrigation/production-history-v1.js';
import type {ProductionIrrigation} from '../irrigation/production-types-v1.js';
/** Production v5 contract. Versioned readers preserve compact v1 and organic v2 progression. */
import {validateVegetationHistory,freezeVegetation,type VegetationHistory} from '../vegetation/history-v1.js';
import {createGeneratedSaveDraft,validateGeneratedSaveDraft,restoreGeneratedSaveDraft,generatedDraftMaxBytes,type GeneratedSaveDraftReview} from './generated-save-draft-review.js';
import {migrateLegacySave,validateLegacySaveDraft,type LegacySaveDraft} from './legacy-terrain-save.js';
import type {GeneratedBridgeReview} from './generated-bridge-review.js';
import {wireObject,assertJsonWire} from './generated-state-review.js';
import {groundReviewLimits} from '../terrain/ground-access-review.js';
/** Issue #35 D2-d/D3: the normal new-world default from v0.7 (architecture-production-world-v1). */
export const ARCHITECTURE_WORLD_SAVE_KEY='namonaki-story-v9';
export const TERRAIN_WORLD_SAVE_KEY='namonaki-story-v8';
export const ECONOMIC_WORLD_SAVE_KEY='namonaki-story-v7';
export const WORLD_SAVE_KEY='namonaki-story-v5';
export const IRRIGATED_WORLD_SAVE_KEY='namonaki-story-v6';
export const compactPlacementPolicy=Object.freeze({id:'terrain-placement-v1' as const,reservationMode:'field-only' as const,limits:groundReviewLimits});
export const organicPlacementPolicy=Object.freeze({id:'terrain-placement-v2' as const,reservationMode:'field-only' as const,limits:groundReviewLimits});
export const productionPlacementPolicy=Object.freeze({id:'terrain-placement-v3' as const,reservationMode:'field-only' as const,limits:groundReviewLimits});
export type GeneratedWorldSave=Omit<GeneratedSaveDraftReview,'format'|'status'|'progressionPolicy'|'rendererId'|'version'>&{
 readonly version:5|6;readonly format:'namonaki-world-save';readonly progressionPolicy:typeof productionPlacementPolicy|typeof organicPlacementPolicy|typeof compactPlacementPolicy;readonly rendererId:'generated-scene-v1'|'generated-scene-v2'|'generated-scene-v3'|'generated-scene-v4'|'generated-scene-v5'|'generated-scene-v6';readonly vegetation?:VegetationHistory|CoupledVegetation;readonly environment?:EnvironmentHistory;readonly irrigation?:ProductionIrrigation;readonly environmentAppearance?:'landscape-v2'|'landscape-v3';
};
export type LegacyWorldSave=Omit<LegacySaveDraft,'format'|'status'>&{readonly format:'namonaki-world-save'};
export type WorldSave=GeneratedWorldSave|LegacyWorldSave|EconomicProductionSave|TerrainProductionSave|ArchitectureProductionSave;
/** v9 wraps a complete native v8 packet; its terrain mode is the nested world's. */
export function worldSaveMode(save:WorldSave):'generated'|'legacy-fixed'{return save.version===9?save.world.initialTerrain.mode:save.initialTerrain.mode;}
export function generatedWorld(save:WorldSave):save is GeneratedWorldSave|EconomicProductionSave|TerrainProductionSave|ArchitectureProductionSave{return worldSaveMode(save)==='generated';}
function promoteGenerated(d:GeneratedSaveDraftReview):GeneratedWorldSave {
 const {format:_,status:__,progressionPolicy:___,rendererId:____,...payload}=d;
 return {...payload,format:'namonaki-world-save',progressionPolicy:d.progressionPolicy.id==='generated-land-review-v3'?productionPlacementPolicy:d.progressionPolicy.id==='generated-land-review-v2'?organicPlacementPolicy:compactPlacementPolicy,rendererId:'generated-scene-v1'};
}
function promoteLegacy(d:LegacySaveDraft):LegacyWorldSave {const {format:_,status:__,...payload}=d;return {...payload,format:'namonaki-world-save'};}
// Only fully validated, deeply frozen environmental saves can reuse a restore template.
// Each session receives a fresh mutable civilization; source worlds are never frozen here.
const environmentSaves=new WeakMap<object,GeneratedBridgeReview>();
function ownEnvironmentSave(save:GeneratedWorldSave,source:GeneratedBridgeReview):GeneratedWorldSave {assertProductionBoundary(source);
 const parts=structuredClone({...source.review,terrain:null,state:null}),template:GeneratedBridgeReview={...source,review:{...parts,terrain:source.review.terrain,state:save.state as GeneratedBridgeReview['review']['state']}};
 freezeVegetation(template);freezeVegetation(save);environmentSaves.set(save,template);return save;
}
export function validateWorldSave(raw:unknown):WorldSave {
 if(raw&&typeof raw==='object'&&'version'in raw&&raw.version===9){if(knownArchitecturePacket(raw))return raw;throw Error('External v9 saves require the asynchronous reader');}
 if(raw&&typeof raw==='object'&&'version'in raw&&raw.version===8){if(terrainProductionPacketWorldInternal(raw))return raw as TerrainProductionSave;throw Error('External v8 saves require the asynchronous reader');}
 if(raw&&typeof raw==='object'&&'version'in raw&&raw.version===7){if(knownEconomicProductionPacketInternal(raw))return raw as EconomicProductionSave;throw Error('External v7 saves require the asynchronous reader');}
 assertProductionBoundary(raw);
 if(raw&&typeof raw==='object'&&environmentSaves.has(raw))return raw as GeneratedWorldSave;
 if(raw&&typeof raw==='object'&&'version' in raw&&raw.version===6){const c=productionCandidate(raw);return ownEnvironmentSave(c.save,validateProductionWorld(c.world));}
 const d=wireObject(raw,['format','version','schemaVersion','initialTerrain','progressionPolicy','state'],['rendererId','landHistory','origin','vegetation','environment']);
 if(d.format!=='namonaki-world-save'||d.version!==5||d.schemaVersion!==1)throw Error('Unknown world save contract');
 const t=d.initialTerrain as {mode?:unknown}|null;
 if(t?.mode==='generated'){
  wireObject(d,['format','version','schemaVersion','initialTerrain','progressionPolicy','rendererId','landHistory','state'],['vegetation','environment']);
  const p=wireObject(d.progressionPolicy,['id','reservationMode','limits']);
  if(!['terrain-placement-v1','terrain-placement-v2','terrain-placement-v3'].includes(p.id as string)||p.reservationMode!=='field-only'||!['generated-scene-v1','generated-scene-v2','generated-scene-v3','generated-scene-v4','generated-scene-v5'].includes(d.rendererId as string))throw Error('Unknown production policy or renderer');
  if(d.environment!==undefined)assertJsonWire(d);
  const {vegetation,environment,...payload}=d;
  if((vegetation!==undefined)!==(d.rendererId!=='generated-scene-v1')||(environment!==undefined)!==(['generated-scene-v3','generated-scene-v4','generated-scene-v5'].includes(d.rendererId as string)))throw Error('Vegetation/environment renderer mismatch');
  const draft=validateGeneratedSaveDraft({...payload,format:'namonaki-generated-save-draft',status:'review-only',rendererId:'generated-scene-review-v1',progressionPolicy:{...p,id:p.id==='terrain-placement-v3'?'generated-land-review-v3':p.id==='terrain-placement-v2'?'generated-land-review-v2':'generated-land-review-v1'}});
  const base=promoteGenerated(draft);if(vegetation===undefined)return base;
  const review=restoreGeneratedSaveDraft(draft).review;if(environment!==undefined){const v=validateCoupledVegetation(vegetation,review);const e=validateEnvironment(environment,v,review);return ownEnvironmentSave({...base,rendererId:d.rendererId as 'generated-scene-v3'|'generated-scene-v4'|'generated-scene-v5',vegetation:v,environment:e},{format:'generated-bridge-review',status:'review-only',review,vegetation:v,environment:e,...(d.rendererId==='generated-scene-v5'?{environmentAppearance:'landscape-v3' as const}:d.rendererId==='generated-scene-v4'?{environmentAppearance:'landscape-v2' as const}:{})});}
  return {...base,rendererId:'generated-scene-v2',vegetation:validateVegetationHistory(vegetation,review)};
 }
 if(t?.mode==='legacy-fixed'){
  wireObject(d,['format','version','schemaVersion','initialTerrain','progressionPolicy','origin','state']);
  return promoteLegacy(validateLegacySaveDraft({...d,format:'namonaki-legacy-save-draft',status:'review-only'}));
 }
 throw Error('Unknown world terrain mode');
}
export function createGeneratedWorldSave(review:GeneratedBridgeReview):GeneratedWorldSave {assertProductionBoundary(review);
 if(review.irrigation){validateProductionWorld(review);const base=promoteGenerated(createGeneratedSaveDraft(review));return ownEnvironmentSave({...base,version:6,rendererId:'generated-scene-v6',vegetation:review.vegetation,environment:review.environment,irrigation:review.irrigation,...(review.environmentAppearance?{environmentAppearance:review.environmentAppearance}:{})},review);}
 if(review.environmentAppearance!==undefined&&(!['landscape-v2','landscape-v3'].includes(review.environmentAppearance)||!review.environment))throw Error('Invalid environment appearance');
 if(review.review.reservationMode!=='field-only')throw Error('Unapproved production reservation mode');const base=promoteGenerated(createGeneratedSaveDraft(review));if(review.environment){const v=validateCoupledVegetation(review.vegetation,review.review);const e=validateEnvironment(review.environment,v,review.review);return ownEnvironmentSave({...base,rendererId:review.environmentAppearance==='landscape-v3'?'generated-scene-v5':review.environmentAppearance==='landscape-v2'?'generated-scene-v4':'generated-scene-v3',vegetation:v,environment:e},{...review,vegetation:v,environment:e});}return review.vegetation?{...base,rendererId:'generated-scene-v2',vegetation:validateVegetationHistory(review.vegetation,review.review)}:base;
}
export function restoreGeneratedWorld(save:GeneratedWorldSave):GeneratedBridgeReview {
 assertProductionBoundary(save);
 const valid=validateWorldSave(save) as GeneratedWorldSave,cached=environmentSaves.get(valid);if(cached){const result={...cached,review:{...cached.review,state:structuredClone(cached.review.state)}};return result.irrigation?ownProductionWorld(result):result;}
 const {vegetation,environment,...payload}=valid;
 const restored=restoreGeneratedSaveDraft({...payload,format:'namonaki-generated-save-draft',status:'review-only',rendererId:'generated-scene-review-v1',progressionPolicy:{...valid.progressionPolicy,id:valid.progressionPolicy.id==='terrain-placement-v3'?'generated-land-review-v3':valid.progressionPolicy.id==='terrain-placement-v2'?'generated-land-review-v2':'generated-land-review-v1'}});
 if(environment){const v=validateCoupledVegetation(vegetation,restored.review);return {...restored,vegetation:v,environment:validateEnvironment(environment,v,restored.review)};}return vegetation?{...restored,vegetation:validateVegetationHistory(vegetation,restored.review)}:restored;
}
/** Structural validation shares the existing terrain/civilization reader, never a D2 ecology replay. */
function productionCandidate(raw:unknown):{save:GeneratedWorldSave;world:GeneratedBridgeReview}{
 assertJsonWire(raw);const text=JSON.stringify(raw);if(new TextEncoder().encode(text).length>generatedDraftMaxBytes)throw Error('World save exceeds 16MiB');
 const d=wireObject(JSON.parse(text),['format','version','schemaVersion','initialTerrain','progressionPolicy','rendererId','landHistory','state','vegetation','environment','irrigation'],['environmentAppearance']);
 const p=wireObject(d.progressionPolicy,['id','reservationMode','limits']);if(d.format!=='namonaki-world-save'||d.version!==6||d.schemaVersion!==1||d.rendererId!=='generated-scene-v6'||p.id!=='terrain-placement-v3'||p.reservationMode!=='field-only'||d.environmentAppearance!==undefined&&!['landscape-v2','landscape-v3'].includes(d.environmentAppearance as string))throw Error('Unknown production v6 contract');
 const {irrigation,environment,vegetation,environmentAppearance,...parts}=d;
 const draft=validateGeneratedSaveDraft({...parts,version:5,format:'namonaki-generated-save-draft',status:'review-only',rendererId:'generated-scene-review-v1',progressionPolicy:{...p,id:'generated-land-review-v3'}}),restored=restoreGeneratedSaveDraft(draft),v=validateCoupledVegetation(vegetation,restored.review);
 const save={...promoteGenerated(draft),version:6,rendererId:'generated-scene-v6',vegetation:v,environment,irrigation,...(environmentAppearance?{environmentAppearance}:{})} as GeneratedWorldSave;
 return {save,world:{...restored,vegetation:v,environment:environment as EnvironmentHistory,irrigation:irrigation as ProductionIrrigation,...(environmentAppearance?{environmentAppearance:environmentAppearance as 'landscape-v2'|'landscape-v3'}:{})}};
}
export async function parseWorldSaveAsync(json:string):Promise<WorldSave>{
 if(typeof json!=='string'||new TextEncoder().encode(json).length>generatedDraftMaxBytes)throw Error('World save exceeds 16MiB');const raw:unknown=JSON.parse(json);
 if(raw&&typeof raw==='object'&&'version'in raw&&raw.version===9)return validateArchitectureSave(raw);
 if(raw&&typeof raw==='object'&&'version'in raw&&raw.version===8)return validateTerrainProductionSave(raw);
 if(raw&&typeof raw==='object'&&'version'in raw&&raw.version===7)return validateEconomicProductionSave(raw);
 if(raw&&typeof raw==='object'&&'version' in raw&&raw.version===6){const candidate=productionCandidate(raw);await new Promise(resolve=>setTimeout(resolve,0));const world=await validateProductionWorldAsync(candidate.world);return ownEnvironmentSave(candidate.save,world);}return parseWorldSave(json);
}
export function migrateOldWorld(raw:unknown):LegacyWorldSave{return promoteLegacy(migrateLegacySave(raw));}
export function parseWorldSave(json:string):WorldSave {
 if(typeof json!=='string'||new TextEncoder().encode(json).length>generatedDraftMaxBytes)throw Error('World save exceeds 16MiB');
 const raw:unknown=JSON.parse(json);if(raw&&typeof raw==='object'&&'version' in raw&&[2,3,4].includes(raw.version as number)&&!('format' in raw))return migrateOldWorld(raw);
 return validateWorldSave(raw);
}
export function serializeWorldSave(save:WorldSave):string {const json=JSON.stringify(validateWorldSave(save));if(new TextEncoder().encode(json).length>generatedDraftMaxBytes)throw Error('World save exceeds 16MiB');return json;}
