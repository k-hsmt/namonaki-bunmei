/** D4-A saved ground contract; no legacy river polygons or generator calls. */
import type {ValidatedTerrainRecord} from '../terrain/terrain-record.js';
import type {RecordSite} from '../terrain/terrain-record-types.js';
import type {GroundPlot,GroundPurpose} from '../terrain/ground-access-review.js';
import {reviewPhysicalPlot} from '../terrain/ground-access-review.js';
import {decodeRecordPhysics} from '../terrain/terrain-record-raster-v1.js';
import {bridgeOccupancy,type ValidatedBridgeGeometry} from '../terrain/bridge-geometry-review.js';
import type {ResidentialBlock} from '../story/housing-history.js';
import type {SiteSnapshot} from './model.js';
import {housingAt,type HousingHistory} from '../story/housing-history.js';
import {projectSceneComposition,type SceneComposition} from './composition.js';
export interface GeneratedSceneGround {
 readonly terrain:ValidatedTerrainRecord;readonly site:RecordSite;
 readonly facilities:readonly {readonly id:string;readonly purpose:GroundPurpose;readonly plot:GroundPlot}[];
 readonly bridges:readonly ValidatedBridgeGeometry[];
}
export function verifyGeneratedSceneGround(s:SiteSnapshot,homes:readonly ResidentialBlock[],ground:GeneratedSceneGround):void {
 if(ground.site!==(['river-bank','hill-side','coast-inlet'] as const)[s.local?.index??0])throw Error('Generated scene site mismatch');
 const r=decodeRecordPhysics(ground.terrain.sites[ground.site].physics),occupied:{id:string;plot:GroundPlot}[]=[],ids=new Set<string>();
 const add=(id:string,plot:GroundPlot,purpose?:GroundPurpose)=>{
  if(ids.has(id))throw Error('Duplicate generated scene object');ids.add(id);
  if(purpose&&reviewPhysicalPlot(r,purpose,plot).status!=='clear')throw Error('Generated scene object disagrees with saved ground');
  occupied.push({id,plot});
 };
 for(const o of s.objects){
  if(o.builtYear>s.year)throw Error('Future generated scene object');
  if(o.kind==='bridge'){
   const g=ground.bridges.find(b=>b.bridgeId===o.id);if(!g||ground.site!=='river-bank')throw Error('Missing generated scene bridge');
   if(o.x!==g.deck.x+Math.floor(g.deck.width/2)||o.y!==g.deck.y+2)throw Error('Bridge display anchor changed');
   // Its three internally overlapping parts are one occupied object.
   for(const part of bridgeOccupancy(g))occupied.push({id:o.id,plot:part.plot});
   if(ids.has(o.id))throw Error('Duplicate generated scene bridge');ids.add(o.id);continue;
  }
  const f=ground.facilities.find(p=>p.id===o.id);if(!f||f.purpose!==(o.civic?'civic':o.kind))throw Error('Unrecorded generated scene facility');
  const x=f.plot.x+Math.floor(f.plot.width/2),y=f.plot.y+f.plot.depth-(o.civic?5:3);
  if(o.x!==(o.kind==='field'?f.plot.x+13:x)||o.y!==(o.kind==='field'?f.plot.y+8:y))throw Error('Generated display anchor changed');
  if(o.civic&&JSON.stringify(o.civic.footprint)!==JSON.stringify(f.plot))throw Error('Civic display footprint changed');add(o.id,f.plot,f.purpose);
 }
 if(ground.facilities.length+ground.bridges.length!==s.objects.length)throw Error('Unused generated scene geometry');
 for(const b of homes){if(b.siteId!==ground.site||b.builtYear>s.year)throw Error('Invalid generated scene home');add(b.blockId,b.footprint,'housing');}
 for(const p of s.publicSpaces??[]){if(p.siteId!==ground.site||p.establishedYear>s.year)throw Error('Invalid generated scene public space');add(p.id,p.footprint,'public-space');}
 for(let i=0;i<occupied.length;i++)for(const q of occupied.slice(0,i)){
  const p=occupied[i]!;if(p.id===q.id)continue;
  if(p.plot.x<q.plot.x+q.plot.width&&p.plot.x+p.plot.width>q.plot.x&&p.plot.y<q.plot.y+q.plot.depth&&p.plot.y+p.plot.depth>q.plot.y)throw Error('Generated scene occupied plots overlap');
 }
}
export function composeGeneratedScene(s:SiteSnapshot,housing:HousingHistory|undefined,ground:GeneratedSceneGround):SceneComposition {
 const homes=housingAt(housing,s.year,ground.site);if(homes.status!=='known')throw Error('Unknown generated scene housing');
 verifyGeneratedSceneGround(s,homes.blocks,ground);return projectSceneComposition(s,housing,ground);
}
