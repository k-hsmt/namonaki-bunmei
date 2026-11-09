import test from 'node:test';import assert from 'node:assert/strict';import {readFile}from'node:fs/promises';import{createHash}from'node:crypto';import{createNewWorld}from'../dist/story/new-world.js';import{advanceGeneratedBridgeReview}from'../dist/story/generated-bridge-review.js';import{createIrrigationReview}from'../dist/irrigation/progression-v1.js';import{canonicalWire}from'../dist/irrigation/wire-v1.js';
const fixture=JSON.parse(await readFile('tests/fixtures/irrigation-a2-reference.json','utf8'));
test('A3 performance changes retain all five complete A2 trial values at 1000 years',async()=>{for(const c of fixture.cases.filter(c=>c.year===1000)){const t=await createIrrigationReview(advanceGeneratedBridgeReview(createNewWorld(c.seed).review,c.year,'automatic'),0);assert.equal(createHash('sha256').update(canonicalWire(t)).digest('hex'),c.sha256,'seed '+c.seed);}});
test('recursive freeze reuse still freezes children of a shallow-frozen caller object',async()=>{const{freezeReview}=await import('../dist/irrigation/wire-v1.js'),child={nested:{value:1}},input=Object.freeze({child});freezeReview(input);assert.ok(Object.isFrozen(child)&&Object.isFrozen(child.nested));assert.throws(()=>child.nested.value=2);assert.equal(freezeReview(input),input);});
test('phase measurement uses the exact same advancement and never enters the serialized review',async()=>{const{advanceIrrigationReview,measureIrrigationAdvance}=await import('../dist/irrigation/progression-v1.js'),initial=await createIrrigationReview(createNewWorld(42).review),measured=await measureIrrigationAdvance(initial,100),normal=await advanceIrrigationReview(initial,100);assert.deepEqual(measured.review,normal);assert.ok(measured.timing.totalMs>=measured.timing.civilizationMs+measured.timing.ecologyMs);assert.equal('timing' in measured.review,false);});

test('D2 prefix reuse matches eager ecology across unaligned introduction, construction and backfill',async()=>{
 const {irrigationSources}=await import('../dist/irrigation/sources-v1.js'),{environmentStateAt}=await import('../dist/environment/history-v1.js'),{irrigationEnvironmentRunner}=await import('../dist/environment/model-v1.js'),{channelStateAt}=await import('../dist/irrigation/replay-v1.js'),{irrigationEffects,channelPatches}=await import('../dist/irrigation/ecology-v1.js');
 const world=advanceGeneratedBridgeReview(createNewWorld(42).review,700,'automatic');
 for(const introduced of [0,99,574,575]){
  const trial=await createIrrigationReview(world,introduced),source=irrigationSources(trial.base),start=environmentStateAt(source.environment,source.vegetation,source.world.review,introduced);
  const runner=irrigationEnvironmentRunner(source.vegetation,source.world.review,source.environment.uses,start,year=>{const state=channelStateAt(trial.events,year),system=trial.systems.find(s=>s.id===state?.id),effect=irrigationEffects(system,state,state?.status==='active'?source.at(year):undefined);return {...effect,disturbedPatches:[...new Set(trial.events.filter(e=>e.year===year&&(e.kind==='built'||e.kind==='backfilled')).flatMap(e=>channelPatches(trial.systems.find(s=>s.id===e.systemId))))].sort((a,b)=>a-b)};});
  for(let year=introduced+1;year<=700;year++){runner.step(source.environment.targets[Math.floor(year/100)],source.environment.ruleId==='environment-coupled-v2'&&year>=source.environment.climateStart);if((year-introduced)%100===0)assert.deepEqual(trial.checkpoints.find(c=>c.year===year).environment,runner.snapshot(),'checkpoint '+introduced+'/'+year);}
  assert.deepEqual(trial.current.environment,runner.snapshot(),'current '+introduced);
 }
});

test('saving before first construction and after backfill preserves split advancement',async()=>{
 const {advanceIrrigationReview}=await import('../dist/irrigation/progression-v1.js'),{encodeIrrigationReview,decodeIrrigationReview}=await import('../dist/irrigation/storage-v1.js'),initial=await createIrrigationReview(createNewWorld(42).review,0),whole=await advanceIrrigationReview(initial,700);
 for(const year of [574,675]){const part=await advanceIrrigationReview(initial,year),loaded=await decodeIrrigationReview(await encodeIrrigationReview(part));assert.deepEqual(await advanceIrrigationReview(loaded,700-year),whole,'split '+year);}
});

test('recursive freeze never caches an accessor graph whose returned child can change',async()=>{
 const{freezeReview}=await import('../dist/irrigation/wire-v1.js');let child={value:1};const root={get child(){return child;}};
 freezeReview(root);assert.ok(Object.isFrozen(child));child={value:2};freezeReview(root);assert.ok(Object.isFrozen(child));assert.throws(()=>child.value=3);
});
