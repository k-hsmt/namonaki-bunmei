/**
 * Issue #37 D1c (browser module, served from the repository root): a development painter that adds the D1b
 * reclamation plants to a real world's scene. PROTOTYPE — appearance only. It reads only the confirmed history of the
 * observed year (housing events, building changes); it writes nothing.
 * Since D2 the live painter weathers vacant and ruined buildings itself (architecture/scene-v1 with ruin-weathering-v1),
 * so this painter keeps the live structures and only adds plants (D3 connects them to the live game).
 */
import {sceneOccupiedPlots} from '/dist/scene/flora-draw.js';
import {planFloraScene} from '/dist/flora/flora-scene-v1.js';
import {readOwnedRecordPhysics} from '/dist/terrain/owned-record-physics.js';
import {ruinTimelines} from '/dist/ruin/ruin-history-v1.js';
import {reclamationPeriods,openZonesAt,reclamationMask,planReclamation,facilityWallPlans,housingPartPlans} from '/dist/ruin/reclamation-access-v1.js';

const upTo=(list,year)=>(list??[]).filter(c=>c.year<=year);
const keyed=(prefix,id,list)=>list.map(c=>({...c,sourceKey:`${prefix}:${id}:${c.year}`}));
export {ruinTimelines};

/**
 * `base`: the session's live painter (worldStructurePainter). `options.reclamation` switches the plants;
 * `options.season` forces a SeasonalView (development comparison, as #36 D1a). Returns a painter for
 * drawGeneratedSceneReview and `stats(o)` (the owners and local plants of an observation).
 */
export function ruinDevPainter(session,base,options={}){
 const {reclamation=true,season}=options,T=ruinTimelines(session.state),cache=new WeakMap();
 const painter={...base,flora(o){
  const f=base.flora(o),withSeason=season?{...f,season}:f;
  return reclamation?{...withSeason,extraPlants:reclaim(o,f).plants}:withSeason;
 }};
 /** Owners of an observation (blocks and non-field facilities whose history starts with their construction) and their local plants. */
 function reclaim(o,f){
  let r=cache.get(o);if(r)return r;
  const year=o.snapshot.year,site=o.ground.site,physics=readOwnedRecordPhysics(o.ground.terrain.sites[site].physics),occupied=sceneOccupiedPlots(o);
  const owners=[];
  for(const b of o.composition.residentialBlocks){const changes=upTo(T.housing.get(b.blockId),year);if(!changes.length||changes[0].condition!=='sound'||changes[0].use==='vacant')continue;
   owners.push({kind:'housing',id:b.blockId,footprint:b.footprint,protectedPlans:housingPartPlans(b.roofParts),changes:keyed('housing',b.blockId,changes)});}
  for(const x of o.snapshot.objects){if(x.kind==='field'||x.kind==='bridge')continue;const g=o.ground.facilities.find(f=>f.id===x.id);const changes=upTo(T.facilities.get(x.id),year);
   if(!g||!changes.length||changes[0].condition!=='intact')continue;
   owners.push({kind:'facility',id:x.id,footprint:g.plot,protectedPlans:facilityWallPlans(g.plot),changes:keyed('building',x.id,changes)});}
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
