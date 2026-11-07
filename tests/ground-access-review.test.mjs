import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyRecordRaster,encodeRecordPhysics,decodeRecordPhysics} from '../dist/terrain/terrain-record-raster-v1.js';
import {validateTerrainRecord} from '../dist/terrain/terrain-record.js';
import {reviewGroundAccess,createGroundAccessReviewer,generatedGroundGraphMetrics,southEntrance,reviewPhysicalPlot,groundReviewLimits,groundWalkWindows,groundDistances,groundDistancesFromAny} from '../dist/terrain/ground-access-review.js';
const plot=(x,y,width=18,depth=7)=>({x,y,width,depth});
function setup(){
 const raster=emptyRecordRaster();raster.surface.fill(1,96*320);
 // Synthetic raster is injected only for unit topology counterexamples.
 const ctx={terrain:null,site:'river-bank',year:10,confirmedYear:10,historyStatus:'known',primaryRoot:[0,100],occupancy:[],reservations:[]};
 const review=(p,purpose='house',id='new')=>{
  ctx.terrain={sites:{'river-bank':{physics:encodeRecordPhysics(raster)}}};
  return reviewGroundAccess(ctx,purpose,id,p);
 };return {raster,ctx,review};
}
test('half-open plots, deterministic shortest path, and input noninterference',()=>{
 const {ctx,review}=setup();ctx.occupancy=[{id:'old',plot:plot(20,110),entrance:[28,117]}];
 const p=plot(38,110),before=structuredClone(p),a=review(p),b=review(p);
 assert.equal(a.status,'clear');assert.deepEqual(a,b);assert.deepEqual(p,before);
 assert.deepEqual(a.entrance,[46,117]);assert.deepEqual(a.access[0],ctx.primaryRoot);
 assert.deepEqual(a.access.at(-1),a.entrance);
 for(let i=1;i<a.access.length;i++)assert.equal(Math.abs(a.access[i][0]-a.access[i-1][0])+Math.abs(a.access[i][1]-a.access[i-1][1]),1);
 assert.deepEqual(southEntrance(plot(2,100,19)),[10,107]);
});
test('owned frozen raster is isolated from public decoding and mutable wires remain fresh',()=>{
 const {raster,ctx}=setup(),physics=encodeRecordPhysics(raster);
 const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
 freeze(physics);ctx.terrain={sites:{'river-bank':{physics}}};
 const before=reviewGroundAccess(ctx,'house','new',plot(20,110));assert.equal(before.status,'clear');
 decodeRecordPhysics(physics).surface.fill(2);
 assert.deepEqual(reviewGroundAccess(ctx,'house','new',plot(20,110)),before);
 const mutable=structuredClone(physics);ctx.terrain={sites:{'river-bank':{physics:mutable}}};
 assert.equal(reviewGroundAccess(ctx,'house','new',plot(20,110)).status,'clear');
 mutable.rows[110]=[[320,2,0,0,0]];
 assert.equal(reviewGroundAccess(ctx,'house','new',plot(20,110)).reason,'water');
});
test('search-owned before graph is reused while every hypothetical plot and entrance remains checked',()=>{
 const {raster,ctx}=setup();ctx.terrain={sites:{'river-bank':{physics:encodeRecordPhysics(raster)}}};
 const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};freeze(ctx.terrain);
 ctx.occupancy=[{id:'old',plot:plot(20,110),entrance:[28,117]}];
 const owned=createGroundAccessReviewer(ctx),snapshot=structuredClone(ctx),before=generatedGroundGraphMetrics();
 const candidates=[plot(38,110),plot(44,120),plot(0,100,2,79)];
 const actual=candidates.map(p=>owned('house','new',p)),after=generatedGroundGraphMetrics();
 assert.equal(after.parentTraversals-before.parentTraversals,1+candidates.length);
 for(let i=0;i<candidates.length;i++)assert.deepEqual(actual[i],reviewGroundAccess(snapshot,'house','new',candidates[i]));
 ctx.primaryRoot=[300,100];ctx.occupancy.push({id:'later',plot:plot(44,120),entrance:[52,127]});
 assert.deepEqual(owned('house','new',candidates[1]),actual[1],'transaction must own its occupancy snapshot');
 assert.equal(reviewGroundAccess(ctx,'house','new',candidates[1]).reason,'occupied');
});
test('interior cells, water, unstable bearing, slope and elevation are inspected',()=>{
 for(const [channel,value,reason] of [['surface',2,'water'],['surface',3,'water'],['surface',0,'outside-ground'],['bearing',1,'unstable'],['bearing',2,'unstable'],['grade',2,'steep'],['elevation',3,'steep']]){
  const {raster,review}=setup();raster[channel][113*320+27]=value;
  assert.equal(review(plot(20,110)).reason,reason,channel);
 }
 const {raster,review}=setup();raster.grade[113*320+27]=1;raster.elevation[113*320+27]=1;
 assert.equal(review(plot(20,110),'house').status,'clear');
 for(const purpose of ['hall','market','civic','public-space'])assert.equal(review(plot(20,110),purpose).reason,'steep');
});
test('unknown/partial and future years cannot create placements',()=>{
 const {ctx,review}=setup();
 for(const status of ['unknown','partial']){ctx.historyStatus=status;assert.equal(review(plot(20,110)).reason,'unknown-history');}
 ctx.historyStatus='known';ctx.year=11;assert.equal(review(plot(20,110)).reason,'unconfirmed-year');
 for(const p of [plot(-1,100),plot(0,95),plot(310,110),plot(20,175),plot(1.5,100)]){ctx.year=10;assert.equal(review(p).reason,'outside-ground');}
});
test('revised Q6 foundation relief rejects a house accepted by the D0 limit',()=>{
 const {raster}=setup();const p=plot(20,110);
 raster.elevation[113*320+27]=2;raster.grade[113*320+27]=1;
 assert.equal(reviewPhysicalPlot(raster,'house',p,{...groundReviewLimits,normalRelief:2}).status,'clear');
 assert.equal(reviewPhysicalPlot(raster,'house',p).reason,'steep');
 assert.equal(groundReviewLimits.flatRelief,0);
});
test('reservations do not become actual walking obstacles and own reservation is excluded',()=>{
 const {ctx,review}=setup();ctx.reservations=[{id:'z',plot:plot(20,110)},{id:'a',plot:plot(20,110)}];
 assert.deepEqual(review(plot(20,110)).conflicts,['a','z']);
 ctx.reservations=[ctx.reservations[0]];assert.equal(review(plot(20,110),'house','z').status,'clear');
 assert.equal(review(plot(20,120)).status,'clear');
});
test('one-cell land corridors and diagonal contacts cannot join two shores',()=>{
 for(const width of [1,2]){
  const {raster,review}=setup();
  for(let y=96;y<180;y++)for(let x=100;x<110;x++)if(y<120||y>=120+width)raster.surface[y*320+x]=2;
  assert.equal(review(plot(130,110)).status,width===1?'hold':'clear');
 }
 const {raster,ctx,review}=setup();raster.surface.fill(0);
 for(const p of [plot(0,100,50,20),plot(50,120,60,40)])for(let y=p.y;y<p.y+p.depth;y++)raster.surface.fill(1,y*320+p.x,y*320+p.x+p.width);
 ctx.primaryRoot=[0,100];assert.equal(review(plot(60,130)).reason,'no-access');
});
test('hypothetical occupancy cannot cut an already connected entrance',()=>{
 const {raster,ctx,review}=setup();
 raster.surface.fill(0);
 for(const p of [plot(0,100,60,60),plot(60,120,20,8),plot(80,100,60,60)])for(let y=p.y;y<p.y+p.depth;y++)raster.surface.fill(1,y*320+p.x,y*320+p.x+p.width);
 ctx.primaryRoot=[0,100];ctx.occupancy=[{id:'old',plot:plot(100,110),entrance:[108,117]}];
 const result=review(plot(56,120,6,8));assert.equal(result.reason,'no-access');
 assert.deepEqual(result.conflicts,['old']);
 // An already isolated entrance does not forbid an unrelated new construction.
 for(let y=120;y<128;y++)raster.surface.fill(0,y*320+65,y*320+70);
 assert.equal(review(plot(20,130)).status,'clear');
});
test('validated saved terrain is consumed unchanged across all three districts',()=>{
 const terrain=validateTerrainRecord(JSON.parse(readFileSync(new URL('./fixtures/terrain-record-v1-seed42.json',import.meta.url),'utf8')));
 const before=JSON.stringify(terrain);
 for(const site of ['hill-side','river-bank','coast-inlet']){
  const ctx={terrain,site,year:0,confirmedYear:0,historyStatus:'known',primaryRoot:[0,100],occupancy:[],reservations:[]};
  assert.deepEqual(reviewGroundAccess(ctx,'house','test',plot(20,110)),reviewGroundAccess(ctx,'house','test',plot(20,110)));
 }
 assert.equal(JSON.stringify(terrain),before);
});
test('multi-source distances equal independent nearest-source distances cell for cell',()=>{
 const {raster}=setup();for(let y=100;y<155;y++)raster.surface[y*320+80]=2;
 const windows=groundWalkWindows(raster,[]),a=groundDistances(windows,[10,110]),b=groundDistances(windows,[130,140]);
 const together=groundDistancesFromAny(windows,[[130,140],[10,110],[10,110],[-1,100]]);
 for(let i=0;i<together.length;i++)assert.equal(together[i],a[i]<0?b[i]:b[i]<0?a[i]:Math.min(a[i],b[i]));
});
