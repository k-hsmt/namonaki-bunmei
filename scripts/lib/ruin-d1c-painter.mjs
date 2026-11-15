/**
 * Issue #37 D1c (browser module, served from the repository root): a development painter that draws a real world's
 * confirmed ruins with the D1a weathering and adds the D1b reclamation plants. PROTOTYPE — appearance only.
 * It reads only the confirmed history of the observed year (housing events, building changes); it writes nothing.
 * The structure drawing mirrors architecture/scene-v1 (same births, same order) except that every vacant or ruined
 * building goes through drawWeatheredArchitecture instead of drawRuin.
 */
import {drawResidentialRoofs} from '/dist/scene/draw.js';
import {drawArchitecture} from '/dist/architecture/draw-v1.js';
import {drawMiniature} from '/dist/architecture/miniature-v1.js';
import {sceneOccupiedPlots} from '/dist/scene/flora-draw.js';
import {planFloraScene,BIOME_SCENE} from '/dist/flora/flora-scene-v1.js';
import {readOwnedRecordPhysics} from '/dist/terrain/owned-record-physics.js';
import {ruinClimateOf,ruinAppearanceOf,ruinLookOf,drawWeatheredArchitecture} from '/dist/ruin/ruin-weathering-v1.js';
import {reclamationPeriods,openZonesAt,reclamationMask,planReclamation,facilityWallPlans,housingPartPlans} from '/dist/ruin/reclamation-access-v1.js';

const SITES=['river-bank','hill-side','coast-inlet'];
const target=c=>({rect(x,y,w,h,col){c.fillStyle=col;c.fillRect(x,y,w,h);}});
const partSize={far:[5,4],middle:[9,7],near:[13,10]};

/** Confirmed state timelines of a session: housing per block, facilities per building id (oldest first). */
export function ruinTimelines(state){
 const housing=new Map(),facilities=new Map();
 for(const e of [...(state.housing?.events??[])].sort((a,b)=>a.year-b.year||a.seq-b.seq)){
  const l=housing.get(e.blockId)??[];l.push({year:e.year,use:e.after.use==='occupied'||e.after.use==='underused'||e.after.use==='vacant'?e.after.use:'occupied',condition:e.after.condition,sourceKey:`housing:${e.blockId}:${e.year}:${e.seq}`});housing.set(e.blockId,l);}
 for(const [si,s] of (state.observation?.sites??[]).entries())for(const c of s.buildingChanges??[]){
  const b=c.building;if(b.kind==='field'||b.kind==='bridge')continue;
  const l=facilities.get(b.id)??[];if(l.at(-1)?.condition===b.condition)continue;
  l.push({year:c.year,condition:b.condition,sourceKey:`building:${b.id}:${c.year}`,site:SITES[si]});facilities.set(b.id,l);}
 return {housing,facilities};
}
const upTo=(list,year)=>(list??[]).filter(c=>c.year<=year);
/** D1a clocks from confirmed states: vacant since entering vacancy (a repair of a ruin restarts it), ruin since the ruin. */
export function clocksFrom(changes,year,kind){
 const open=c=>kind==='housing'?c.use==='vacant':c.condition==='ruined';
 let prev=null,since=null,ruin=null;
 for(const c of upTo(changes,year)){
  if(open(c)&&(!prev||!open(prev)))since=c.year;
  if(open(c)&&prev?.condition==='ruined'&&c.condition!=='ruined')since=c.year;
  if(!open(c))since=null;
  if(c.condition==='ruined'&&prev?.condition!=='ruined')ruin=c.year;if(c.condition!=='ruined')ruin=null;
  prev=c;}
 return since===null?{abandonedYears:null,ruinedYears:null}:{abandonedYears:year-since,ruinedYears:ruin===null?null:year-ruin};
}

/**
 * `base`: the session's live painter (worldStructurePainter). `options.weathering` / `options.reclamation` switch the two
 * parts; `options.season` forces a SeasonalView (development comparison, as #36 D1a). Returns a painter for
 * drawGeneratedSceneReview and `stats(o)` (the owners and local plants of an observation).
 */
export function ruinDevPainter(session,base,options={}){
 const {weathering=true,reclamation=true,season}=options;
 const births=session.architecture.architecture.births,climate=session.climate,rc=ruinClimateOf(climate),look=ruinLookOf(rc,BIOME_SCENE[climate.dominantBiome].soil);
 const T=ruinTimelines(session.state);
 const facilities=new Map(),housing=new Map();
 for(const b of births){const map=b.ref.kind==='facility'?facilities:housing,key=b.ref.kind==='facility'?b.ref.id:b.ref.blockId;const l=map.get(key)??[];l.push(b);map.set(key,l);}
 const latest=(list,year,covers=()=>true)=>{let best;for(const b of list??[])if(b.source.year<=year&&covers(b)&&(!best||b.source.year>=best.source.year))best=b;return best;};
 const housingBirth=(blockId,index,year)=>latest(housing.get(blockId),year,b=>b.ref.kind==='housing'&&b.ref.parts.from<=index&&index<b.ref.parts.to);
 // the scene draws each building several times (structure layer, ground-line layout): replay the weathered pixels
 const drawn=new Map();
 const paint=(c,key,spec,draw,clocks,where)=>{
  if(!weathering||clocks.abandonedYears===null){draw(target(c));return;}
  const id=key+'|'+where+'|'+clocks.abandonedYears+'|'+clocks.ruinedYears;let rects=drawn.get(id);
  if(!rects){rects=[];drawWeatheredArchitecture({rect:(x,y,w,h,col)=>rects.push([x,y,w,h,col])},key,draw,ruinAppearanceOf(spec,clocks,rc),look);if(drawn.size>4000)drawn.clear();drawn.set(id,rects);}
  for(const [x,y,w,h,col] of rects){c.fillStyle=col;c.fillRect(x,y,w,h);}
 };
 const painter={
  residentialRoofs(c,scene,depth){
   if(!weathering)return base.residentialRoofs(c,scene,depth);
   const parts=scene.residentialBlocks.flatMap(b=>b.roofParts).filter(p=>p.depth===depth).sort((a,b)=>a.y-b.y||a.x-b.x||a.partId.localeCompare(b.partId));
   for(const p of parts){
    const index=Number(p.partId.slice(p.partId.lastIndexOf(':')+1)),birth=Number.isSafeInteger(index)?housingBirth(p.blockId,index,scene.year):undefined;
    if(!birth){drawResidentialRoofs(c,{...scene,residentialBlocks:[{...scene.residentialBlocks[0],roofParts:[p]}]},depth);continue;}
    const spec={use:birth.use,...birth.features},clocks=clocksFrom(T.housing.get(p.blockId),scene.year,'housing');
    paint(c,p.partId,spec,t=>drawMiniature(t,spec,p.x,p.y,depth),clocks,`${p.x},${p.y},${depth},${birth.source.year}`);
    if(depth!=='far'&&p.condition==='damaged'){const [w,h]=partSize[depth];c.fillStyle='#4d504b';c.fillRect(Math.round(p.x-w/2),p.y-h+3,3,2);}
   }
  },
  facility(c,o,plot,year){
   if(!weathering)return base.facility(c,o,plot,year);
   if(o.kind==='field'||o.kind==='bridge')return false;
   const birth=latest(facilities.get(o.id),year);if(!birth)return false;
   const spec={use:birth.use,...birth.features};
   const draw=t=>{if(o.civic){if(o.civic.architectureStyle==='courtyard-hall')drawArchitecture(t,{...spec,use:'courtyard'},o.x,o.y,{width:plot.width,height:15});else drawArchitecture(t,spec,o.x,o.y,{width:plot.width});}else drawArchitecture(t,spec,o.x,o.y);};
   paint(c,o.id,spec,draw,clocksFrom(T.facilities.get(o.id),year,'facility'),`${o.x},${o.y},${plot.width},${birth.source.year}`);
   if(o.condition==='damaged'){c.fillStyle='#454e48';c.fillRect(o.x-6,o.y-2,6,2);}
   return true;
  },
  flora(o){
   const f=base.flora(o),withSeason=season?{...f,season}:f;
   return reclamation?{...withSeason,extraPlants:reclaim(o,f).plants}:withSeason;
  },
 };
 const cache=new WeakMap();
 /** Owners of an observation (blocks and non-field facilities with a known history) and their local plants. */
 function reclaim(o,f){
  let r=cache.get(o);if(r)return r;
  const year=o.snapshot.year,site=o.ground.site,physics=readOwnedRecordPhysics(o.ground.terrain.sites[site].physics),occupied=sceneOccupiedPlots(o);
  const owners=[];
  for(const b of o.composition.residentialBlocks){const changes=upTo(T.housing.get(b.blockId),year);if(!changes.length||changes[0].condition!=='sound'||changes[0].use==='vacant')continue;
   owners.push({kind:'housing',id:b.blockId,footprint:b.footprint,protectedPlans:housingPartPlans(b.roofParts),changes});}
  for(const x of o.snapshot.objects){if(x.kind==='field'||x.kind==='bridge')continue;const g=o.ground.facilities.find(f=>f.id===x.id);const changes=upTo(T.facilities.get(x.id),year);
   if(!g||!changes.length||changes[0].condition!=='intact')continue;
   owners.push({kind:'facility',id:x.id,footprint:g.plot,protectedPlans:facilityWallPlans(g.plot),changes:changes.map(({site,...c})=>c)});}
  const same=(a,b)=>a.x===b.x&&a.y===b.y&&a.width===b.width&&a.depth===b.depth;
  const openOwners=owners.filter(w=>openZonesAt(reclamationPeriods(w),year).length);
  const existing=planFloraScene({seed:f.seed,site,patches:f.patches,views:f.views,physics,occupied});
  const plants=[],byOwner=[];
  for(const w of openOwners){
   const standing=occupied.filter(p=>!openOwners.some(x=>same(x.footprint,p)));
   const mask=reclamationMask(w,physics,standing);
   const res=planReclamation({seed:f.seed,site,owner:w,year,mask,patches:f.patches,views:f.views,existing:[...existing,...plants],standing});
   plants.push(...res.plants);byOwner.push({id:w.id,kind:w.kind,zones:openZonesAt(reclamationPeriods(w),year).map(p=>[p.zone,p.openedYear]),plants:res.plants.length});
  }
  r={plants,owners:byOwner,existing:existing.length};cache.set(o,r);return r;
 }
 return {painter,stats:o=>reclaim(o,base.flora(o))};
}
