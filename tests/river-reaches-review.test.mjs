import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {parseTerrainRecord} from '../dist/terrain/terrain-record.js';
import {generateWorldPrototype} from '../dist/terrain/world-prototype.js';
import {captureTerrainRecord} from '../dist/terrain/capture-terrain-record.js';
import {captureRiverReaches,validateRiverReaches,riverOwnershipRaster,riverJunctionExcludes} from '../dist/terrain/river-reaches-review.js';
import {decodeRecordPhysics} from '../dist/terrain/terrain-record-raster-v1.js';
const seeds=[6,1,3,8,24,10,2,21,9,5];
for(const seed of seeds)test('river ownership roundtrip covers exact water and declared ports seed '+seed,()=>{
 const w=generateWorldPrototype(seed);assert.equal(w.status,'ok');const t=captureTerrainRecord(w.world,'ownership-test'),before=JSON.stringify(t),h=captureRiverReaches(t);
 assert.deepEqual(validateRiverReaches(JSON.parse(JSON.stringify(h)),t),h);assert.ok(Object.isFrozen(h)&&Object.isFrozen(h.reaches));
 const {owners,streamIds}=riverOwnershipRaster(h,t),r=decodeRecordPhysics(t.sites['river-bank'].physics);
 for(let i=0;i<57600;i++)assert.equal(owners[i]!==-1,r.surface[i]===2);
 for(const port of t.geography.ports.filter(p=>p.site==='river-bank'&&p.visible)){
  const [x,y]=port.point;assert.equal(streamIds[owners[y*320+x]],port.streamId);
 }
 if(['confluence','distributary'].includes(t.sites['river-bank'].variants.river))assert.equal(new Set(h.reaches.map(r=>r.streamId)).size,3);
 for(const j of h.junctions){assert.equal(riverJunctionExcludes(h,j.y-8,j.y-7),true);assert.equal(riverJunctionExcludes(h,j.y+8,j.y+9),true);}
 assert.equal(JSON.stringify(t),before);
});
test('saved ownership rejects missing coverage, invented IDs and shifted junctions',()=>{
 const t=captureTerrainRecord(generateWorldPrototype(9).world,'ownership-test'),original=captureRiverReaches(t);
 for(const mutate of [h=>h.source.seed++,h=>h.reaches[0].streamId='invented',h=>h.reaches[0].fromY++,h=>h.reaches.push({...h.reaches[0]}),h=>h.junctions[0].y++,h=>h.status='active',h=>h.extra={}]){
  const h=structuredClone(original);mutate(h);assert.throws(()=>validateRiverReaches(h,t));
 }
});
test('frozen terrain and ownership load without reconstructing them from seed',()=>{
 const t=parseTerrainRecord(readFileSync(new URL('./fixtures/terrain-record-v1-seed42.json',import.meta.url),'utf8'));
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/river-reaches-v1-seed42.json',import.meta.url),'utf8'));
 const h=validateRiverReaches(fixture.descriptor,t),r=riverOwnershipRaster(h,t);
 assert.deepEqual(r.streamIds,fixture.streamIds);
 const bytes=new Uint8Array(r.owners.length*2),view=new DataView(bytes.buffer);
 r.owners.forEach((owner,i)=>view.setInt16(i*2,owner,true));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),fixture.ownerBytesSha256);
});
