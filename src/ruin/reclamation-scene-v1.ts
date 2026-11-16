/**
 * Issue #37 D3: the plants that take root again on abandoned ground in a confirmed scene (reclamation-access-v1 on the
 * world's confirmed history). Appearance only: never read by history, economy, vegetation or the civilisation RNG.
 *
 * Owners are the observed year's housing blocks and buildings (not fields or bridges) whose recorded history starts
 * with their construction; anything else stays protected (D0 §3). Each open owner gets its zones from the confirmed
 * changes up to that year, its mask avoids the structures standing that year, and its plants keep the live spacing from
 * the plants the scene already shows. Construction occupancy (sceneOccupiedPlots) is read, never changed (D0 §4).
 */
import type {GeneratedSceneObservation} from '../scene/generated-scene-review.js';
import {sceneOccupiedPlots} from '../scene/flora-draw.js';
import type {ScenePlant,ScenePlot} from '../flora/flora-scene-v1.js';
import type {FloraPatch} from '../flora/local-flora-v1.js';
import type {FloraPatchView} from '../flora/flora-growth-v1.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
import {reclamationPeriods,openZonesAt,reclamationMask,planReclamation,facilityWallPlans,housingPartPlans,type ReclamationOwner} from './reclamation-access-v1.js';
import type {RuinTimelines} from './ruin-history-v1.js';

const same=(a:ScenePlot,b:ScenePlot)=>a.x===b.x&&a.y===b.y&&a.width===b.width&&a.depth===b.depth;

/** Owners of an observation with a history known from its construction, their changes cut at the observed year. */
export function reclamationOwners(o:GeneratedSceneObservation,timelines:RuinTimelines):readonly ReclamationOwner[] {
 const year=o.snapshot.year,owners:ReclamationOwner[]=[];
 for(const b of o.composition.residentialBlocks){
  const changes=(timelines.housing.get(b.blockId)??[]).filter(c=>c.year<=year);
  if(!changes.length||changes[0]!.condition!=='sound'||changes[0]!.use==='vacant')continue;
  owners.push({kind:'housing',id:b.blockId,footprint:b.footprint,protectedPlans:housingPartPlans(b.roofParts),changes:changes.map(c=>({...c,sourceKey:`housing:${b.blockId}:${c.year}`}))});
 }
 for(const x of o.snapshot.objects){
  if(x.kind==='field'||x.kind==='bridge')continue;
  const g=o.ground.facilities.find(f=>f.id===x.id),changes=(timelines.facilities.get(x.id)??[]).filter(c=>c.year<=year);
  if(!g||!changes.length||changes[0]!.condition!=='intact')continue;
  owners.push({kind:'facility',id:x.id,footprint:g.plot,protectedPlans:facilityWallPlans(g.plot),changes:changes.map(c=>({...c,sourceKey:`building:${x.id}:${c.year}`}))});
 }
 return owners;
}

/**
 * Plants added to a confirmed scene, given the plants it already shows (`planted`, the live planting of that year).
 * The live planting itself is never changed.
 */
export function reclaimedPlants(o:GeneratedSceneObservation,source:{readonly seed:number;readonly patches:readonly (FloraPatch|null)[];readonly views:readonly (FloraPatchView|null)[]},timelines:RuinTimelines,planted:readonly ScenePlant[]):readonly ScenePlant[] {
 const year=o.snapshot.year,site=o.ground.site;
 const open=reclamationOwners(o,timelines).filter(w=>openZonesAt(reclamationPeriods(w),year).length);
 if(!open.length)return [];
 const physics=readOwnedRecordPhysics(o.ground.terrain.sites[site].physics),occupied=sceneOccupiedPlots(o);
 const standing=occupied.filter(p=>!open.some(w=>same(w.footprint,p))),plants:ScenePlant[]=[];
 for(const owner of open){
  const mask=reclamationMask(owner,physics,standing);
  plants.push(...planReclamation({seed:source.seed,site,owner,year,mask,patches:source.patches,views:source.views,existing:[...planted,...plants],standing}).plants);
 }
 return Object.freeze(plants);
}
