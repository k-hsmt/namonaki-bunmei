import test from 'node:test';import assert from 'node:assert/strict';
import {generateWorldPrototype} from '../dist/terrain/world-prototype.js';
import {captureTerrainRecord} from '../dist/terrain/capture-terrain-record.js';
import {captureRiverReaches,riverOwnershipRaster,riverJunctionExcludes} from '../dist/terrain/river-reaches-review.js';
import {proposeInitialAccess} from '../dist/terrain/initial-access-review.js';
import {decodeRecordPhysics} from '../dist/terrain/terrain-record-raster-v1.js';
import {proposeBridgeGeometry,validateBridgeGeometry,bridgeCrossing,bridgeOccupancy} from '../dist/terrain/bridge-geometry-review.js';
import {groundContextWindows,groundDistances,reviewGroundAccess,reviewPhysicalPlot,southEntrance} from '../dist/terrain/ground-access-review.js';
function fixture(seed){
 const w=generateWorldPrototype(seed);assert.equal(w.status,'ok');const t=captureTerrainRecord(w.world,'bridge-test'),h=captureRiverReaches(t),plan=proposeInitialAccess(t,'river-bank');assert.equal(plan.status,'review-only');
 const ctx={terrain:t,site:'river-bank',year:100,confirmedYear:100,historyStatus:'known',primaryRoot:plan.primaryRoot,occupancy:[{id:'house',plot:plan.house,entrance:southEntrance(plan.house)}],reservations:[]};
 return {t,h,plan,ctx,propose:(mode='cached')=>proposeBridgeGeometry(ctx,h,plan.accessRoots,plan.nucleus,'river-bank-7',mode)};
}
for(const seed of [6,1,3,8,24,10,2,21,9,5])test('bridge geometry respects source water and access across catalog seed '+seed,()=>{
 const {t,h,ctx,propose}=fixture(seed),original=JSON.stringify(ctx),result=propose();assert.equal(JSON.stringify(ctx),original);
 if([2,21].includes(seed)){assert.equal(result.status,'hold');assert.equal(result.reason,'no-safe-bridge');return;}
 assert.equal(result.status,'proposed');assert.ok(result.improvement>0);const g=result.geometry;
 assert.deepEqual(validateBridgeGeometry(JSON.parse(JSON.stringify(g)),t,h),g);assert.ok(Object.isFrozen(g.deck));
 assert.ok(g.deck.width>=14&&g.deck.width<=64);assert.equal(g.deck.depth,4);assert.equal(riverJunctionExcludes(h,g.bankSupports[0].y,g.bankSupports[0].y+6),false);
 const r=decodeRecordPhysics(t.sites['river-bank'].physics),owner=riverOwnershipRaster(h,t);
 for(const p of g.bankSupports){assert.equal(p.width,4);assert.equal(p.depth,6);assert.equal(reviewPhysicalPlot(r,'hall',p).status,'clear');}
 for(let y=g.deck.y;y<g.deck.y+4;y++)for(let x=g.deck.x;x<g.deck.x+g.deck.width;x++){
  const i=y*320+x;if(r.surface[i]===2)assert.equal(owner.streamIds[owner.owners[i]],g.streamId);else assert.equal(r.surface[i],1);
 }
 const index=p=>p[1]*320+p[0],before=groundDistances(groundContextWindows(r,ctx),ctx.primaryRoot);
 assert.notEqual(before[index(g.bankA)]>=0,before[index(g.bankB)]>=0);
 const placed={...ctx,occupancy:[...ctx.occupancy,...bridgeOccupancy(g)],crossings:[bridgeCrossing(g)]};
 const after=groundDistances(groundContextWindows(r,placed),ctx.primaryRoot);assert.ok(after[index(g.bankA)]>=0&&after[index(g.bankB)]>=0);
 const broken=groundDistances(groundContextWindows(r,{...placed,crossings:[]}),ctx.primaryRoot),far=before[index(g.bankA)]<0?g.bankA:g.bankB;
 assert.equal(broken[index(far)],-1);
 const wet=Array.from({length:g.deck.width},(_,n)=>g.deck.x+n).find(x=>r.surface[g.deck.y*320+x]===2&&r.surface[g.deck.y*320+x+1]===2);assert.notEqual(wet,undefined);
 assert.equal(reviewGroundAccess(placed,'house','water-house',{x:wet,y:g.deck.y,width:2,depth:2}).reason,'water');
});
for(const seed of [6,3,24])test('reusing portal-equivalent graph results preserves exhaustive bridge choice seed '+seed,()=>{
 const {propose}=fixture(seed),fast=propose(),reference=propose('reference');assert.equal(fast.status,'proposed');assert.equal(reference.status,'proposed');
 for(const key of ['geometry','improvement','coreDistance','span','tie'])assert.deepEqual(fast[key],reference[key]);
 assert.ok(fast.metrics.accessEvaluations<=reference.metrics.accessEvaluations);assert.ok(fast.metrics.visitedVertices<=reference.metrics.visitedVertices);
});
test('bridge access never overrides an ordinary obstruction and geometry tampering is rejected',()=>{
 const {t,h,ctx,plan,propose}=fixture(6),result=propose();assert.equal(result.status,'proposed');const g=result.geometry,r=decodeRecordPhysics(t.sites['river-bank'].physics);
 const placed={...ctx,occupancy:[...ctx.occupancy,...bridgeOccupancy(g)],crossings:[bridgeCrossing(g)]};
 const cut={x:g.deck.x+Math.floor(g.deck.width/2),y:g.deck.y,width:2,depth:4};
 const blocked={...placed,occupancy:[...placed.occupancy,{id:'ordinary-obstruction',plot:cut,entrance:[cut.x,cut.y+4]}]};
 const d=groundDistances(groundContextWindows(r,ctx),ctx.primaryRoot),far=d[g.bankA[1]*320+g.bankA[0]]<0?g.bankA:g.bankB;
 assert.equal(groundDistances(groundContextWindows(r,blocked),ctx.primaryRoot)[far[1]*320+far[0]],-1);
 for(const mutate of [x=>x.deck.width+=2,x=>x.streamId='invented',x=>x.bankSupports[0].x++,x=>x.bankA[1]++,x=>x.axis='diagonal',x=>x.extra=true]){
  const raw=structuredClone(g);mutate(raw);assert.throws(()=>validateBridgeGeometry(raw,t,h));
 }
 assert.throws(()=>groundContextWindows(r,{...placed,site:'hill-side'}));
 assert.equal(proposeBridgeGeometry({...ctx,historyStatus:'partial'},h,[],[0,96],'bridge').reason,'unknown-history');
 assert.equal(proposeBridgeGeometry({...ctx,year:101},h,[],[0,96],'bridge').reason,'unconfirmed-year');
 assert.throws(()=>proposeBridgeGeometry(ctx,h,[...plan.accessRoots,[150,130]],plan.nucleus,'bridge'),/frame portal/);
 assert.throws(()=>proposeBridgeGeometry({...ctx,occupancy:[{id:'bad',plot:{x:NaN,y:100,width:4,depth:4},entrance:[0,100]}]},h,plan.accessRoots,plan.nucleus,'bridge'),/ground context/);
});
