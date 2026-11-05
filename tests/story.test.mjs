import test from 'node:test';import assert from 'node:assert/strict';
import {createCivilization,advance,choose,clone} from '../dist/story/engine.js';
test('a civilization, not four, is generated deterministically',()=>{const a=createCivilization(42),b=createCivilization(42);assert.deepEqual(a,b);assert.equal(a.history.length,1);});
test('the first 1000 years produce a diverse chronicle',()=>{const a=createCivilization(42);while(a.year<1000){advance(a,25);if(a.pending)choose(a,0);}assert.ok(a.history.length>=30);assert.ok(new Set(a.history.map(e=>e.tag)).size>=5);});
test('same seed with same choices gives same history',()=>{const a=createCivilization(731),b=createCivilization(731);for(let i=0;i<100;i++){advance(a,17);advance(b,17);if(a.pending)choose(a,1);if(b.pending)choose(b,1);}assert.deepEqual(a,b);});
test('different choice changes the projected state',()=>{const a=createCivilization(82);while(!a.pending&&a.year<3000)advance(a,20);assert.ok(a.pending);const b=clone(a);choose(a,0);choose(b,1);assert.notDeepEqual(a,b);});
test('halt on choice until resolved',()=>{const a=createCivilization(123);while(!a.pending&&a.year<3000)advance(a,10);assert.ok(a.pending);const y=a.year;advance(a,100);assert.equal(a.year,y);choose(a,0);advance(a,1);assert.equal(a.year,y+1);});
test('can resume simulation after serializing',()=>{const a=createCivilization(90);advance(a,130);if(a.pending)choose(a,0);const b=JSON.parse(JSON.stringify(a));advance(a,80);advance(b,80);assert.deepEqual(a,b);});
test('numbers remain bounded over a long simulation',()=>{const a=createCivilization(7);for(let i=0;i<400;i++){advance(a,25);if(a.pending)choose(a,0);}for(const k of ['food','cohesion','knowledge','exchange','culture'])assert.ok(a[k]>=0&&a[k]<=100);assert.ok(Number.isFinite(a.population)&&a.population>=60);});

test('one-time milestones never replay, and decisions do not immediately repeat',()=>{const s=createCivilization(42);let prev=-1;for(let i=0;i<170;i++){advance(s,25);if(s.pending){assert.notEqual(s.lastDecisionId,prev);prev=s.lastDecisionId;choose(s,0);}}const once=['共同の穀物庫が築かれる','川辺に常設の交易所ができる','村々の中心に大きな町が生まれる'];for(const title of once)assert.ok(s.history.filter(e=>e.title===title).length<=1);assert.ok(new Set(s.history.map(e=>e.title)).size>=45);});

test('auto choice is seeded, reproducible, and records its provenance', async()=>{
 const {chooseAutomatically}=await import('../dist/story/engine.js');
 const a=createCivilization(433);while(!a.pending&&a.year<3000)advance(a,25);
 assert.ok(a.pending);
 const b=clone(a);const i=chooseAutomatically(a);assert.ok(i>=0);
 assert.equal(chooseAutomatically(b),i);assert.deepEqual(a,b);
 assert.equal(a.history.at(-1).causes[0],'偶然に委ねられた選択');
});
test('shared practices persist, weaken and influence later carrying capacity', async()=>{
 const {legacyStrength,ensureMemory}=await import('../dist/story/engine.js');
 const s=createCivilization(42);
 for(let i=0;i<150;i++){advance(s,20);if(s.pending)choose(s,0);}
 const memory=ensureMemory(s);
 assert.ok(memory.log.some(m=>m.action==='formed'),'at least one lasting practice forms');
 assert.ok(memory.log.some(m=>m.action==='weakened'),'institutions gradually age');
 assert.ok(memory.log.every(m=>m.strength>=0&&m.strength<=100));
 assert.ok(Object.values(memory.legacies).every(x=>legacyStrength(s,x.kind)===x.strength));
 const earlier=memory.log.find(m=>m.action==='formed');
 assert.ok(earlier&&earlier.established<=s.year);
});
test('memory and automatic choices survive save/restore and remain deterministic',async()=>{
 const {chooseAutomatically}=await import('../dist/story/engine.js');
 const a=createCivilization(894);
 for(let i=0;i<75;i++){advance(a,20);if(a.pending)chooseAutomatically(a);}
 const b=JSON.parse(JSON.stringify(a));
 for(let i=0;i<60;i++){advance(a,20);advance(b,20);if(a.pending)chooseAutomatically(a);if(b.pending)chooseAutomatically(b);}
 assert.deepEqual(a,b);
});
test('older saves without memory are safely initialized', async()=>{
 const {ensureMemory}=await import('../dist/story/engine.js');
 const s=createCivilization(29);delete s.memory;
 ensureMemory(s);advance(s,200);
 assert.ok(s.memory&&Array.isArray(s.memory.log));
});
