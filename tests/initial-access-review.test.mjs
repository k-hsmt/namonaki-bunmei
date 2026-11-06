import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTerrainRecord} from '../dist/terrain/terrain-record.js';
import {emptyRecordRaster,encodeRecordPhysics} from '../dist/terrain/terrain-record-raster-v1.js';
import {reviewGroundAccess,southEntrance} from '../dist/terrain/ground-access-review.js';
import {proposeInitialAccess} from '../dist/terrain/initial-access-review.js';
const saved=parseTerrainRecord(readFileSync(new URL('./fixtures/terrain-record-v1-seed42.json',import.meta.url),'utf8'));
test('year-zero house/field proposals remain connected together on saved terrain in all districts',()=>{
 const original=JSON.stringify(saved);
 for(const site of ['hill-side','river-bank','coast-inlet']){
  const a=proposeInitialAccess(saved,site),b=proposeInitialAccess(saved,site);assert.deepEqual(a,b);assert.equal(a.status,'review-only');
  assert.ok(a.accessRoots.some(r=>r[0]===a.primaryRoot[0]&&r[1]===a.primaryRoot[1]));
  const context={terrain:saved,site,year:0,confirmedYear:0,historyStatus:'known',primaryRoot:a.primaryRoot,reservations:[],occupancy:[]};
  assert.equal(reviewGroundAccess(context,'house','house',a.house).status,'clear');
  const result=reviewGroundAccess({...context,occupancy:[{id:'house',plot:a.house,entrance:southEntrance(a.house)}]},'field','field',a.field);
  assert.equal(result.status,'clear');
 }
 assert.equal(JSON.stringify(saved),original);
});
test('a larger isolated island cannot supply the initial primary root',()=>{
 const raster=emptyRecordRaster();
 for(const [x,y,w,h] of [[0,100,55,70],[80,96,140,70]])for(let row=y;row<y+h;row++)raster.surface.fill(1,row*320+x,row*320+x+w);
 // Disconnect the island from the top boundary as well.
 raster.surface.fill(0,96*320,100*320);
 const terrain={source:{seed:1},sites:{'river-bank':{physics:encodeRecordPhysics(raster)}}};
 const plan=proposeInitialAccess(terrain,'river-bank');assert.equal(plan.status,'review-only');
 assert.ok(plan.house.x<55);assert.ok(plan.field.x<55);assert.equal(plan.primaryRoot[0],0);
});
test('no field-sized connected land produces HOLD instead of a partial plan',()=>{
 const raster=emptyRecordRaster();for(let y=100;y<111;y++)raster.surface.fill(1,y*320,y*320+60);
 const terrain={source:{seed:1},sites:{'river-bank':{physics:encodeRecordPhysics(raster)}}};
 const before=JSON.stringify(terrain),plan=proposeInitialAccess(terrain,'river-bank');
 assert.equal(plan.status,'hold');assert.equal(plan.reason,'no-safe-plot');assert.equal(JSON.stringify(terrain),before);
});
