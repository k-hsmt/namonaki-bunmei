/**
 * H4-D7-A: 公共の空地を、実在する建築とは独立した確定土地利用として扱う。
 * 本工程では自然進行から生成しない。既存の道路・前庭の推測から記録を作らない。
 */
import type {HousingPlot,ResidentialBlock,HousingHistory} from './housing-history.js';
import {housingAt} from './housing-history.js';
import type {SettlementHistory} from './settlement-history.js';
import {fixedFacilityLotReservations,siteAt} from './settlement-history.js';
import type {SiteObject} from '../scene/model.js';
import {existingGround,isUnoccupiedGround} from '../scene/housing-ground.js';

export type PublicSpaceKind='assembly-ground'|'market-yard';
export type PublicSpaceCondition='used'|'overgrown';
export type PublicSpaceTransition='established'|'overgrown'|'reused';

export interface PublicSpace {
 readonly id:string;
 readonly siteId:'river-bank';
 readonly kind:PublicSpaceKind;
 readonly footprint:HousingPlot;
 readonly establishedYear:number;
 readonly anchorBuildingId:string;
 readonly foundationRecordId:string;
 readonly condition:PublicSpaceCondition;
}
export interface PublicSpaceEvent {
 readonly year:number;
 readonly seq:number;
 readonly kind:PublicSpaceTransition;
 readonly spaceId:string;
 readonly after:PublicSpace;
 readonly causeRecordId:string;
}
export interface PublicSpaceHistory {
 readonly schemaVersion:1;
 /** この年より前の未記録は「空地が存在しない」を意味しない。 */
 readonly introducedYear:number;
 readonly legacyUntracked:boolean;
 readonly events:readonly PublicSpaceEvent[];
}
export interface PublicSpaceView {
 readonly status:'unknown'|'partial'|'known';
 readonly spaces:readonly PublicSpace[];
}
export interface PublicSpaceRecord {
 readonly id:string;
 readonly year:number;
 readonly kind?:string;
 readonly publicSpaceId?:string;
}
export type PublicSpaceHoldReason='unsupported-terrain'|'unknown-history'|
 'invalid-candidate'|'unconfirmed-event'|'anchor-unavailable'|
 'occupied-ground'|'duplicate-space';
export type PublicSpaceGate=
 |{readonly status:'hold';readonly reason:PublicSpaceHoldReason;readonly conflicts:readonly string[]}
 |{readonly status:'clear';readonly conflicts:readonly string[]};

const err=(reason:string):never=>{throw Error('公共空地履歴: '+reason);};
const object=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const nat=(x:unknown)=>Number.isSafeInteger(x)&&Number(x)>=0;
const keys=(x:Record<string,unknown>,allow:readonly string[])=>{
 if(Object.keys(x).some(k=>!allow.includes(k)))err('未知の属性');
};
const overlaps=(a:HousingPlot,b:HousingPlot)=>
 a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.depth&&b.y<a.y+a.depth;
export function overlapsPublicSpace(footprint:HousingPlot,spaces:readonly PublicSpace[]):boolean{
 return spaces.some(s=>overlaps(footprint,s.footprint));
}
const validBox=(x:unknown):x is HousingPlot=>{
 if(!object(x))return false;
 return Object.keys(x).every(k=>['x','y','width','depth'].includes(k))&&
  [x.x,x.y,x.width,x.depth].every(nat)&&
  Number(x.width)>=12&&Number(x.depth)>=6&&
  Number(x.width)<=64&&Number(x.depth)<=32&&
  Number(x.x)+Number(x.width)<=320&&Number(x.y)+Number(x.depth)<=180;
};
export function validatePublicSpace(x:unknown):x is PublicSpace{
 if(!object(x)||!validBox(x.footprint))return false;
 const value=x;
 return Object.keys(value).every(k=>['id','siteId','kind','footprint','establishedYear',
  'anchorBuildingId','foundationRecordId','condition'].includes(k))&&
  typeof value.id==='string'&&value.id.startsWith('public-river-bank-')&&
  value.siteId==='river-bank'&&
  (value.kind==='assembly-ground'||value.kind==='market-yard')&&
  nat(value.establishedYear)&&
  typeof value.anchorBuildingId==='string'&&value.anchorBuildingId.length>0&&
  typeof value.foundationRecordId==='string'&&value.foundationRecordId.length>0&&
  (value.condition==='used'||value.condition==='overgrown');
}
const immutable=(a:PublicSpace,b:PublicSpace)=>
 a.id===b.id&&a.siteId===b.siteId&&a.kind===b.kind&&
 a.establishedYear===b.establishedYear&&a.anchorBuildingId===b.anchorBuildingId&&
 a.foundationRecordId===b.foundationRecordId&&
 JSON.stringify(a.footprint)===JSON.stringify(b.footprint);

/** 当年の正本だけを読む。必ずイベント順・形状・状態遷移を検証する。 */
export function publicSpacesAt(history:PublicSpaceHistory|undefined,year:number):PublicSpaceView{
 if(!nat(year))err('観測年が不正');
 if(!history)return {status:'unknown',spaces:[]};
 if(history.schemaVersion!==1||!nat(history.introducedYear)||
  typeof history.legacyUntracked!=='boolean'||!Array.isArray(history.events))err('履歴ヘッダーが不正');
 if(year<history.introducedYear)
  return {status:history.legacyUntracked?'unknown':'known',spaces:[]};
 const spaces=new Map<string,PublicSpace>();
 let lastYear=-1,lastSeq=-1;
 for(const e of history.events){
  if(!e||!nat(e.year)||!nat(e.seq)||e.year<history.introducedYear||
   e.year<lastYear||(e.year===lastYear&&e.seq<=lastSeq))err('イベントの順序が不正');
  lastYear=e.year;lastSeq=e.seq;
  if(e.year>year)break;
  if(!['established','overgrown','reused'].includes(e.kind)||!validatePublicSpace(e.after)||
   e.spaceId!==e.after.id||!e.causeRecordId)err('イベント属性が不正');
  const old=spaces.get(e.spaceId);
  if(e.kind==='established'){
   if(old||e.after.establishedYear!==e.year||e.after.condition!=='used'||
    e.after.foundationRecordId!==e.causeRecordId)err('不正な成立または重複');
   if([...spaces.values()].some(s=>overlaps(s.footprint,e.after.footprint)))err('公共空地どうしが重複');
  }else{
   if(!old)throw Error('公共空地履歴: 未成立の更新');
   if(!immutable(old,e.after))throw Error('公共空地履歴: 不変属性の変更');
   if(e.kind==='overgrown'&&(old.condition!=='used'||e.after.condition!=='overgrown'))
    err('荒廃への遷移が不正');
   if(e.kind==='reused'&&(old.condition!=='overgrown'||e.after.condition!=='used'))
    err('再利用への遷移が不正');
  }
  spaces.set(e.spaceId,{...e.after,footprint:{...e.after.footprint}});
 }
 return {status:history.legacyUntracked?'partial':'known',spaces:[...spaces.values()].sort((a,b)=>a.id.localeCompare(b.id))};
}
const hasRecord=(records:readonly PublicSpaceRecord[],id:string,year:number,kind:string,spaceId:string)=>{
 const found=records.filter(e=>e.id===id);
 return found.length===1&&found[0]!.year===year&&found[0]!.kind===kind&&
  found[0]!.publicSpaceId===spaceId;
};

/** 確定記録がある新設候補だけを審査。clearは将来の自然建設許可ではない。 */
export function reviewPublicSpaceFoundation(input:{
 readonly siteIndex:number;readonly year:number;readonly candidate:unknown;
 readonly buildings:readonly SiteObject[];readonly housingBlocks:readonly ResidentialBlock[];
 readonly existing:readonly PublicSpace[];readonly records:readonly PublicSpaceRecord[];
 readonly housingStatus:'unknown'|'partial'|'known';
}):PublicSpaceGate{
 const {siteIndex,year,candidate,buildings,housingBlocks,existing,records,housingStatus}=input;
 const hold=(reason:PublicSpaceHoldReason,conflicts:readonly string[]=[]):PublicSpaceGate=>
  ({status:'hold',reason,conflicts});
 if(siteIndex!==0)return hold('unsupported-terrain');
 if(housingStatus!=='known')return hold('unknown-history');
 if(!validatePublicSpace(candidate)||!nat(year)||candidate.establishedYear!==year||
  candidate.condition!=='used')return hold('invalid-candidate');
 if(!hasRecord(records,candidate.foundationRecordId,year,'public-space-established',candidate.id))
  return hold('unconfirmed-event');
 if(existing.some(s=>s.id===candidate.id))return hold('duplicate-space',[candidate.id]);
 const anchor=buildings.find(b=>b.id===candidate.anchorBuildingId&&b.builtYear<=year&&b.condition==='intact');
 if(!anchor||(candidate.kind==='assembly-ground'&&anchor.kind!=='hall')||
  (candidate.kind==='market-yard'&&anchor.kind!=='market'))
  return hold('anchor-unavailable');
 const c=candidate.footprint;
 const anchorPlot=existingGround(anchor);
 const mid=(f:HousingPlot)=>({x:f.x+f.width/2,y:f.y+f.depth/2});
 const a=mid(c),b=mid(anchorPlot);
 if(Math.abs(a.x-b.x)+Math.abs(a.y-b.y)>90)return hold('anchor-unavailable');
 const reserved=fixedFacilityLotReservations(0)
  .map(lot=>({id:lot.id,footprint:existingGround({...lot,builtYear:0,condition:'intact'})}));
 const conflicts=[
  ...housingBlocks.filter(b=>overlaps(c,b.footprint)).map(b=>'housing:'+b.blockId),
  ...buildings.filter(b=>overlaps(c,existingGround(b))).map(b=>'facility:'+b.id),
  ...existing.filter(e=>overlaps(c,e.footprint)).map(e=>'space:'+e.id),
  ...reserved.filter(r=>overlaps(c,r.footprint)).map(r=>'reserved:'+r.id),
 ];
 if(conflicts.length||!isUnoccupiedGround(c,housingBlocks.map(b=>b.footprint),buildings,0))
  return hold('occupied-ground',conflicts.length?conflicts:['river-or-boundary']);
 return {status:'clear',conflicts:[]};
}

/** 明示記録から、まだ確定していない年だけを新設する。入力は不変。 */
export function appendConfirmedPublicSpace(input:{
 readonly history:PublicSpaceHistory;readonly year:number;readonly candidate:PublicSpace;
 readonly buildings:readonly SiteObject[];readonly housingBlocks:readonly ResidentialBlock[];
 readonly records:readonly PublicSpaceRecord[];
}):PublicSpaceHistory{
 const {history,year,candidate,buildings,housingBlocks,records}=input;
 if(history.events.at(-1)&&history.events.at(-1)!.year>year)err('過去年への追記は不正');
 const existing=publicSpacesAt(history,year);
 if(existing.status!=='known')err('住宅・公共空地の過去が未確認');
 const gate=reviewPublicSpaceFoundation({siteIndex:0,year,candidate,buildings,housingBlocks,
  existing:existing.spaces,records,housingStatus:'known'});
 if(gate.status==='hold')err('HOLD '+gate.reason+' '+gate.conflicts.join(','));
 const seq=history.events.at(-1)?.year===year?history.events.at(-1)!.seq+1:0;
 const event:PublicSpaceEvent={year,seq,kind:'established',spaceId:candidate.id,
  causeRecordId:candidate.foundationRecordId,after:structuredClone(candidate)};
 const next:PublicSpaceHistory={...history,events:[...history.events,event]};
 publicSpacesAt(next,year);
 return next;
}
/** 過去の新築・敷地・起源は一切書換えず、明示記録で利用状態のみ遷移。 */
export function appendConfirmedPublicSpaceUse(input:{
 readonly history:PublicSpaceHistory;readonly year:number;readonly spaceId:string;
 readonly kind:'overgrown'|'reused';readonly causeRecordId:string;
 readonly records:readonly PublicSpaceRecord[];
}):PublicSpaceHistory{
 const {history,year,spaceId,kind,causeRecordId,records}=input;
 if(history.events.at(-1)&&history.events.at(-1)!.year>=year)err('同年の重複・過去年への追記');
 const view=publicSpacesAt(history,year);
 if(view.status==='unknown')err('土地利用の過去が未確認');
 const old=view.spaces.find(s=>s.id===spaceId);
 if(!old)throw Error('公共空地履歴: 未成立の公共空地');
 if(!hasRecord(records,causeRecordId,year,
  kind==='overgrown'?'public-space-overgrown':'public-space-reused',spaceId))
  err('状態変更の確定記録が無い');
 const next:PublicSpaceHistory={...history,events:[...history.events,{
  year,seq:0,kind,spaceId,causeRecordId,
  after:{...old,footprint:{...old.footprint},condition:kind==='overgrown'?'overgrown':'used'},
 }]};
 publicSpacesAt(next,year);
 return next;
}

/** 保存形式の拡張は任意。未記録の旧v4を歴史に遡って埋めない。 */
export function validatePublicSpaceLedger(input:unknown,params:{
 readonly confirmedYear:number;readonly records:readonly PublicSpaceRecord[];
 readonly sites:SettlementHistory|undefined;readonly housing:HousingHistory|undefined;
}):void{
 if(input===undefined)return;
 if(!object(input))throw Error('公共空地履歴: 履歴の形式が不正');
 keys(input,['schemaVersion','introducedYear','legacyUntracked','events']);
 if(input.schemaVersion!==1||!nat(input.introducedYear)||
  typeof input.legacyUntracked!=='boolean'||!Array.isArray(input.events)||
  Number(input.introducedYear)>params.confirmedYear+1)err('履歴ヘッダーが不正');
 const history=input as unknown as PublicSpaceHistory;
 // 全確定イベントの出典を検査。過去画面を読むだけでは検査を省けない。
 let prefix:PublicSpaceHistory={...history,events:[]};
 for(const rawValue of history.events){
  const raw:unknown=rawValue;
  if(!object(raw))throw Error('公共空地履歴: イベント形式が不正');
  keys(raw,['year','seq','kind','spaceId','after','causeRecordId']);
  if(!nat(raw.year)||Number(raw.year)<history.introducedYear||Number(raw.year)>params.confirmedYear||
   !nat(raw.seq)||typeof raw.spaceId!=='string'||typeof raw.causeRecordId!=='string'||
   !validatePublicSpace(raw.after))err('確定イベント属性が不正');
  const event=raw as unknown as PublicSpaceEvent;
  const expected=event.kind==='established'?'public-space-established':
    event.kind==='overgrown'?'public-space-overgrown':'public-space-reused';
  if(!hasRecord(params.records,event.causeRecordId,event.year,expected,event.spaceId))
   err('出典イベントが不正');
  if(event.kind==='established'){
   const site=siteAt(params.sites,0,event.year);
   const housingView=housingAt(params.housing,event.year,'river-bank');
   if(!site)throw Error('公共空地履歴: 敷地と施設の観測が欠損');
   const gate=reviewPublicSpaceFoundation({
    siteIndex:0,year:event.year,candidate:event.after,
    buildings:site.buildings,housingBlocks:housingView.blocks,
    housingStatus:housingView.status,existing:publicSpacesAt(prefix,event.year).spaces,
    records:params.records,
   });
   if(gate.status==='hold')err('建設敷地の正本が不正: '+gate.reason);
  }
  prefix={...history,events:[...prefix.events,event]};
  publicSpacesAt(prefix,event.year);
 }
 // 放棄後も占有は継続。新たな住宅・施設が同じ敷地に重ならない。
 const latest=publicSpacesAt(history,params.confirmedYear).spaces;
 if(latest.length){
  const site=siteAt(params.sites,0,params.confirmedYear);
  const houses=housingAt(params.housing,params.confirmedYear,'river-bank');
  if(!site||houses.status!=='known')throw Error('公共空地履歴: 最終年の敷地記録が不明');
  for(const space of latest){
   if(site.buildings.some(b=>overlaps(space.footprint,existingGround(b)))||
    houses.blocks.some(b=>overlaps(space.footprint,b.footprint)))
    err('確定後の施設・住宅による公共空地の占有');
  }
 }
}
