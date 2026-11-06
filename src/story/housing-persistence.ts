/** H2-B: ブラウザ操作と分離した保存・読込の純粋関数。 */
import {createCivilization} from './engine.js';
import {prepareHousingSave,validateHousingSave,type HousingSaveState} from './housing-save.js';

export const CURRENT_SAVE_KEY='namonaki-story-v4';
export const LEGACY_SAVE_KEYS=['namonaki-story-v3','namonaki-story-v2'] as const;

/**
 * 新しく始めた文明は年0から住宅履歴の追跡対象。
 * H3以前はイベント0件が正しい状態（既存施設の履歴には触れない）。
 */
export function createHousingCivilization(seed:number):HousingSaveState {
 const original=createCivilization(seed);
 return {...original,version:4,publicSpaces:{schemaVersion:1,introducedYear:0,legacyUntracked:false,events:[]},housing:{
  schemaVersion:1,introducedYear:0,legacyUntracked:false,events:[],
 }};
}
/** 読込・検証・移行は呼出元に影響を与えない。 */
export function parseHousingSave(raw:string):HousingSaveState {
 const candidate=prepareHousingSave(JSON.parse(raw) as unknown);
 return validateHousingSave(candidate);
}
/** 不正状態を黙って補完せず、書込前に検証。 */
export function serializeHousingSave(state:HousingSaveState):string {
 return JSON.stringify(validateHousingSave(state));
}
/**
 * 現行キーがあればそれを優先する。破損時に旧キーへ暗黙フォールバックしない。
 * 未保存だけをnullで返し、空文字列も破損値として扱う。
 */
export function findSavedHousing(
 read:(key:string)=>string|null,
):{key:string;raw:string}|null {
 const current=read(CURRENT_SAVE_KEY);
 if(current!==null)return {key:CURRENT_SAVE_KEY,raw:current};
 for(const key of LEGACY_SAVE_KEYS){
  const old=read(key);
  if(old!==null)return {key,raw:old};
 }
 return null;
}
