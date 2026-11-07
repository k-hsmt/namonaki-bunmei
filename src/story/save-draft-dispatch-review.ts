/** D4-B read/write proposal, isolated from the live app entry point. */
import {LEGACY_DRAFT_SAVE_KEY,parseLegacyCompatibleSave,serializeLegacySaveDraft,type ValidatedLegacySaveDraft} from './legacy-terrain-save.js';
import {CURRENT_SAVE_KEY,LEGACY_SAVE_KEYS} from './housing-persistence.js';
import {parseGeneratedSaveDraft,serializeGeneratedSaveDraft,type ValidatedGeneratedSaveDraft,generatedDraftMaxBytes} from './generated-save-draft-review.js';
export type ReviewSaveDraft=ValidatedLegacySaveDraft|ValidatedGeneratedSaveDraft;
export const REVIEW_V5_SAVE_KEY=LEGACY_DRAFT_SAVE_KEY;
/** The JSON mode and format choose the validator. Unknown v5 never falls back. */
export function parseReviewSaveDraft(json:string):ReviewSaveDraft {
 if(typeof json!=='string'||new TextEncoder().encode(json).length>generatedDraftMaxBytes)throw Error('Save draft exceeds 16MiB');
 const raw:unknown=JSON.parse(json);
 if(raw&&typeof raw==='object'&&'version' in raw&&raw.version===5){
  const mode='initialTerrain' in raw&&raw.initialTerrain&&typeof raw.initialTerrain==='object'&&'mode' in raw.initialTerrain?raw.initialTerrain.mode:undefined;
  if(mode==='generated')return parseGeneratedSaveDraft(json);
  if(mode!=='legacy-fixed')throw Error('Unknown v5 terrain mode');
 }
 return parseLegacyCompatibleSave(json);
}
export function findReviewSaveDraft(read:(key:string)=>string|null):{key:string;draft:ReviewSaveDraft}|null {
 for(const key of [REVIEW_V5_SAVE_KEY,CURRENT_SAVE_KEY,...LEGACY_SAVE_KEYS]){const raw=read(key);if(raw!==null)return {key,draft:parseReviewSaveDraft(raw)};}return null;
}
export function serializeReviewSaveDraft(draft:ReviewSaveDraft):string {
 return draft.initialTerrain.mode==='generated'?serializeGeneratedSaveDraft(draft as ValidatedGeneratedSaveDraft):serializeLegacySaveDraft(draft as ValidatedLegacySaveDraft);
}
/** Native localStorage.setItem is atomic on failure. No other key is touched. */
export function storeReviewSaveDraft(storage:Pick<Storage,'setItem'>,draft:ReviewSaveDraft):
 {status:'saved';bytes:number}|{status:'not-saved';reason:'quota'|'storage';exportJson:string}{
 const json=serializeReviewSaveDraft(draft);
 try{storage.setItem(REVIEW_V5_SAVE_KEY,json);return {status:'saved',bytes:new TextEncoder().encode(json).length};}
 catch(error){return {status:'not-saved',reason:error instanceof Error&&error.name==='QuotaExceededError'?'quota':'storage',exportJson:json};}
}
