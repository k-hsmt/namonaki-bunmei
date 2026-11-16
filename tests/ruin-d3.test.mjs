/** Issue #37 D3: plants take root again on a real world's abandoned ground, by its confirmed history only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import * as P from '../dist/architecture/production-v1.js';
import {planFloraScene} from '../dist/flora/flora-scene-v1.js';
import {sceneOccupiedPlots} from '../dist/scene/flora-draw.js';
import {readOwnedRecordPhysics} from '../dist/terrain/owned-record-physics.js';
import {ruinTimelines} from '../dist/ruin/ruin-history-v1.js';
import {reclamationOwners,reclaimedPlants} from '../dist/ruin/reclamation-scene-v1.js';
import {reclamationPeriods,openZonesAt,reclamationMask,RECLAMATION_PARAMETERS} from '../dist/ruin/reclamation-access-v1.js';

const END=1400;
const ready=(async()=>{
 const world=await P.advanceArchitectureWorld((await createNewArchitectureWorld(6)).architecture,END,'automatic');
 const S=await import('../dist/story/world-session.js'),session=S.architectureProductionSession(world),painter=S.worldStructurePainter(session);
 return {world,S,session,painter};
})();
/** The scene's own planting and the reclaimed plants, through the live flora source. */
const scene=(ctx,year,si)=>{
 const o=ctx.S.observeGeneratedWorldSession(ctx.session,year,si),f=ctx.painter.flora(o),physics=readOwnedRecordPhysics(o.ground.terrain.sites[o.ground.site].physics);
 const planted=planFloraScene({seed:f.seed,site:o.ground.site,patches:f.patches,views:f.views,physics,occupied:sceneOccupiedPlots(o)});
 return {o,f,physics,planted,reclaimed:f.reclaim(planted)};
};

test('D3: abandoned ground of a real world grows plants only on open zones, never on a standing structure',async()=>{
 const ctx=await ready,t=ruinTimelines(ctx.world.terrain.review.state);
 let total=0,frames=0;
 for(const year of [1000,1100,1250,1400])for(const si of [0,1,2]){
  const {o,physics,planted,reclaimed}=scene(ctx,year,si);frames++;total+=reclaimed.length;
  const owners=reclamationOwners(o,t),open=owners.filter(w=>openZonesAt(reclamationPeriods(w),year).length);
  if(!open.length){assert.equal(reclaimed.length,0,'no open owner, no plants');continue;}
  const standing=sceneOccupiedPlots(o).filter(p=>!open.some(w=>w.footprint.x===p.x&&w.footprint.y===p.y&&w.footprint.width===p.width&&w.footprint.depth===p.depth));
  const masks=open.map(w=>({w,mask:reclamationMask(w,physics,standing),zones:new Set(openZonesAt(reclamationPeriods(w),year).map(z=>z.zone))}));
  for(const p of reclaimed){
   const home=masks.find(({mask,zones})=>[[0,0],[1,0],[0,1],[1,1]].every(([dx,dy])=>{const v=mask[(p.y+dy)*320+p.x+dx];return v===1&&zones.has('perimeter')||v===2&&zones.has('exposed-interior');}));
   assert.ok(home,`${year}/${si}: root ${p.x},${p.y} outside every open zone`);
   for(const w of owners)for(const q of w.protectedPlans)assert.ok(!(p.x+1>=q.x-1&&p.x<q.x+q.width+1&&p.y+1>=q.y-1&&p.y<q.y+q.depth+1),'root on a structure plan');
   for(const s of standing)assert.ok(!(p.x+1>=s.x-RECLAMATION_PARAMETERS.apron&&p.x<s.x+s.width+RECLAMATION_PARAMETERS.apron&&p.y+1>=s.y-RECLAMATION_PARAMETERS.apron&&p.y<s.y+s.depth+RECLAMATION_PARAMETERS.apron),'root by a standing structure');
  }
  // the live planting is unchanged and the new plants keep their distance from it
  assert.equal(planted.length,planFloraScene({seed:scene(ctx,year,si).f.seed,site:o.ground.site,patches:scene(ctx,year,si).f.patches,views:scene(ctx,year,si).f.views,physics,occupied:sceneOccupiedPlots(o)}).length);
  // the live spacing rules (flora-scene-v1): undergrowth 7 px from undergrowth and 10 px from trees, trees 10 px or more apart
  const d2=(p,q)=>(p.x-q.x)**2+(p.y-q.y)**2;
  for(const p of reclaimed)for(const q of planted){
   if(p.kind==='low')assert.ok(d2(p,q)>=(q.kind==='tree'?100:49),'undergrowth too close to a live plant');
   else if(q.kind==='tree')assert.ok(d2(p,q)>=100,'tree too close to a live tree');
  }
 }
 assert.ok(total>0,`some abandoned ground grew plants in ${frames} scenes`);
});

test('D3: a later year never changes an earlier one, drawing is repeatable and the world is unchanged',async()=>{
 const ctx=await ready,before=JSON.stringify(await P.prepareArchitectureSave(ctx.world));
 const state=ctx.world.terrain.review.state;
 for(const year of [1000,1100,1250])for(const si of [0,1,2]){
  const {o,f,planted,reclaimed}=scene(ctx,year,si);
  const cut=ruinTimelines({housing:{events:state.housing.events.filter(e=>e.year<=year)},observation:{sites:state.observation.sites.map(s=>({buildingChanges:s.buildingChanges.filter(c=>c.year<=year)}))}});
  assert.deepEqual(reclaimedPlants(o,f,cut,planted),reclaimed,`${year}/${si}`);
  assert.deepEqual(f.reclaim(planted),reclaimed,'repeatable');
 }
 assert.equal(JSON.stringify(await P.prepareArchitectureSave(ctx.world)),before,'observing and planting changed nothing in the world');
});
