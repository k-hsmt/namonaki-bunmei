/**
 * H2-A: 保存形式の検査と旧形式からの前方のみの移行。
 * UI / localStorage / 自然進行へは接続しない。入力は変更せず、乱数を消費しない。
 */
import {migrateCivilization,type CivilizationState} from './engine.js';
import {housingAt,type HousingHistory,type ResidentialBlockEvent} from './housing-history.js';

export interface PersistedHousingHistory extends HousingHistory {
 readonly schemaVersion:1;
}
type BaseSaveState = Omit<CivilizationState,'version'> & {version:2|3|4};
export type HousingSaveState = Omit<CivilizationState,'version'> & {
 version:4;
 housing:PersistedHousingHistory;
};
const fail=(reason:string):never=>{throw Error('住宅保存形式: '+reason);};
const isRecord=(x:unknown):x is Record<string,unknown> =>
 typeof x==='object'&&x!==null&&!Array.isArray(x);
const integer=(x:unknown)=>Number.isSafeInteger(x)&&Number(x)>=0;
function keysOnly(x:Record<string,unknown>,allowed:readonly string[]):void{
 for(const key of Object.keys(x))if(!allowed.includes(key))fail('未知の住宅属性: '+key);
}
function validateHousing(input:unknown,confirmedYear:number):PersistedHousingHistory{
 if(!isRecord(input))return fail('住宅履歴が欠損');
 keysOnly(input,['schemaVersion','introducedYear','legacyUntracked','events']);
 if(input.schemaVersion!==1||!integer(input.introducedYear)||
 typeof input.legacyUntracked!=='boolean'||!Array.isArray(input.events))fail('住宅履歴ヘッダーが不正');
 const introducedYear=input.introducedYear as number;
 if(introducedYear>confirmedYear+1)fail('住宅追跡開始年が未来すぎる');
 const events:ResidentialBlockEvent[]=[];
 for(const raw of input.events as unknown[]){
  if(!isRecord(raw))fail('住宅イベントが不正');
  keysOnly(raw,['year','seq','kind','blockId','after','causeRecordId']);
  if(!integer(raw.year)||!integer(raw.seq)||typeof raw.blockId!=='string'||
   typeof raw.kind!=='string'||!isRecord(raw.after)||Number(raw.year)>confirmedYear)fail('イベント確定年・形式が不正');
  if(raw.causeRecordId!==undefined&&typeof raw.causeRecordId!=='string')fail('原因記録IDが不正');
  keysOnly(raw.after,['blockId','siteId','footprint','builtYear','housingCount','condition','use','styleId','styleSeed','lastRenovatedYear']);
  if(!isRecord(raw.after.footprint))fail('敷地が不正');
  keysOnly(raw.after.footprint,['x','y','width','depth']);
  events.push(raw as unknown as ResidentialBlockEvent);
 }
 const housing:PersistedHousingHistory={
  schemaVersion:1,introducedYear,
  legacyUntracked:input.legacyUntracked as boolean,events,
 };
 // H1のイベント検証を再利用。年を末尾に固定し、全イベントを最後まで検証する。
 housingAt(housing,Math.max(confirmedYear,introducedYear));
 return housing;
}
function validateCommon(input:unknown):asserts input is BaseSaveState{
 if(!isRecord(input))fail('保存データが不正');
 if(![2,3,4].includes(Number(input.version)))fail('未対応の保存バージョン');
 if(!integer(input.year)||!integer(input.seed)||
 !integer(input.rngState)||!Number.isSafeInteger(input.population)||
 Number(input.population)<60||!Array.isArray(input.history)||
 !Array.isArray(input.decisions)||!Array.isArray(input.samples)||
 !('pending' in input))fail('基本状態が不正');
 if((input.version===3||input.version===4)&&!isRecord(input.observation))fail('観測台帳が欠損');
}
/** 旧セーブの最後の確定年。既存の未確定年／旧境界を遡及変更しない。 */
function confirmedYear(state:BaseSaveState):number{
 if(state.version===2)return state.year; // v2の既存移行はその年をlegacy境界として扱う
 const observation=state.observation!;
 const y=observation.lastYear??observation.legacy?.year;
 if(!integer(y))fail('観測境界が不正');
 if(y>state.year)fail('観測年が現在年より未来');
 return y;
}
/** 入力を変更せず新規v4状態を作る。旧住宅を逆算・補完しない。 */
export function prepareHousingSave(raw:unknown):HousingSaveState{
 validateCommon(raw);
 const copy=structuredClone(raw) as BaseSaveState;
 if(copy.version===4){
  const current=copy as unknown as HousingSaveState;
  const confirmed=confirmedYear(current);
  current.housing=validateHousing(current.housing,confirmed);
  if(!current.housing.legacyUntracked&&current.housing.introducedYear!==0)fail('新規完全記録の導入年が0以外');
  return current;
 }
 const existing=copy as CivilizationState;
 const confirmed=confirmedYear(existing);
 const migrated=migrateCivilization(existing);
 const after=migrated.observation!;
 const actual=after.lastYear??after.legacy?.year;
 if(actual!==confirmed)fail('旧観測境界が移行中に変化');
 const housing:PersistedHousingHistory={
  schemaVersion:1,introducedYear:confirmed+1,legacyUntracked:true,events:[],
 };
 return {...migrated,version:4,housing};
}
/** H2-Bが使う保存前検証。任意の住宅記録を黙って生成しない。 */
export function validateHousingSave(raw:unknown):HousingSaveState{
 validateCommon(raw);
 if(raw.version!==4)fail('v4保存データが必要');
 return prepareHousingSave(raw);
}
