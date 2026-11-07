/** D3-B assembly-ground stage. Explicit generated dispatch; no live save writer. */
import {withGeneratedBridgeAccess} from './generated-bridge-history-review.js';
import type {RecordSite} from '../terrain/terrain-record-types.js';
import type {ValidatedTerrainRecord} from '../terrain/terrain-record.js';
import {decodeRecordPhysics} from '../terrain/terrain-record-raster-v1.js';
import {groundContextWindows,groundDistances,reviewGroundAccess,southEntrance,type GroundPlot} from '../terrain/ground-access-review.js';
import {selectReviewReservations,type ReservationReviewMode,type TypedGroundOccupation} from '../terrain/facility-plan-review.js';
import {terrainHash} from '../terrain/terrain-hash-v1.js';
import {publicSpacesAt,type PublicSpace,type PublicSpaceHistory,type PublicSpaceEvent} from './public-space-history.js';
import {housingAt} from './housing-history.js';
import {siteAt} from './settlement-history.js';
import {existingGround} from '../scene/housing-ground.js';
import {createGeneratedCivicExtension,createGeneratedCivicReview} from './generated-civic-review.js';
import {advanceGeneratedFacilityReview,chooseGeneratedFacilityReview,type GeneratedFacilityReview,type GeneratedLandReviewExtension} from './generated-facility-review.js';
import {lastObservedYear,type RecordEntry} from './engine.js';
import {siteNames} from './society.js';
import {validateCivicLedger} from './civic-architecture.js';
import {readOwnedGeneratedHousing} from './generated-housing-review.js';
const sites:readonly RecordSite[]=['river-bank','hill-side','coast-inlet'];
const at=(h:PublicSpaceHistory|undefined,year:number)=>publicSpacesAt(h,year,'generated-review-only');
const overlap=(a:GroundPlot,b:GroundPlot)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.depth&&a.y+a.depth>b.y;
function spaces(review:GeneratedFacilityReview,year:number){
 const h=review.state.publicSpaces;if(!h||h.introducedYear!==0||h.legacyUntracked)throw Error('Generated public space requires known year-zero history');
 const view=at(h,year);if(view.status!=='known')throw Error('Unknown public-space occupancy');return view.spaces;
}
const spaceOccupancy:GeneratedLandReviewExtension['additionalOccupancy']=(r,s,site)=>spaces(r,s.year).filter(p=>p.siteId===site).map(p=>({id:p.id,kind:'public-space',plot:p.footprint,entrance:southEntrance(p.footprint)}));
function context(review:GeneratedFacilityReview,site:RecordSite,year:number,prefix:PublicSpaceHistory){
 const homes=housingAt(review.state.housing,year,site);if(homes.status!=='known')throw Error('Unknown housing occupancy');
 const occupancy:TypedGroundOccupation[]=[...review.placements.filter(p=>p.site===site&&p.builtYear<=year).map(p=>({id:p.objectId,kind:p.kind,plot:p.plot,entrance:p.entrance})),
  ...homes.blocks.map(b=>({id:b.blockId,kind:'housing' as const,plot:b.footprint,entrance:southEntrance(b.footprint)})),
  ...at(prefix,year).spaces.filter(p=>p.siteId===site).map(p=>({id:p.id,kind:'public-space' as const,plot:p.footprint,entrance:southEntrance(p.footprint)}))];
 return withGeneratedBridgeAccess(review,{terrain:review.terrain,site,year,confirmedYear:year,historyStatus:'known' as const,primaryRoot:review.plans[site].primaryRoot,occupancy,
  reservations:selectReviewReservations(review.plans[site],review.reservationMode,new Set(occupancy.map(p=>p.id)))});
}
function nearestHomes(review:GeneratedFacilityReview,space:PublicSpace,year:number,prefix:PublicSpaceHistory){
 const ctx=context(review,space.siteId,year,prefix),homes=housingAt(review.state.housing,year,space.siteId).blocks.filter(b=>b.condition!=='ruined'&&b.use!=='vacant');
 const r=decodeRecordPhysics(review.terrain.sites[space.siteId].physics),windows=groundContextWindows(r,ctx,[space.footprint]);
 const entry=southEntrance(space.footprint),distances=groundDistances(windows,entry);
 const ranked=homes.map(b=>{const p=southEntrance(b.footprint),d=distances[p[1]*320+p[0]];return {b,d:d===undefined||d<0?Infinity:d};})
  .sort((a,b)=>a.d-b.d||(a.b.blockId<b.b.blockId?-1:a.b.blockId>b.b.blockId?1:0));
 return {ctx,windows,entry,distances,distance:ranked[0]?.d??Infinity,nearest:ranked[0]?.b,homes};
}
function passage(ground:GroundPlot,plot:GroundPlot):GroundPlot|null {
 const left=Math.max(ground.x,plot.x),right=Math.min(ground.x+ground.width,plot.x+plot.width),top=Math.max(ground.y,plot.y),bottom=Math.min(ground.y+ground.depth,plot.y+plot.depth);
 if(right-left>=2&&plot.y>=ground.y+ground.depth)return {x:left,y:ground.y+ground.depth,width:2,depth:plot.y-ground.y-ground.depth};
 if(bottom-top>=2&&plot.x+plot.width<=ground.x)return {x:plot.x+plot.width,y:top,width:ground.x-plot.x-plot.width,depth:2};
 if(bottom-top>=2&&plot.x>=ground.x+ground.width)return {x:ground.x+ground.width,y:top,width:plot.x-ground.x-ground.width,depth:2};
 return null;
}
function passageClear(review:GeneratedFacilityReview,space:PublicSpace,ground:GroundPlot,ctx:ReturnType<typeof context>){
 const p=passage(ground,space.footprint);if(!p||p.width<2||p.depth<2||p.x<0||p.y<96||p.x+p.width>320||p.y+p.depth>180)return false;
 if(ctx.occupancy.some(o=>overlap(p,o.plot)))return false;
 const r=decodeRecordPhysics(review.terrain.sites[space.siteId].physics);
 for(let y=p.y;y<p.y+p.depth;y++)for(let x=p.x;x<p.x+p.width;x++){const i=y*320+x;if(r.surface[i]!==1||r.grade[i]!>1||r.bearing[i]!==0)return false;}
 return true;
}
function waterPenalty(review:GeneratedFacilityReview,space:PublicSpace){
 const p=space.footprint,r=decodeRecordPhysics(review.terrain.sites[space.siteId].physics);let distance=8;
 for(let y=Math.max(96,p.y-7);y<Math.min(180,p.y+p.depth+7);y++)for(let x=Math.max(0,p.x-7);x<Math.min(320,p.x+p.width+7);x++){
  const i=y*320+x;if(r.surface[i]!==2&&r.surface[i]!==3)continue;
  const dx=x<p.x?p.x-x:x>=p.x+p.width?x-p.x-p.width+1:0,dy=y<p.y?p.y-y:y>=p.y+p.depth?y-p.y-p.depth+1:0;distance=Math.min(distance,dx+dy);
 }return Math.max(0,8-distance)*4;
}
type Reason='shared-use'|'practice-lost'|'anchor-unavailable'|'homes-vacant'|'prolonged-shortage'|'use-returned';
export function proposeGeneratedPublicSpace(review:GeneratedFacilityReview,index:number,readHomes:typeof housingAt=housingAt){
 const state=review.state,year=state.year,siteId=sites[index],hold=(reason:string)=>({status:'hold' as const,reason});
 if(!siteId)return hold('unsupported-terrain');
 const all=spaces(review,year),homes=readHomes(state.housing,year,siteId);if(homes.status!=='known')return hold('unknown-history');
 const history=state.observation?.sites,site=siteAt(history,index,year);if(!site||!history)return hold('unknown-history');
 const prefix=state.publicSpaces!,council=site.practices.find(p=>p.kind==='council'&&p.active),used=homes.blocks.filter(b=>b.condition!=='ruined'&&b.use!=='vacant');
 const years=(start:number)=>Array.from({length:year-start+1},(_,n)=>start+n);
 const councilSince=(start:number)=>start>=0&&Boolean(council)&&years(start).every(y=>siteAt(history,index,y)?.practices.some(p=>p.kind==='council'&&p.active&&p.originId===council!.originId));
 const healthySince=(id:string,start:number)=>start>=0&&years(start).every(y=>siteAt(history,index,y)?.buildings.some(b=>b.id===id&&b.condition==='intact'));
 const d=state.economy?.districts[index],coverage=d?.coverage??[],capacity=(state.observation!.people[index]??0)>=900&&d?.shortageYears===0&&coverage.length>=5&&coverage.slice(-5).every(c=>c>=.92);
 const existing=all.find(p=>p.siteId===siteId&&p.kind==='assembly-ground');
 const proposed=(status:'established'|'overgrown'|'reused',space:PublicSpace,reason:Reason,related:readonly (string|undefined)[])=>
  ({status,space,reason,relatedIds:[...new Set(related.filter((id):id is string=>Boolean(id)))]});
 if(existing){
  const last=prefix.events.filter(e=>e.spaceId===existing.id&&e.year<=year).at(-1)!;if(year-last.year<8)return hold('not-ready');
  const anchor=site.buildings.find(b=>b.id===existing.anchorBuildingId);
  if(existing.condition==='used'){
   const window=years(year-7),after={...existing,condition:'overgrown' as const};
   if(!council&&window.every(y=>!siteAt(history,index,y)?.practices.some(p=>p.kind==='council'&&p.active)))return proposed('overgrown',after,'practice-lost',[last.causeRecordId,site.practices.find(p=>p.kind==='council')?.recordId]);
   if(anchor?.condition!=='intact'&&window.every(y=>!siteAt(history,index,y)?.buildings.some(b=>b.id===existing.anchorBuildingId&&b.condition==='intact')))return proposed('overgrown',after,'anchor-unavailable',[last.causeRecordId,anchor?.recordId]);
   if(!used.length&&window.every(y=>!housingAt(state.housing,y,siteId).blocks.some(b=>b.condition!=='ruined'&&b.use!=='vacant')))return proposed('overgrown',after,'homes-vacant',[last.causeRecordId]);
   if((d?.shortageYears??0)>=8&&(coverage.at(-1)??1)<.85)return proposed('overgrown',after,'prolonged-shortage',[last.causeRecordId,d?.shortageRecord??undefined]);
   return hold('not-ready');
  }
  if(!councilSince(year-16))return hold('no-council');
  if(!anchor||!healthySince(anchor.id,year-16))return hold('no-hall');
  if(!capacity)return hold('no-capacity');
  if(nearestHomes(review,existing,year,prefix).distance>80)return hold('no-housing');
  return proposed('reused',{...existing,condition:'used'},'use-returned',[last.causeRecordId,council?.recordId,anchor.recordId]);
 }
 if(year===0||year%20!==0)return hold('not-ready');
 if(!councilSince(year-16))return hold('no-council');
 if(!capacity)return hold('no-capacity');if(!used.length)return hold('no-housing');
 const halls=site.buildings.filter(b=>b.kind==='hall'&&!b.civic&&b.condition==='intact'&&healthySince(b.id,year-16));if(!halls.length)return hold('no-hall');
 const candidates:{space:PublicSpace;score:number;related:(string|undefined)[]}[]=[];
 for(const anchor of halls){
  const ground=existingGround(anchor),plots:GroundPlot[]=[];
  for(const offset of [-16,-8,0,8,16]){
   plots.push({x:ground.x+offset,y:Math.ceil((ground.y+ground.depth+2)/2)*2,width:24,depth:10});
   if(offset>=0)plots.push({x:ground.x-26,y:ground.y+offset,width:24,depth:10},{x:ground.x+ground.width+2,y:ground.y+offset,width:24,depth:10});
  }
  for(const footprint of plots){
   const space:PublicSpace={id:'public-'+siteId+'-assembly-'+year,siteId,kind:'assembly-ground',footprint,establishedYear:year,anchorBuildingId:anchor.id,foundationRecordId:year+'-'+state.history.length,condition:'used'};
   const ctx=context(review,siteId,year,prefix),gate=reviewGroundAccess(ctx,'public-space',space.id,footprint);if(gate.status!=='clear'||!passageClear(review,space,ground,ctx))continue;
   const near=nearestHomes(review,space,year,prefix);if(near.distance>80)continue;
   // The already computed entry field gives the same undirected distances as
   // separate hall/core fields queried at the entry.
   const hall=southEntrance(ground),core=review.plans[siteId].nucleus;
   const hallDistance=near.distances[hall[1]*320+hall[0]]!,coreDistance=near.distances[core[1]*320+core[0]]!;
   if(hallDistance<0||coreDistance<0)continue;
   const score=4*coreDistance+3*hallDistance+waterPenalty(review,space)+Math.max(0,footprint.y-150)*2+terrainHash(['public-space-review-v1',state.seed,siteId,space.id,footprint.x,footprint.y])%4;
   const homeSource=state.housing!.events.find(e=>e.kind==='built'&&e.blockId===near.nearest?.blockId)?.causeRecordId;
   candidates.push({space,score,related:[council?.recordId,anchor.recordId,homeSource]});
  }
 }
 candidates.sort((a,b)=>a.score-b.score||a.space.footprint.y-b.space.footprint.y||a.space.footprint.x-b.space.footprint.x);
 const best=candidates[0];return best?proposed('established',best.space,'shared-use',best.related):hold('no-safe-plot');
}
export function validateGeneratedPublicSpaceLedger(review:GeneratedFacilityReview,confirmedYear:number){
 validateCivicLedger(review.state.observation?.sites,review.state.history,confirmedYear,'generated-review-only');
 const h=review.state.publicSpaces;spaces(review,confirmedYear);if(!h)return;
 if(Object.keys(h).some(k=>!['schemaVersion','introducedYear','legacyUntracked','events'].includes(k)))throw Error('Unknown public-space header');
 const records=new Map<string,RecordEntry>();for(const r of review.state.history){if(records.has(r.id))throw Error('Duplicate source record');records.set(r.id,r);}
 let prefix:PublicSpaceHistory={...h,events:[]};
 for(const e of h.events){
  if(e.year>confirmedYear||Object.keys(e).some(k=>!['year','seq','kind','spaceId','after','causeRecordId'].includes(k)))throw Error('Invalid public-space event');
  const source=records.get(e.causeRecordId);if(!source||source.year!==e.year||source.kind!=='public-space-'+e.kind||source.publicSpaceId!==e.spaceId)throw Error('Invalid public-space source');
  if(e.kind==='established'){
   const p=e.after,index=sites.indexOf(p.siteId),anchor=siteAt(review.state.observation?.sites,index,e.year)?.buildings.find(b=>b.id===p.anchorBuildingId);
   if(p.kind!=='assembly-ground'||p.id!=='public-'+p.siteId+'-assembly-'+e.year||!anchor||anchor.kind!=='hall'||anchor.civic||anchor.condition!=='intact')throw Error('Invalid public-space anchor');
   if(p.footprint.width!==24||p.footprint.depth!==10||p.footprint.x%2!==0||p.footprint.y%2!==0)throw Error('Invalid generated public-space grid or size');
   const ctx=context(review,p.siteId,e.year,prefix);
   if(reviewGroundAccess(ctx,'public-space',p.id,p.footprint).status!=='clear'||!passageClear(review,p,existingGround(anchor),ctx)||nearestHomes(review,p,e.year,prefix).distance>80)throw Error('Invalid public-space foundation');
  }
  prefix={...prefix,events:[...prefix.events,e]};at(prefix,e.year);
 }
}
const civic=createGeneratedCivicExtension(spaceOccupancy);
export const generatedPublicSpaceExtension:GeneratedLandReviewExtension={additionalOccupancy:civic.additionalOccupancy,afterFacilities(review,state){
 civic.afterFacilities(review,state);
 for(let i=0;i<sites.length;i++){
  const result=proposeGeneratedPublicSpace(review,i,readOwnedGeneratedHousing);
  if(result.status==='hold'){if(result.reason!=='not-ready'){const h=review.diagnostics.holds as Record<string,number>,key=sites[i]+':public-space:'+result.reason;h[key]=(h[key]??0)+1;}continue;}
  const reasons:Record<Reason,string>={'shared-use':'寄り合いと集会所の利用、近隣の住まい、維持の余力が続いた','practice-lost':'寄り合いの担い手が途絶えた状態が8年続いた',
   'anchor-unavailable':'集会所を使えない状態が8年続いた','homes-vacant':'利用中の住宅街区がない状態が8年続いた','prolonged-shortage':'食糧不足が8年以上続き、維持余力が失われた','use-returned':'寄り合いと集会所、住まいと維持の余力が回復した'};
  const cause:RecordEntry={id:state.year+'-'+state.history.length,year:state.year,tag:'地域',kind:'public-space-'+result.status,publicSpaceId:result.space.id,important:true,
   title:siteNames[i]+'の寄り合いの空地が'+(result.status==='established'?'定められる':result.status==='overgrown'?'草に覆われ始める':'再び使われる'),body:reasons[result.reason]+'。土地の位置と、それまでの記録は残されている。',causes:[reasons[result.reason]],relatedIds:result.relatedIds};
  const history=state.publicSpaces!,last=history.events.at(-1),event:PublicSpaceEvent={year:state.year,seq:last?.year===state.year?last.seq+1:0,kind:result.status,spaceId:result.space.id,after:result.space,causeRecordId:cause.id};
  const next={...history,events:[...history.events,event]};at(next,state.year);state.history.push(cause);state.publicSpaces=next;
 }
}};
export interface GeneratedPublicSpaceReview {readonly format:'generated-public-space-review';readonly status:'review-only';readonly review:GeneratedFacilityReview}
export function createGeneratedPublicSpaceReview(terrain:ValidatedTerrainRecord,mode:ReservationReviewMode):GeneratedPublicSpaceReview|{status:'hold';reason:string}{
 const parent=createGeneratedCivicReview(terrain,mode);return parent.status==='hold'?parent:{format:'generated-public-space-review',status:'review-only',review:parent.review};
}
export function advanceGeneratedPublicSpaceReview(input:GeneratedPublicSpaceReview,years:number,choices:'stop'|'automatic'='stop'):GeneratedPublicSpaceReview {
 if(input.format!=='generated-public-space-review'||input.status!=='review-only')throw Error('Invalid public-space review boundary');
 const review=advanceGeneratedFacilityReview(input.review,years,choices,generatedPublicSpaceExtension);validateGeneratedPublicSpaceLedger(review,lastObservedYear(review.state));return {...input,review};
}
export function chooseGeneratedPublicSpaceReview(input:GeneratedPublicSpaceReview,index:number):GeneratedPublicSpaceReview {
 if(input.format!=='generated-public-space-review'||input.status!=='review-only')throw Error('Invalid public-space review boundary');
 const review=chooseGeneratedFacilityReview(input.review,index,'manual',generatedPublicSpaceExtension);validateGeneratedPublicSpaceLedger(review,lastObservedYear(review.state));return {...input,review};
}
