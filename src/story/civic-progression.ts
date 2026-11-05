/**
 * H4-D4-B: 実際に記録された寄り合い・既存集会所・生活余力に基づく大型公共建築の提案。
 * 単なる都市分類・人口だけでは建設しない。候補は土地の正本ゲートを必ず通す。
 * この関数は読み取り専用で、イベントや施設は実際には追加しない。
 */
import {hash01} from '../engine/rng.js';
import type {HousingHistory} from './housing-history.js';
import {housingAt} from './housing-history.js';
import type {SettlementHistory} from './settlement-history.js';
import {siteAt} from './settlement-history.js';
import type {CivicBuilding,CivicConstructionRecord,CivicStyle} from './civic-architecture.js';
import {reviewCivicConstruction} from './civic-architecture.js';

export type CivicProposal=
 | {readonly status:'built';readonly candidate:CivicBuilding;readonly event:CivicConstructionRecord;
    readonly relatedIds:readonly string[]}
 | {readonly status:'hold';readonly reason:
    'unsupported-terrain'|'not-ready'|'unknown-history'|'no-hall'|
    'no-council'|'no-capacity'|'already-built'|'no-safe-plot'};
export function proposeCivicConstruction(input:{
 readonly siteIndex:number;readonly year:number;readonly seed:number;
 readonly history:SettlementHistory;readonly housing:HousingHistory;
 readonly population:number;readonly coverage:number;readonly shortageYears:number;
 readonly tradeYears:number;readonly recordId:string;
}):CivicProposal{
 const {siteIndex,year,seed,history,housing,population,coverage,shortageYears,tradeYears,recordId}=input;
 if(siteIndex!==0)return {status:'hold',reason:'unsupported-terrain'};
 if(!Number.isSafeInteger(year)||year<1||year%40!==0)return {status:'hold',reason:'not-ready'};
 // 旧セーブの追跡開始以前や一部不明な土地を「空き地」と推測しない。
 const inhabited=housingAt(housing,year,'river-bank');
 if(inhabited.status!=='known')return {status:'hold',reason:'unknown-history'};
 const site=siteAt(history,siteIndex,year);
 if(!site)return {status:'hold',reason:'unknown-history'};
 if(site.buildings.some(b=>b.civic))return {status:'hold',reason:'already-built'};
 const hall=site.buildings.find(b=>b.kind==='hall'&&b.condition==='intact'&&!b.civic);
 if(!hall)return {status:'hold',reason:'no-hall'};
 const now=site.practices.find(p=>p.kind==='council'&&p.active);
 const earlier=siteAt(history,siteIndex,year-24)?.practices.find(p=>
  p.kind==='council'&&p.active&&p.originId===now?.originId);
 if(!now||!earlier)return {status:'hold',reason:'no-council'};
 if(population<4500||coverage<.94||shortageYears>0||tradeYears<3)
  return {status:'hold',reason:'no-capacity'};
 const style:CivicStyle=hash01(seed,14,0)<.5?'great-hall':'courtyard-hall';
 const width=style==='great-hall'?44:56,depth=style==='great-hall'?22:30;
 // 候補帯は固定の河畔敷地座標。地区スケールによって座標を動かさない。
 // 検証済みの地表ゲートがすべての候補を拒否したら建てない。
 const slots=[
  [5,142],[65,140],[233,145],[5,107],[260,105],[65,105],
  [204,98],[5,120],[75,150],[244,95],[20,90],[82,94],
 ] as const;
 const offset=Math.floor(hash01(seed,year,3)*slots.length);
 const id='civic-river-bank-'+year+'-'+style;
 const event:CivicConstructionRecord={id:recordId,year,kind:'building-built',buildingId:id};
 for(let n=0;n<slots.length;n++){
  const [x,y]=slots[(n+offset)%slots.length]!;
  if(x+width>320||y+depth>180)continue;
  const candidate:CivicBuilding={
   id,kind:'hall',x:x+Math.floor(width/2),y:y+depth-5,builtYear:year,
   condition:'intact',recordId,civic:{
    architectureStyle:style,footprint:{x,y,width,depth},constructionRecordId:recordId,
   },
  };
  const result=reviewCivicConstruction({
   siteIndex,year,candidate,buildings:site.buildings,
   housingBlocks:inhabited.blocks,records:[event],
  });
  if(result.status==='clear')return {status:'built',candidate,event,
   relatedIds:[now.recordId,earlier.recordId,hall.recordId].filter((id):id is string=>Boolean(id))};
 }
 return {status:'hold',reason:'no-safe-plot'};
}
