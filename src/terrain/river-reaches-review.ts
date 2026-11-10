/** D3-C saved river ownership, linked to frozen D2 polygons and declared ports.
 * Pure result verifier: no generator, RNG, story, DOM, or storage dependency.
 */
import {assertResolvedTerrain,type TerrainPhysicalSource} from './terrain-revision-v1.js';
import {decodeRecordPhysics,rasterizeRecordShapes} from './terrain-record-raster-v1.js';
export interface RiverReach {
 readonly parentShapeId:string;readonly streamId:string;
 /** Half-open row interval over the saved source polygon. */
 readonly fromY:number;readonly toY:number;
}
export interface RiverJunction {readonly y:number;readonly kind:'split'|'merge';readonly upstream:number;readonly downstream:number}
export interface RiverReachesReview {
 readonly format:'river-reaches-review';readonly schemaVersion:1;readonly status:'review-only';readonly ruleId:'river-reaches-v1';
 readonly source:{readonly seed:number;readonly revision:string};readonly siteId:'river-bank';
 readonly reaches:readonly RiverReach[];readonly junctions:readonly RiverJunction[];
}
declare const checked:unique symbol;
export type ValidatedRiverReaches=RiverReachesReview&{readonly [checked]:true};
function freeze<T>(x:T):T {if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
const fail=(message:string):never=>{throw Error('River reaches: '+message);};
function sourceData(t:TerrainPhysicalSource){
 if(t.format==='resolved-terrain-at-year')assertResolvedTerrain(t);
 const site=t.sites['river-bank'],raster=decodeRecordPhysics(site.physics),shapes=site.shapes.filter(s=>s.kind==='freshwater');
 const masks=new Map(shapes.map(s=>[s.id,rasterizeRecordShapes([s],false).surface]));
 const ports=t.geography.ports.filter(p=>p.site==='river-bank'&&p.visible&&p.point);
 const incoming=ports.filter(p=>p.flow==='in'),outgoing=ports.filter(p=>p.flow==='out');
 const counts:number[]=[];
 for(let y=95;y<180;y++){let count=0,on=false;for(let x=0;x<320;x++){const wet=raster.surface[y*320+x]===2;if(wet&&!on)count++;on=wet;}counts[y]=count;}
 const junctions:RiverJunction[]=[];
 for(let y=97;y<180;y++)if(counts[y]!==counts[y-1])junctions.push({y,kind:counts[y]!>counts[y-1]!? 'split':'merge',upstream:counts[y-1]!,downstream:counts[y]!});
 return {site,raster,shapes,masks,incoming,outgoing,counts,junctions};
}
/** Only the producer calls this; saved-world readers must require the descriptor. */
export function captureRiverReaches(t:TerrainPhysicalSource):ValidatedRiverReaches {
 const d=sourceData(t),reaches:RiverReach[]=[];
 const owner=(shapeId:string,ports:typeof d.incoming)=>{
  const matches=ports.filter(p=>{const [x,y]=p.point!;return d.masks.get(shapeId)![y*320+x]===2;});
  const ids=[...new Set(matches.map(p=>p.streamId))];if(ids.length!==1)return fail('source polygon does not identify one declared port');return ids[0]!;
 };
 if(d.site.variants.river==='confluence'){
  const split=d.junctions.find(j=>j.kind==='merge'&&j.downstream===1)?.y;if(split===undefined)return fail('missing confluence junction');
  if(d.incoming.length!==2||d.outgoing.length!==1)return fail('confluence ports');
  for(const s of d.shapes)reaches.push({parentShapeId:s.id,streamId:owner(s.id,d.incoming),fromY:95,toY:split},{parentShapeId:s.id,streamId:d.outgoing[0]!.streamId,fromY:split,toY:180});
 }else if(d.site.variants.river==='distributary'){
  const split=d.junctions.find(j=>j.kind==='split'&&j.upstream===1)?.y;if(split===undefined)return fail('missing distributary junction');
  if(d.incoming.length!==1||d.outgoing.length!==2)return fail('distributary ports');
  for(const s of d.shapes)reaches.push({parentShapeId:s.id,streamId:d.incoming[0]!.streamId,fromY:95,toY:split},{parentShapeId:s.id,streamId:owner(s.id,d.outgoing),fromY:split,toY:180});
 }else{
  const ids=[...new Set([...d.incoming,...d.outgoing].map(p=>p.streamId))];if(ids.length!==1)return fail('single-river ports');
  for(const s of d.shapes)reaches.push({parentShapeId:s.id,streamId:ids[0]!,fromY:95,toY:180});
 }
 return validateRiverReaches({format:'river-reaches-review',schemaVersion:1,status:'review-only',ruleId:'river-reaches-v1',source:{...t.source},siteId:'river-bank',reaches,junctions:d.junctions},t);
}
function record(v:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v))return fail('expected object');const o=v as Record<string,unknown>;
 if(Object.keys(o).length!==keys.length||keys.some(k=>!Object.hasOwn(o,k)))return fail('unknown/missing fields');return o;
}
/** Returns integer indices into the stable stream-ID list; -1 means not freshwater. */
function ownershipRaster(raw:RiverReachesReview,t:TerrainPhysicalSource){
 if(t.format==='resolved-terrain-at-year')assertResolvedTerrain(t);
 const d=sourceData(t),ids=[...new Set(t.geography.streams.map(s=>s.id))].sort(),owners=new Int16Array(57600);owners.fill(-1);
 for(const reach of raw.reaches){
  const mask=d.masks.get(reach.parentShapeId),owner=ids.indexOf(reach.streamId);if(!mask||owner<0)return fail('unknown parent or stream');
  for(let y=reach.fromY;y<reach.toY;y++)for(let x=0;x<320;x++){
   const i=y*320+x;if(d.raster.surface[i]!==2||mask[i]!==2)continue;
   if(owners[i]!==-1&&owners[i]!==owner)return fail('ambiguous ownership');owners[i]=owner;
  }
 }
 for(let i=0;i<57600;i++)if((d.raster.surface[i]===2)!==(owners[i]!==-1))return fail('freshwater coverage mismatch');
 for(const p of [...d.incoming,...d.outgoing]){const [x,y]=p.point!;if(ids[owners[y*320+x]!]!==p.streamId)return fail('port ownership mismatch');}
 return {owners,streamIds:ids};
}
export function riverOwnershipRaster(h:ValidatedRiverReaches,t:TerrainPhysicalSource){return ownershipRaster(h,t);}
/** Validate geometry and declared topology without ever generating a world from seed. */
export function validateRiverReaches(raw:unknown,t:TerrainPhysicalSource):ValidatedRiverReaches {
 const top=record(raw,['format','schemaVersion','status','ruleId','source','siteId','reaches','junctions']);
 if(top.format!=='river-reaches-review'||top.schemaVersion!==1||top.status!=='review-only'||top.ruleId!=='river-reaches-v1'||top.siteId!=='river-bank')return fail('unsupported format');
 const source=record(top.source,['seed','revision']);if(source.seed!==t.source.seed||source.revision!==t.source.revision)return fail('terrain provenance mismatch');
 if(!Array.isArray(top.reaches)||top.reaches.length<1||top.reaches.length>16||!Array.isArray(top.junctions)||top.junctions.length>84)return fail('array limits');
 const d=sourceData(t),ranges=new Map<string,{from:number;to:number}[]>();
 for(const value of top.reaches){const r=record(value,['parentShapeId','streamId','fromY','toY']);
  if(typeof r.parentShapeId!=='string'||!d.masks.has(r.parentShapeId)||typeof r.streamId!=='string'||!Number.isSafeInteger(r.fromY)||!Number.isSafeInteger(r.toY)||Number(r.fromY)<95||Number(r.toY)>180||Number(r.fromY)>=Number(r.toY))return fail('reach shape/range');
  const list=ranges.get(r.parentShapeId)??[];list.push({from:Number(r.fromY),to:Number(r.toY)});ranges.set(r.parentShapeId,list);
 }
 for(const s of d.shapes){const list=(ranges.get(s.id)??[]).sort((a,b)=>a.from-b.from);let y=95;for(const r of list){if(r.from!==y)return fail('parent partition overlap/gap');y=r.to;}if(y!==180)return fail('incomplete parent partition');}
 if(top.junctions.length!==d.junctions.length)return fail('junction count mismatch');
 for(let n=0;n<top.junctions.length;n++){const j=record(top.junctions[n],['y','kind','upstream','downstream']),expected=d.junctions[n]!;
  if(j.y!==expected.y||j.kind!==expected.kind||j.upstream!==expected.upstream||j.downstream!==expected.downstream)return fail('junction geometry mismatch');
 }
 const result=structuredClone(raw) as RiverReachesReview;
 ownershipRaster(result,t);
 // Ownership boundaries may only change at the saved physical fork/merge row.
 for(const [shapeId,list] of ranges){
  const sorted=list.sort((a,b)=>a.from-b.from);
  for(const r of sorted.slice(1))if(!d.junctions.some(j=>j.y===r.from))return fail('ownership changes away from a junction: '+shapeId);
 }
 return freeze(result) as ValidatedRiverReaches;
}
export function riverJunctionExcludes(h:ValidatedRiverReaches,fromY:number,toY:number):boolean {
 return h.junctions.some(j=>fromY<=j.y+8&&toY-1>=j.y-8);
}
