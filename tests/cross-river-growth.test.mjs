import {createHash} from 'node:crypto';import test from 'node:test';import assert from 'node:assert/strict';
import {createNewWorld} from '../dist/story/new-world.js';import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';import {createGeneratedWorldSave,restoreGeneratedWorld} from '../dist/story/world-save.js';import {generatedSession,improveWorldGrowth} from '../dist/story/world-session.js';import {housingAt} from '../dist/story/housing-history.js';import {observeGeneratedSceneReview} from '../dist/scene/generated-scene-review.js';
import {generatedPublicSpaceExtension} from '../dist/story/generated-public-space-review.js';import {withGeneratedBridgeAccess} from '../dist/story/generated-bridge-history-review.js';import {findPlacementReview} from '../dist/terrain/placement-search-review.js';import {reviewNeighborEntrances} from '../dist/terrain/facility-plan-review.js';
const old=advanceGeneratedBridgeReview(createNewWorld(42,'terrain-placement-v2').review,1000,'automatic');
const blocks=(r,year)=>housingAt(r.review.state.housing,year,'river-bank').blocks;
test('v2 seed 42 still matches its pre-fix complete state',()=>{
 assert.equal(createHash('sha256').update(JSON.stringify(old.review.state)).digest('hex'),'8fdf5cdba41651bed5811dfc0bdeb7b5dbbfd17c2320c8d8c3a1863926b7ff25');
});
test('seed 42 natural growth reaches the empty opposite bank after a walkable bridge',()=>{
 const improved=advanceGeneratedBridgeReview(createNewWorld(42).review,1000,'automatic'),bridge=improved.review.bridgeReview.bridges[0];assert.ok(bridge);
 const far=blocks(improved,1000).filter(b=>b.footprint.x>=bridge.geometry.deck.x+bridge.geometry.deck.width);
 assert.ok(far.length>0);assert.ok(far.every(b=>b.builtYear>bridge.builtYear));
 assert.equal(blocks(old,1000).filter(b=>b.footprint.x>=bridge.geometry.deck.x+bridge.geometry.deck.width).length,0,'reproduces the reported one-bank v2 world');
 assert.equal(createGeneratedWorldSave(improved).progressionPolicy.id,'terrain-placement-v3');
});
test('future-only upgrade keeps all old foundations and past scenes, then grows across the bridge and resumes exactly',()=>{
 const before=createGeneratedWorldSave(old),past=observeGeneratedSceneReview(old,300,0),upgraded=improveWorldGrowth(generatedSession(old)),save=createGeneratedWorldSave(upgraded.review);
 assert.deepEqual({...save,progressionPolicy:before.progressionPolicy},before);assert.deepEqual(observeGeneratedSceneReview(upgraded.review,300,0),past);
 assert.equal(old.review.growthPattern,'organic-v2');assert.equal(upgraded.review.review.growthPattern,'organic-v3');
 const direct=advanceGeneratedBridgeReview(upgraded.review,500,'automatic'),resumed=advanceGeneratedBridgeReview(restoreGeneratedWorld(JSON.parse(JSON.stringify(save))),500,'automatic');assert.deepEqual(createGeneratedWorldSave(direct),createGeneratedWorldSave(resumed));
 const original=blocks(old,1000);for(const b of original)assert.deepEqual(blocks(direct,1500).find(x=>x.blockId===b.blockId).footprint,b.footprint);
 const bridge=old.review.bridgeReview.bridges[0];assert.ok(blocks(direct,1500).some(b=>b.builtYear>1000&&b.footprint.x>=bridge.geometry.deck.x+bridge.geometry.deck.width));
});
test('opposite-bank search agrees with exhaustive scoring and stops when a deck is broken or obstructed',()=>{
 const r=old.review,s=r.state,site='river-bank',p=r.plans[site],actual=[...r.placements.filter(p=>p.site===site).map(p=>({id:p.objectId,kind:p.kind,plot:p.plot,entrance:p.entrance})),...generatedPublicSpaceExtension.additionalOccupancy(r,s,site)];
 const ctx=withGeneratedBridgeAccess(r,{terrain:r.terrain,site,year:1000,confirmedYear:1000,historyStatus:'known',primaryRoot:p.primaryRoot,occupancy:actual,reservations:[{id:'west',plot:{x:0,y:96,width:200,depth:84}},{id:'east',plot:{x:260,y:96,width:60,depth:84}},{id:'south',plot:{x:200,y:134,width:60,depth:46}}]});
 const req={objectId:'new-bank-house-9',purpose:'housing',width:18,depth:8,nucleus:p.nucleus,neighborEntrances:reviewNeighborEntrances('housing',actual),growthPattern:'organic-v3'};
 const fast=findPlacementReview(ctx,req),slow=findPlacementReview(ctx,req,'exhaustive');assert.equal(fast.status,'review-only');for(const k of ['plot','entrance','score','access'])assert.deepEqual(fast[k],slow[k],k);
 assert.equal(findPlacementReview({...ctx,crossings:[]},req).status,'hold');
 const deck=ctx.crossings[0].deck,cut={x:deck.x+Math.floor(deck.width/2),y:deck.y,width:2,depth:4};
 assert.equal(findPlacementReview({...ctx,occupancy:[...ctx.occupancy,{id:'blocked',plot:cut,entrance:[cut.x,cut.y+4]}]},req).status,'hold');
 assert.deepEqual(findPlacementReview(ctx,req).plot,fast.plot,'a previously broken or obstructed crossing must not poison an intact search');
});
