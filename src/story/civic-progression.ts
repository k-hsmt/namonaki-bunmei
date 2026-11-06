/**
 * H4-D4-B: 実際に記録された寄り合い・既存集会所・生活余力に基づく大型公共建築の提案。
 * 単なる都市分類・人口だけでは建設しない。候補は土地の正本ゲートを必ず通す。
 * この関数は読み取り専用で、イベントや施設は実際には追加しない。
 */
import {hash01} from '../engine/rng.js';
import type {HousingHistory} from './housing-history.js';
import {housingAt} from './housing-history.js';
import type {SettlementHistory} from './settlement-history.js';
import {siteAt,fixedFacilityLotReservations} from './settlement-history.js';
import type {CivicBuilding,CivicConstructionRecord,CivicStyle} from './civic-architecture.js';
import {reviewCivicConstruction} from './civic-architecture.js';
import {existingGround} from '../scene/housing-ground.js';

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
 const hall=site.buildings.find(b=>b.kind==='hall'&&b.condition==='intact'&&!b.civic&&b.builtYear<=year-24);
 if(!hall)return {status:'hold',reason:'no-hall'};
 const now=site.practices.find(p=>p.kind==='council'&&p.active);
 const earlier=siteAt(history,siteIndex,year-24)?.practices.find(p=>
  p.kind==='council'&&p.active&&p.originId===now?.originId);
 // 両端で寄り合いが有効でも、途中で途絶えれば「24年間の継続」ではない。
 const uninterrupted=history[siteIndex]?.practiceChanges
  .filter(change=>change.year>year-24&&change.year<=year)
  .every(change=>change.practices.some(p=>
   p.kind==='council'&&p.active&&p.originId===now?.originId));
 if(!now||!earlier||!uninterrupted)return {status:'hold',reason:'no-council'};
 if(population<4500||coverage<.94||shortageYears>0||tradeYears<3)
  return {status:'hold',reason:'no-capacity'};
 const style:CivicStyle=hash01(seed,14,0)<.5?'great-hall':'courtyard-hall';
 const width=style==='great-hall'?44:56,depth=style==='great-hall'?22:30;
 // H4-D5: 左手前の「最初に空いていた固定区画」へ偏らないよう、
 // 両岸の地表を走査し、履歴上のhall・住宅群との関係で合法候補を評価する。
 // 画面内の見栄えだけで敷地を許可せず、必ずD4-Aの物理ゲートを通す。
 const id='civic-river-bank-'+year+'-'+style;
 const event:CivicConstructionRecord={id:recordId,year,kind:'building-built',buildingId:id};
 const candidates:{candidate:CivicBuilding;score:number}[]=[];
 // 固定区画方式の将来の使用箇所を、物理的な予約地として保護する。
 // ここにはまだ建物がない場合もある。確定施設として描画・保存はしない。
 const reserved=fixedFacilityLotReservations(siteIndex).map(lot=>
  existingGround({...lot,builtYear:0,condition:'intact'}));
 const overlaps=(a:{x:number;y:number;width:number;depth:number},
  b:{x:number;y:number;width:number;depth:number})=>
  a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.depth&&b.y<a.y+a.depth;
 const center=(x:number,y:number)=>({x,y});
 const neighbors=inhabited.blocks.map(b=>center(
  b.footprint.x+b.footprint.width/2,b.footprint.y+b.footprint.depth/2));
 const d=(a:{x:number;y:number},b:{x:number;y:number})=>
  Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
 for(const y of [112,124,136,148]){
  for(const x of [6,22,38,54,70,86,102,208,224,240,256,272]){
   if(x+width>320||y+depth>180)continue;
   const candidate:CivicBuilding={
    id,kind:'hall',x:x+Math.floor(width/2),y:y+depth-5,builtYear:year,
    condition:'intact',recordId,civic:{
     architectureStyle:style,footprint:{x,y,width,depth},constructionRecordId:recordId,
    },
   };
   if(reserved.some(plot=>overlaps(candidate.civic.footprint,plot)))continue;
   const gate=reviewCivicConstruction({
    siteIndex,year,candidate,buildings:site.buildings,
    housingBlocks:inhabited.blocks,records:[event],
   });
   if(gate.status!=='clear')continue;
   const position=center(candidate.x,candidate.y);
   const hallDistance=d(position,center(hall.x,hall.y));
   const residenceDistance=neighbors.length
    ?Math.min(...neighbors.map(n=>d(position,n))):80;
   // 集会所への接続と住宅の近さを基本とし、手前へ出過ぎる場所には
   // 弱いペナルティ。seedは同程度の候補の選択にだけ影響する。
   const urbanFit=hallDistance*.25+residenceDistance*.45+
    Math.max(0,y-132)*.65;
   const tie=hash01(seed,year,Math.imul(x+1,131)+(y+1))*12;
   candidates.push({candidate,score:urbanFit+tie});
  }
 }
 candidates.sort((a,b)=>a.score-b.score||
  a.candidate.civic.footprint.y-b.candidate.civic.footprint.y||
  a.candidate.civic.footprint.x-b.candidate.civic.footprint.x);
 const best=candidates[0]?.candidate;
 if(!best)return {status:'hold',reason:'no-safe-plot'};
 return {status:'built',candidate:best,event,
  relatedIds:[now.recordId,earlier.recordId,hall.recordId].filter((id):id is string=>Boolean(id))};
}
