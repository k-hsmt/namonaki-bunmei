import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createNewIrrigatedWorld} from '../dist/story/new-world.js';
import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {createGeneratedWorldSave} from '../dist/story/world-save.js';
import {createCoupledReview,advanceCoupledReview,chooseCoupledReview,coupledDecisionFingerprint} from '../dist/irrigation/coupled-progression-v1.js';
import {serializeCoupledReview,encodeCoupledReview,decodeCoupledReview} from '../dist/irrigation/coupled-storage-v1.js';
import {validateCoupledReview,coupledRows} from '../dist/irrigation/coupled-history-v1.js';
import {reviewBaseHash} from '../dist/irrigation/wire-v1.js';
import {observeCoupledScene} from '../dist/scene/coupled-scene-v1.js';
import {observeGeneratedSceneReview} from '../dist/scene/generated-scene-review.js';
const initial=createNewIrrigatedWorld(42).review,save=createGeneratedWorldSave(initial),root=await createCoupledReview(save,'combined'),trial=advanceCoupledReview(root,700),plain=await serializeCoupledReview(trial);
async function recommit(packet){const {payloadHash,...payload}=packet;packet.payloadHash=await reviewBaseHash(payload);return packet;}

test('C2 compact plain/gzip roundtrip and resumed continuation preserve every persisted value',async()=>{
 for(const policy of ['baseline','yield-only','cost-only','combined']){
  const origin=await createCoupledReview(save,policy),whole=advanceCoupledReview(origin,700),stored=await encodeCoupledReview(whole),loaded=await decodeCoupledReview(stored);
  assert.equal(await serializeCoupledReview(loaded),await serializeCoupledReview(whole));assert.ok(Object.isFrozen(loaded.world.review.state));
  const split=await decodeCoupledReview(await encodeCoupledReview(advanceCoupledReview(origin,575)));
  assert.equal(await serializeCoupledReview(advanceCoupledReview(split,125)),await serializeCoupledReview(whole));
  assert.deepEqual(coupledRows(loaded),coupledRows(whole));
 }
 assert.ok(Buffer.byteLength(plain)<16*1024*1024);assert.ok(Buffer.byteLength(await encodeCoupledReview(trial))<4*1024*1024);
});

test('unaligned and pending origins reconstruct the exact v6 prefix without a second history',async()=>{
 for(const year of [0,99,100,575]){
  const origin=await createCoupledReview(createGeneratedWorldSave(advanceGeneratedBridgeReview(initial,year,'automatic')),'combined'),t=advanceCoupledReview(origin,700-year),loaded=await decodeCoupledReview(await serializeCoupledReview(t));
  assert.equal(await serializeCoupledReview(loaded),await serializeCoupledReview(t));
  assert.equal(loaded.origin.template.initialTerrain.record.format,'coupled-origin-ref-v1');
  assert.equal(loaded.origin.template.state.history.format,'coupled-origin-ref-v1');assert.equal(loaded.origin.template.environment.current.format,'coupled-origin-environment-v1');
 }
 const pending=advanceGeneratedBridgeReview(initial,1000,'stop');
 for(const protocol of ['automatic-per-branch-v1','common-explicit-v1']){
  const origin=await createCoupledReview(createGeneratedWorldSave(pending),'combined',protocol),loaded=await decodeCoupledReview(await encodeCoupledReview(origin));
  assert.equal(loaded.originPending,true);assert.equal(loaded.phases.length,0);
  const next=protocol==='automatic-per-branch-v1'?chooseCoupledReview(loaded,'random'):chooseCoupledReview(loaded,0,coupledDecisionFingerprint(loaded));
  assert.equal(next.receipts.length,1);assert.equal(await serializeCoupledReview(next),await serializeCoupledReview(protocol==='automatic-per-branch-v1'?chooseCoupledReview(origin,'random'):chooseCoupledReview(origin,0,coupledDecisionFingerprint(origin))));
 }
});

test('new pending effects survive repeated views, zero advance, gzip and manual/automatic completion',async()=>{
 for(const protocol of ['automatic-per-branch-v1','common-explicit-v1']){
  const origin=await createCoupledReview(save,'combined',protocol),held=advanceCoupledReview(origin,1000,'stop'),loaded=await decodeCoupledReview(await encodeCoupledReview(held));
  assert.deepEqual(loaded.prepared,held.prepared);assert.equal(advanceCoupledReview(loaded,0),loaded);
  const before=await serializeCoupledReview(loaded);observeCoupledScene(loaded,loaded.confirmedThrough);assert.equal(await serializeCoupledReview(loaded),before);
  const choose=t=>protocol==='automatic-per-branch-v1'?chooseCoupledReview(t,'random'):chooseCoupledReview(t,0,coupledDecisionFingerprint(t));
  assert.equal(await serializeCoupledReview(choose(loaded)),await serializeCoupledReview(choose(held)));assert.equal(choose(loaded).receipts.length,loaded.receipts.length+1);
 }
});

test('deep replay rejects altered policy, origin, inputs, sources, geometry and checkpoints even with a new checksum',async()=>{
 const mutations=[
  p=>p.policy='yield-only',p=>p.formula.gainMaxBp++,p=>p.runtimeRules.rng='unknown',p=>p.originHash='0'.repeat(64),
  p=>p.origin.template.state.history.count++,p=>p.origin.template.initialTerrain.record.path[0]='bad',
  p=>p.checkpoints[0].economy.districts[0].reserve++,p=>p.checkpoints[0].phaseCount++,p=>p.checkpoints[0].sourceCursors[0]++,
  p=>p.receipts[575][10]++,p=>p.receipts[575][2]++,p=>p.receipts[575][12][0][0]++,p=>p.receipts[575][12][1]++,
  p=>{const e=p.world.review.state.history.find(e=>e.year>0&&e.year<=700);p.receipts[e.year-1][12][5].push(e.id);},
  p=>p.world.review.placements[0].plot.x+=2,p=>p.world.vegetation.events[0].sourceRecordId='foreign',
  p=>{const patches=p.world.environment.checkpoints.at(-1).patches['river-bank'];patches.find(p=>p!==null)[2]++;},
  p=>p.world.irrigation.systems[0].geometry.path[0][0]++,p=>p.world.irrigation.attempts[0].cause={kind:'controlled-input',inputId:'fake'},
  p=>p.phases[0][5]++,p=>p.phases.find(r=>r[0]===1)[10]++,p=>p.world.review.state.lastDecisionId=(p.world.review.state.lastDecisionId+1)%5,
  p=>p.world.review.trialBoundary='wrong',p=>p.world.environment.climateRule='environment-coupled-v1',
 ];
 for(const [i,mutate]of mutations.entries()){const p=JSON.parse(plain);mutate(p);await recommit(p);await assert.rejects(()=>validateCoupledReview(p),'mutation '+i);}
 const altered=JSON.parse(plain);altered.world.review.state.food+=.01;await assert.rejects(()=>validateCoupledReview(altered),/commitment/);
});

test('economic record text is checked by replay independently of the payload commitment',async()=>{
 const t=advanceCoupledReview(await createCoupledReview(createGeneratedWorldSave(createNewIrrigatedWorld(1).review),'baseline'),3000),packet=JSON.parse(await serializeCoupledReview(t));
 const r=packet.receipts.find(r=>r[12][5].length);assert.ok(r);packet.world.review.state.history.find(e=>e.id===r[12][5][0]).body+=' changed';
 await recommit(packet);await assert.rejects(()=>validateCoupledReview(packet),/economic record differs/);
});

test('reader detaches before native hashing and rejects malformed compact/gzip envelopes',async()=>{
 const p=JSON.parse(plain),reading=validateCoupledReview(p);p.world.review.state.food=999;
 assert.equal(await serializeCoupledReview(await reading),plain);
 const encoded=JSON.parse(await encodeCoupledReview(trial));for(const change of [p=>p.uncompressedBytes--,p=>p.schemaVersion=2,p=>p.format='namonaki-world-save',p=>p.encoding='other',p=>p.extra=1]){const bad=structuredClone(encoded);change(bad);await assert.rejects(()=>decodeCoupledReview(JSON.stringify(bad)));}
 for(const change of [p=>p.receipts[0].pop(),p=>p.phases[0].pop(),p=>p.storageEncoding='unknown',p=>p.extra=1]){const bad=JSON.parse(plain);change(bad);await recommit(bad);await assert.rejects(()=>validateCoupledReview(bad));}
});

test('read-only projection uses the same scene components and preserves past B output',async()=>{
 const baseline=advanceCoupledReview(await createCoupledReview(save,'baseline'),700),b=advanceGeneratedBridgeReview(initial,700,'automatic');
 for(const year of [0,100,575,615,700])for(let site=0;site<3;site++)assert.deepEqual(observeCoupledScene(baseline,year,site),observeGeneratedSceneReview(b,year,site));
 assert.throws(()=>observeCoupledScene(trial,701));
});

test('native reader can load and rewrite with C2 writers, climate producers and irrigation search blocked',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'coupled-read-')),file=join(dir,'trial.json');await writeFile(file,plain);
 const code=`import{registerHooks}from'node:module';import{readFileSync}from'node:fs';
 registerHooks({resolve(s,c,n){const r=n(s,c);if(/(coupled-progression-v1|annual-baseline-internal|environment\\/progression-v1|vegetation\\/initial-v1|terrain\\/world-prototype)\\.js$/.test(r.url))throw Error('blocked producer '+r.url);return r;},load(u,c,n){const r=n(u,c);if(u.endsWith('/irrigation/geometry-v1.js')||u.endsWith('/engine/rng.js')){const s=typeof r.source==='string'?r.source:Buffer.from(r.source).toString('utf8'),m=u.endsWith('/engine/rng.js')?s.replace(/next\\(\\) \\{/,'$& throw Error("blocked RNG advance");'):s.replace(/export function proposeIrrigation\\([^\\n]+\\) \\{/,'$& throw Error("blocked intake search");');if(m===s)throw Error('missing reader guard');return {...r,source:m};}return r;}});
 const{decodeCoupledReview,serializeCoupledReview}=await import(${JSON.stringify(new URL('../dist/irrigation/coupled-storage-v1.js',import.meta.url).href)});const t=await decodeCoupledReview(readFileSync(${JSON.stringify(file)},'utf8'));if(await serializeCoupledReview(t)!==readFileSync(${JSON.stringify(file)},'utf8'))throw Error('changed');console.log(t.confirmedThrough);`;
 assert.match(execFileSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'}),/700/);
});
