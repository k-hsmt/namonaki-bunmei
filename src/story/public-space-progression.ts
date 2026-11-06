/** D7-B: 共同空地の自然成立・利用の提案。確定・乱数消費は行わない。 */
import {hash01} from '../engine/rng.js';
import {existingGround,isUnoccupiedGround} from '../scene/housing-ground.js';
import {housingAt,type HousingHistory,type HousingPlot} from './housing-history.js';
import {siteAt,type SettlementHistory} from './settlement-history.js';
import {publicSpacesAt,reviewPublicSpaceFoundation,type PublicSpace,
 type PublicSpaceHistory,type PublicSpaceRecord} from './public-space-history.js';

export interface PublicSpaceProgressionInput {
 readonly year:number;readonly siteIndex:number;readonly seed:number;
 readonly spaces:PublicSpaceHistory|undefined;readonly housing:HousingHistory;
 readonly sites:SettlementHistory;readonly population:number;
 readonly coverage:readonly number[];readonly shortageYears:number;
 readonly recordId:string;readonly shortageRecordId?:string;
}
export type PublicSpaceProposal=
 |{readonly status:'hold';readonly reason:'unsupported-terrain'|'unknown-history'|
   'not-ready'|'no-council'|'no-capacity'|'no-hall'|'no-housing'|'no-safe-plot'}
 |{readonly status:'established'|'overgrown'|'reused';readonly space:PublicSpace;
   readonly reason:'shared-use'|'practice-lost'|'anchor-unavailable'|'homes-vacant'|'prolonged-shortage'|'use-returned';
   readonly relatedIds:readonly string[]};
const distance=(a:HousingPlot,b:HousingPlot)=>
 Math.abs(a.x+a.width/2-b.x-b.width/2)+Math.abs(a.y+a.depth/2-b.y-b.depth/2);

export function proposePublicSpaceProgression(input:PublicSpaceProgressionInput):PublicSpaceProposal{
 const {year,siteIndex,seed,spaces,housing,sites,population,coverage,shortageYears,recordId}=input;
 if(!Number.isSafeInteger(year)||year<0||!Number.isSafeInteger(population)||population<0||
  !Number.isSafeInteger(shortageYears)||shortageYears<0||
  coverage.some(n=>!Number.isFinite(n)||n<0||n>1))throw Error('公共空地の自然進行入力が不正');
 const hold=(reason:Extract<PublicSpaceProposal,{status:'hold'}>['reason']):PublicSpaceProposal=>({status:'hold',reason});
 if(siteIndex!==0)return hold('unsupported-terrain');
 const view=publicSpacesAt(spaces,year),homes=housingAt(housing,year,'river-bank');
 if(!spaces||view.status!=='known'||homes.status!=='known')return hold('unknown-history');
 const site=siteAt(sites,0,year);
 if(!site)return hold('unknown-history');
 // 観測年を固定して読む。未来に加わった変更を参照しない。
 const years=(start:number)=>Array.from({length:year-start+1},(_,i)=>start+i);
 const council=site.practices.find(p=>p.kind==='council'&&p.active);
 const councilSince=(start:number)=>start>=spaces.introducedYear&&Boolean(council)&&
  years(start).every(y=>siteAt(sites,0,y)?.practices.some(p=>
   p.kind==='council'&&p.active&&p.originId===council!.originId));
 const healthySince=(id:string,start:number)=>start>=spaces.introducedYear&&
  years(start).every(y=>siteAt(sites,0,y)?.buildings.some(b=>b.id===id&&b.condition==='intact'));
 const usedHomes=homes.blocks.filter(b=>b.condition!=='ruined'&&b.use!=='vacant');
 const capacity=population>=900&&shortageYears===0&&coverage.length>=5&&coverage.slice(-5).every(c=>c>=.92);
 const established=view.spaces.find(p=>p.kind==='assembly-ground');
 const result=(status:'established'|'overgrown'|'reused',space:PublicSpace,
  reason:Exclude<PublicSpaceProposal,{status:'hold'}>['reason'],ids:readonly (string|undefined)[]):PublicSpaceProposal=>
  ({status,space,reason,relatedIds:[...new Set(ids.filter((id):id is string=>Boolean(id)))]});
 if(established){
  const last=spaces.events.filter(e=>e.spaceId===established.id&&e.year<=year).at(-1)!;
  if(year-last.year<8)return hold('not-ready');
  const anchor=site.buildings.find(b=>b.id===established.anchorBuildingId);
  if(established.condition==='used'){
   // 一年の不調で草地へ切り替えない。同じ不成立条件の8年継続を要求。
   const window=years(year-7);
   if(window.every(y=>!siteAt(sites,0,y)?.practices.some(p=>p.kind==='council'&&p.active)))
    return result('overgrown',established,'practice-lost',[
     last.causeRecordId,site.practices.find(p=>p.kind==='council')?.recordId]);
   if(window.every(y=>!siteAt(sites,0,y)?.buildings.some(b=>b.id===established.anchorBuildingId&&b.condition==='intact')))
    return result('overgrown',established,'anchor-unavailable',[last.causeRecordId,anchor?.recordId]);
   if(window.every(y=>!housingAt(housing,y,'river-bank').blocks.some(b=>b.condition!=='ruined'&&b.use!=='vacant')))
    return result('overgrown',established,'homes-vacant',[last.causeRecordId]);
   if(shortageYears>=8&&coverage.at(-1)!<.85)
    return result('overgrown',established,'prolonged-shortage',[last.causeRecordId,input.shortageRecordId]);
   return hold('not-ready');
  }
  if(!councilSince(year-16))return hold('no-council');
  if(!anchor||!healthySince(anchor.id,year-16))return hold('no-hall');
  if(!capacity)return hold('no-capacity');
  if(!usedHomes.some(b=>distance(b.footprint,established.footprint)<=80))return hold('no-housing');
  return result('reused',established,'use-returned',[last.causeRecordId,council?.recordId,anchor.recordId]);
 }
 // 一地点一つの寄り合いの空地。市の土間は本工程で自然成立させない。
 if(year===0||year%20!==0)return hold('not-ready');
 if(!councilSince(year-16))return hold('no-council');
 if(!capacity)return hold('no-capacity');
 if(!usedHomes.length)return hold('no-housing');
 const halls=site.buildings.filter(b=>b.kind==='hall'&&!b.civic&&b.condition==='intact'&&healthySince(b.id,year-16));
 if(!halls.length)return hold('no-hall');
 const candidates:{space:PublicSpace;score:number;relatedIds:(string|undefined)[]}[]=[];
 for(const anchor of halls){
  const ground=existingGround(anchor);
  // 施設の外側に接する候補のみ。空地と集会所の間に川や建築を挟まない。
  const plots:HousingPlot[]=[];
  for(const offset of [-16,-8,0,8,16]){
   plots.push({x:ground.x+offset,y:ground.y-12,width:24,depth:10});
   plots.push({x:ground.x+offset,y:ground.y+ground.depth+2,width:24,depth:10});
   plots.push({x:ground.x-26,y:ground.y+offset,width:24,depth:10});
   plots.push({x:ground.x+ground.width+2,y:ground.y+offset,width:24,depth:10});
  }
  for(const footprint of plots){
   const nearest=[...usedHomes].sort((a,b)=>distance(a.footprint,footprint)-distance(b.footprint,footprint)||a.blockId.localeCompare(b.blockId))[0]!;
   if(distance(nearest.footprint,footprint)>80)continue;
   // 両敷地の間の2pxの通り口を検査。道路の史実や通行量は生成しない。
   const left=Math.max(ground.x,footprint.x),right=Math.min(ground.x+ground.width,footprint.x+footprint.width);
   const top=Math.max(ground.y,footprint.y),bottom=Math.min(ground.y+ground.depth,footprint.y+footprint.depth);
   const passage=right-left>=2
    ?{x:left,y:Math.min(ground.y+ground.depth,footprint.y+footprint.depth),width:2,
      depth:Math.max(ground.y,footprint.y)-Math.min(ground.y+ground.depth,footprint.y+footprint.depth)}
    :bottom-top>=2?{x:Math.min(ground.x+ground.width,footprint.x+footprint.width),y:top,
      width:Math.max(ground.x,footprint.x)-Math.min(ground.x+ground.width,footprint.x+footprint.width),depth:2}:null;
   if(!passage||!isUnoccupiedGround(passage,[...homes.blocks.map(b=>b.footprint),...view.spaces.map(p=>p.footprint)],site.buildings,0))continue;
   const id='public-river-bank-assembly-'+year;
   const space:PublicSpace={id,siteId:'river-bank',kind:'assembly-ground',footprint,
    establishedYear:year,anchorBuildingId:anchor.id,foundationRecordId:recordId,condition:'used'};
   const record:PublicSpaceRecord={id:recordId,year,kind:'public-space-established',publicSpaceId:id};
   if(reviewPublicSpaceFoundation({siteIndex:0,year,candidate:space,buildings:site.buildings,
    housingBlocks:homes.blocks,existing:view.spaces,records:[record],housingStatus:homes.status}).status!=='clear')continue;
   const source=housing.events.find(e=>e.blockId===nearest.blockId&&e.kind==='built');
   candidates.push({space,score:distance(ground,footprint)+distance(nearest.footprint,footprint)*.4+
    hash01(seed,year,footprint.x*181+footprint.y)*2,
    relatedIds:[council?.recordId,anchor.recordId,source?.causeRecordId]});
  }
 }
 candidates.sort((a,b)=>a.score-b.score||a.space.footprint.y-b.space.footprint.y||a.space.footprint.x-b.space.footprint.x);
 const best=candidates[0];
 return best?result('established',best.space,'shared-use',best.relatedIds):hold('no-safe-plot');
}
