import test from 'node:test';
import assert from 'node:assert/strict';
import {createCivilization,advance,clone} from '../dist/story/engine.js';
import {snapshotAt,populationAt} from '../dist/scene/model.js';
const progress=(seed,years)=>{const s=createCivilization(seed);while(s.year<years){if(s.pending){s.pending=null;}advance(s,1);}return s;};
test('past scene is immutable when later years are simulated',()=>{
 const s=progress(42,1100);const old=snapshotAt(s,500);const copy=clone(s);while(copy.year<1450){if(copy.pending)copy.pending=null;advance(copy,1);}
 assert.deepEqual(snapshotAt(copy,500),old);
});
test('past viewing never mutates the civilization',()=>{
 const s=progress(15,1100);const raw=JSON.stringify(s);
 for(let y=0;y<=1100;y+=47)snapshotAt(s,y);
 assert.equal(JSON.stringify(s),raw);
});
test('same seed gives same landscape and objects',()=>{
 const a=progress(27,900),b=progress(27,900);
 assert.deepEqual(snapshotAt(a,630),snapshotAt(b,630));
});
test('all houses retain fixed coordinates and construction dates across history',()=>{
 const s=progress(73,1400);const a=snapshotAt(s,500),b=snapshotAt(s,1200);
 for(const old of a.objects){const now=b.objects.find(x=>x.id===old.id);assert.ok(now);assert.equal(now.x,old.x);assert.equal(now.y,old.y);assert.equal(now.builtYear,old.builtYear);}
});
test('population reflects observed date, not current year',()=>{
 const s=progress(42,1000);assert.equal(populationAt(s,0),s.samples[0].population);
 assert.equal(populationAt(s,1000),s.population);
 assert.equal(snapshotAt(s,200).population,populationAt(s,200));
});
test('invalid years are rejected',()=>{
 const s=createCivilization(42);assert.throws(()=>snapshotAt(s,1));assert.throws(()=>snapshotAt(s,-1));
});
