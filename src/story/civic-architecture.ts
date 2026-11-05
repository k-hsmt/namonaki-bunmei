/**
 * H4-D4-A: 大型共同施設の明示的な新築記録と、河畔の土地占有ゲート。
 *
 * 自然進行からは呼び出さない。既存のhallを改築・置換しない。
 * 「建築様式」「実際の敷地」「建設イベントの不変な出典」は一組の正本。
 */
import type {HousingPlot,ResidentialBlock} from './housing-history.js';
import type {Building,SettlementHistory} from './settlement-history.js';
import {siteAt} from './settlement-history.js';
import type {SiteObject} from '../scene/model.js';
import {existingGround,isUnoccupiedGround} from '../scene/housing-ground.js';

export type CivicStyle='great-hall'|'courtyard-hall';
export interface CivicFoundation{
 readonly architectureStyle:CivicStyle;
 readonly footprint:HousingPlot;
 /** 建設時の確定イベントID。後の修繕recordIdとは独立。 */
 readonly constructionRecordId:string;
}
export type CivicBuilding=Building & {kind:'hall';civic:CivicFoundation};
export interface CivicConstructionRecord{
 readonly id:string;readonly year:number;readonly kind?:string;readonly buildingId?:string;
}
export type CivicHoldReason=
 'unsupported-terrain'|'invalid-candidate'|'unconfirmed-event'|
 'duplicate-id'|'occupied-ground'|'past-or-out-of-order';
export type CivicGateResult=
 |{readonly status:'hold';readonly reason:CivicHoldReason;readonly conflicts:readonly string[]}
 |{readonly status:'clear';readonly conflicts:readonly string[]};
const isObj=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const nat=(x:unknown)=>Number.isSafeInteger(x)&&Number(x)>=0;
const box=(x:unknown):x is HousingPlot=>isObj(x)&&
 ['x','y','width','depth'].every(k=>nat(x[k]))&&
 Number(x.width)>0&&Number(x.depth)>0&&
 Number(x.x)+Number(x.width)<=320&&Number(x.y)+Number(x.depth)<=180&&
 Object.keys(x).every(k=>['x','y','width','depth'].includes(k));
const intersects=(a:HousingPlot,b:HousingPlot)=>a.x<b.x+b.width&&b.x<a.x+a.width&&
 a.y<b.y+b.depth&&b.y<a.y+a.depth;

/** 様式なしは旧hall：勝手に改築しない。存在するcivicは必ず全フィールドを検査。 */
export function validateCivicBuilding(raw:unknown):raw is CivicBuilding{
 if(!isObj(raw)||raw.kind!=='hall'||typeof raw.id!=='string'||!raw.id.startsWith('civic-')||
  !nat(raw.builtYear)||!nat(raw.x)||!nat(raw.y)||!['intact','damaged','ruined'].includes(String(raw.condition))||
  !isObj(raw.civic))return false;
 const c=raw.civic;
 return (c.architectureStyle==='great-hall'||c.architectureStyle==='courtyard-hall')&&
  typeof c.constructionRecordId==='string'&&c.constructionRecordId.length>0&&
  box(c.footprint)&&Object.keys(c).every(k=>['architectureStyle','footprint','constructionRecordId'].includes(k))&&
  c.footprint.x<=Number(raw.x)&&Number(raw.x)<c.footprint.x+c.footprint.width&&
  c.footprint.y<=Number(raw.y)&&Number(raw.y)<c.footprint.y+c.footprint.depth;
}
const matchingRecord=(b:CivicBuilding,records:readonly CivicConstructionRecord[])=>
 records.some(r=>r.id===b.civic.constructionRecordId&&r.year===b.builtYear&&
 r.kind==='building-built'&&r.buildingId===b.id);

export function reviewCivicConstruction(params:{
 readonly siteIndex:number;readonly year:number;readonly candidate:unknown;
 readonly buildings:readonly SiteObject[];readonly housingBlocks:readonly ResidentialBlock[];
 readonly records:readonly CivicConstructionRecord[];
}):CivicGateResult{
 const {siteIndex,year,candidate,buildings,housingBlocks,records}=params;
 const hold=(reason:CivicHoldReason,conflicts:readonly string[]=[]):CivicGateResult=>
  ({status:'hold',reason,conflicts});
 if(siteIndex!==0)return hold('unsupported-terrain');
 if(!validateCivicBuilding(candidate)||candidate.condition!=='intact'||
  candidate.recordId!==candidate.civic.constructionRecordId||
  !nat(year)||candidate.builtYear!==year)return hold('invalid-candidate');
 if(!matchingRecord(candidate,records))return hold('unconfirmed-event');
 if(buildings.some(b=>b.id===candidate.id))return hold('duplicate-id',[candidate.id]);
 const footprint=candidate.civic.footprint;
 const conflicts=[
  ...housingBlocks.filter(b=>intersects(footprint,b.footprint)).map(b=>'housing:'+b.blockId),
  ...buildings.filter(b=>intersects(footprint,existingGround(b))).map(b=>'facility:'+b.id),
 ];
 if(!isUnoccupiedGround(footprint,housingBlocks.map(b=>b.footprint),buildings,siteIndex)){
  if(conflicts.length===0)conflicts.push('terrain-or-boundary');
  return hold('occupied-ground',conflicts);
 }
 return {status:'clear',conflicts:[]};
}

/** 人の手で確定した建設イベントを受け取り純粋に追記するだけ。エンジンからは未接続。 */
export function appendConfirmedCivicConstruction(params:{
 readonly history:SettlementHistory;readonly siteIndex:number;readonly year:number;
 readonly candidate:CivicBuilding;readonly housingBlocks:readonly ResidentialBlock[];
 readonly records:readonly CivicConstructionRecord[];
}):SettlementHistory{
 const {history,siteIndex,year,candidate,housingBlocks,records}=params;
 const site=history[siteIndex];
 if(!site)throw Error('大型公共建築: 地点が存在しない');
 const lastYear=Math.max(site.changes.at(-1)?.year??-1,site.buildingChanges.at(-1)?.year??-1);
 if(year<lastYear)throw Error('大型公共建築: 過去への遡及的な新築は禁止');
 const at=siteAt(history,siteIndex,year);
 if(!at)throw Error('大型公共建築: 対象年の既存施設が未確定');
 const result=reviewCivicConstruction({
  siteIndex,year,candidate,buildings:at.buildings,housingBlocks,records,
 });
 if(result.status==='hold')throw Error('大型公共建築 HOLD: '+result.reason+' '+result.conflicts.join(','));
 const next=structuredClone(history);
 const updated=next[siteIndex]!;
 const building=structuredClone(candidate);
 updated.view.buildings.push(building);
 updated.buildingChanges.push({year,building:structuredClone(building)});
 return next;
}

/** v4で追加のcivic情報がある場合だけ厳格に検査。旧セーブの欠損は推測補完しない。 */
export function validateCivicLedger(sites:unknown,records:unknown,confirmedYear:number):void{
 if(!Array.isArray(sites))return; // 移行済みだが旧地点履歴がまだ無いセーブの互換
 if(!Array.isArray(records))throw Error('大型公共建築: イベント一覧が不正');
 for(let i=0;i<sites.length;i++){
  const site=sites[i];
  if(!isObj(site)||!Array.isArray(site.buildingChanges)||!isObj(site.view)||
   !Array.isArray(site.view.buildings))continue;
  const byId=new Map<string,CivicBuilding|false>();
  for(const change of site.buildingChanges){
   if(!isObj(change)||!isObj(change.building))continue;
   const b=change.building;
   const previous=byId.get(String(b.id));
   const hasCivic=Object.hasOwn(b,'civic');
   if(!hasCivic&&previous===undefined){byId.set(String(b.id),false);continue;}
   if(!hasCivic||!validateCivicBuilding(b)||i!==0)
    throw Error('大型公共建築: 不正な建築様式または地点');
   if(!nat(change.year)||Number(change.year)>confirmedYear)throw Error('大型公共建築: 未確定年');
   if(!matchingRecord(b,records as CivicConstructionRecord[]))throw Error('大型公共建築: 建設出典が不正');
   if(previous===false)throw Error('大型公共建築: 既存建物の無断改築');
   if(previous===undefined){
    if(change.year!==b.builtYear||b.condition!=='intact'||b.recordId!==b.civic.constructionRecordId)
     throw Error('大型公共建築: 初回建設状態が不正');
   }else{
    if(b.builtYear!==previous.builtYear||b.x!==previous.x||b.y!==previous.y||
     b.kind!==previous.kind||JSON.stringify(b.civic)!==JSON.stringify(previous.civic))
     throw Error('大型公共建築: 確定した敷地・様式・出典が改変された');
   }
   byId.set(b.id,b as unknown as CivicBuilding);
  }
  for(const b of site.view.buildings){
   if(!isObj(b))continue;
   const previous=byId.get(String(b.id));
   if(Object.hasOwn(b,'civic')){
    if(!validateCivicBuilding(b)||!previous||
     JSON.stringify(b.civic)!==JSON.stringify(previous.civic)||
     b.builtYear!==previous.builtYear||b.x!==previous.x||b.y!==previous.y)
     throw Error('大型公共建築: 現在の施設と確定履歴が一致しない');
   }else if(previous&&previous!==false)
    throw Error('大型公共建築: 現在の施設から建築正本が消えた');
  }
 }
}
