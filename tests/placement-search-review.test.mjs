import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyRecordRaster,encodeRecordPhysics} from '../dist/terrain/terrain-record-raster-v1.js';
import {findPlacementReview} from '../dist/terrain/placement-search-review.js';
function fixture(seed){
 const r=emptyRecordRaster();for(let y=100;y<136;y++)r.surface.fill(1,y*320,y*320+80);
 if(seed===2)for(let y=110;y<126;y++)r.surface.fill(2,y*320+40,y*320+44);
 const house={id:'house',plot:{x:8,y:102,width:18,depth:7},entrance:[16,109]};
 return {ctx:{terrain:{source:{seed},sites:{'river-bank':{physics:encodeRecordPhysics(r)}}},site:'river-bank',year:10,confirmedYear:10,historyStatus:'known',primaryRoot:[0,100],occupancy:[house],reservations:[]},
 req:{purpose:'house',objectId:'new-house',width:18,depth:7,nucleus:house.entrance,neighborEntrances:[house.entrance]}};
}
for(const seed of [1,2,3])test('bounded search selects the same exact minimum as exhaustive reference seed '+seed,()=>{
 const {ctx,req}=fixture(seed),before=JSON.stringify(ctx),fast=findPlacementReview(ctx,req),slow=findPlacementReview(ctx,req,'exhaustive');
 assert.equal(fast.status,'review-only');assert.equal(slow.status,'review-only');
 for(const key of ['plot','entrance','access','score'])assert.deepEqual(fast[key],slow[key],key);
 assert.ok(fast.metrics.accessEvaluations<slow.metrics.accessEvaluations);
 assert.equal(JSON.stringify(ctx),before);
});
for(const seed of [1,2])test('field distance preference preserves exact pruning seed '+seed,()=>{
 const {ctx,req}=fixture(seed),field={...req,purpose:'field',width:26,depth:14};
 const fast=findPlacementReview(ctx,field),slow=findPlacementReview(ctx,field,'exhaustive');
 assert.equal(fast.status,'review-only');assert.equal(slow.status,'review-only');
 for(const key of ['plot','entrance','score','access'])assert.deepEqual(fast[key],slow[key],key);
});
test('remote sea does not add an irrigation penalty or attract fields',()=>{
 const {ctx,req}=fixture(1),field={...req,purpose:'field',width:26,depth:14};
 const baseline=findPlacementReview(ctx,field),changed=structuredClone(ctx);
 // Preserve the actual land row; only the otherwise inaccessible background changes to sea.
 changed.terrain.sites['river-bank'].physics.rows[120]=[[80,1,0,0,0],[120,0,0,0,0],[1,3,0,0,0],[119,0,0,0,0]];
 const result=findPlacementReview(changed,field);
 assert.equal(result.status,'review-only');assert.deepEqual(result.plot,baseline.plot);assert.equal(result.score,baseline.score);
});
test('HOLD and unsupported semantic purposes do not run a placement search',()=>{
 const {ctx,req}=fixture(1);
 assert.equal(findPlacementReview({...ctx,historyStatus:'partial'},req).reason,'unknown-history');
 assert.equal(findPlacementReview({...ctx,year:11},req).reason,'unconfirmed-year');
 assert.equal(findPlacementReview(ctx,{...req,purpose:'public-space'}).reason,'unsupported-review-purpose');
 const blocked={...ctx,reservations:[{id:'all',plot:{x:0,y:100,width:80,depth:36}}]};
 const result=findPlacementReview(blocked,req);assert.equal(result.reason,'no-safe-plot');assert.equal(result.metrics.accessEvaluations,0);
});
test('large civic plots use hall and housing distances and match exhaustive scoring',()=>{
 const {ctx,req}=fixture(1),hall={id:'hall',plot:{x:30,y:100,width:18,depth:7},entrance:[38,107]};
 ctx.occupancy.push(hall);
 const civic={...req,purpose:'civic',width:44,depth:22,neighborEntrances:[hall.entrance],housingEntrances:[ctx.occupancy[0].entrance]};
 const fast=findPlacementReview(ctx,civic),slow=findPlacementReview(ctx,civic,'exhaustive');
 assert.equal(fast.status,'review-only');assert.equal(slow.status,'review-only');
 for(const key of ['plot','entrance','score','access'])assert.deepEqual(fast[key],slow[key]);
 assert.equal(findPlacementReview(ctx,{...civic,neighborEntrances:[]}).reason,'missing-anchor');
});
