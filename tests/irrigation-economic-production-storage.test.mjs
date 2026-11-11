import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import{execFileSync}from'node:child_process';
import {createNewIrrigatedWorld} from '../dist/story/new-world.js';
import {advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
import {createGeneratedWorldSave,serializeWorldSave,parseWorldSaveAsync,validateWorldSave,ECONOMIC_WORLD_SAVE_KEY,IRRIGATED_WORLD_SAVE_KEY} from '../dist/story/world-save.js';
import {encodeWorldSave,decodeWorldSave,findWorldSave,storeWorldSave} from '../dist/story/world-storage.js';
import {introduceEconomicProduction,advanceEconomicProductionWorld,chooseEconomicProductionWorld} from '../dist/irrigation/economic-production-progression-v1.js';
import {prepareEconomicProductionSave,parseEconomicProductionSave} from '../dist/irrigation/economic-production-storage-v1.js';
import {restoreEconomicProductionSave,validateEconomicProductionSave} from '../dist/irrigation/economic-production-history-v1.js';
import {reviewBaseHash} from '../dist/irrigation/wire-v1.js';
const initial=createNewIrrigatedWorld(42).review,root=await introduceEconomicProduction(initial),world=advanceEconomicProductionWorld(root,700,'automatic'),save=await prepareEconomicProductionSave(world),plain=serializeWorldSave(save);
const recommit=async p=>{const {payloadHash:_,...payload}=p;p.payloadHash=await reviewBaseHash(payload);return p;};
const persisted=async w=>serializeWorldSave(await prepareEconomicProductionSave(w));
test('v7 plain/gzip readers and continuation preserve every persisted value',async()=>{
 assert.equal(save.version,7);assert.equal(save.economicCoupling.originPrefix.format,'economy-origin-prefix-v1');
 assert.throws(()=>validateWorldSave(JSON.parse(plain)),/asynchronous/);
 for(const loaded of [await parseWorldSaveAsync(plain),await decodeWorldSave((await encodeWorldSave(save)).json)]){
  assert.ok(serializeWorldSave(loaded)===plain);const restored=restoreEconomicProductionSave(loaded);
  assert.ok(await persisted(advanceEconomicProductionWorld(restored,100,'automatic'))===await persisted(advanceEconomicProductionWorld(world,100,'automatic')));
 }
 const partial=advanceEconomicProductionWorld(root,675,'automatic'),resumed=advanceEconomicProductionWorld(restoreEconomicProductionSave(await decodeWorldSave((await encodeWorldSave(await prepareEconomicProductionSave(partial))).json)),25,'automatic');
 assert.ok(await persisted(resumed)===plain);
});
test('unaligned origins reconstruct the exact old prefix and do not rewrite prior history',async()=>{
 for(const year of [0,99,100,575]){
  const b=advanceGeneratedBridgeReview(initial,year,'automatic'),w=advanceEconomicProductionWorld(await introduceEconomicProduction(b),125,'automatic'),p=await prepareEconomicProductionSave(w),loaded=restoreEconomicProductionSave(await parseEconomicProductionSave(JSON.stringify(p)));
  assert.ok(await persisted(loaded)===JSON.stringify(p));assert.equal(loaded.economicCoupling.introducedYear,year);
  assert.equal(loaded.economicCoupling.originPrefix.template.state.history.count,b.review.state.history.length);
 }
});
test('pending gzip saves preserve prepared effects and support mixed manual and automatic continuation',async()=>{
 const held=advanceEconomicProductionWorld(root,1000,'stop'),loaded=restoreEconomicProductionSave(await decodeWorldSave((await encodeWorldSave(await prepareEconomicProductionSave(held))).json));
 assert.deepEqual(loaded.economicCoupling.prepared,held.economicCoupling.prepared);
 const manual=chooseEconomicProductionWorld(loaded,0),mixed=advanceEconomicProductionWorld(manual,250,'automatic'),read=restoreEconomicProductionSave(await parseEconomicProductionSave(await persisted(mixed)));
 assert.ok(await persisted(read)===await persisted(mixed));assert.equal(read.economicCoupling.phases.find(p=>p.phase==='manual-choice').draws,0);
});
test('v7 reader rejects recomputed-checksum tampering in coefficients, sources, phases and history',async()=>{
 const changes=[p=>p.version=6,p=>p.economicCoupling.policy='yield-only',p=>p.economicCoupling.formula.builtBp++,p=>p.economicCoupling.receipts[600][10]++,p=>p.economicCoupling.receipts[100][12][0][0]++,p=>p.economicCoupling.checkpoints[0].economy.districts[0].reserve++,p=>p.economicCoupling.phases[0][5]++,p=>p.economicCoupling.phases.find(r=>r[0]===1)[10]++,p=>p.economicCoupling.originPrefix.template.state.history.count++,p=>p.irrigation.systems[0].geometry.path[0][0]++,p=>p.irrigation.attempts[0].cause={kind:'controlled-input',inputId:'fake'},p=>p.economicCoupling.originPending=true,p=>p.economicCoupling.receipts[0].pop(),p=>p.economicCoupling.extra=1];
 for(const [i,change]of changes.entries()){const p=JSON.parse(plain);change(p);await recommit(p);await assert.rejects(()=>validateEconomicProductionSave(p),'mutation '+i);}
 const p=JSON.parse(plain);p.state.food++;await assert.rejects(()=>validateEconomicProductionSave(p),/commitment/);
 const changed=JSON.parse(plain),reading=validateEconomicProductionSave(changed);changed.state.food=999;assert.ok(serializeWorldSave(await reading)===plain);
});
test('versioned discovery stops on corrupt v7 and v7 writes preserve the old key',async()=>{
 const old=JSON.stringify(createGeneratedWorldSave(initial)),data=new Map([[IRRIGATED_WORLD_SAVE_KEY,old]]);
 await storeWorldSave({setItem:(k,v)=>data.set(k,v)},save);assert.equal(data.get(IRRIGATED_WORLD_SAVE_KEY),old);assert.ok(data.has(ECONOMIC_WORLD_SAVE_KEY));assert.equal((await findWorldSave(k=>data.get(k)??null)).version,7);
 await assert.rejects(()=>findWorldSave(k=>k==='namonaki-story-v9'||k==='namonaki-story-v8'?null:k===ECONOMIC_WORLD_SAVE_KEY?'broken':old));
 const failed=await storeWorldSave({setItem(){throw Error('quota');}},save);assert.equal(failed.status,'not-saved');assert.ok(failed.exportJson===plain);
 const envelope=JSON.parse((await encodeWorldSave(save)).json);for(const mutate of [p=>p.version=6,p=>p.mode='legacy-fixed',p=>p.uncompressedBytes--,p=>p.extra=1]){const bad=structuredClone(envelope);mutate(bad);await assert.rejects(()=>decodeWorldSave(JSON.stringify(bad)));}
});
test('native v7 reader and rewrite run with writers, climate producers, search and RNG advance blocked',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'economic-read-')),file=join(dir,'world.json');await writeFile(file,plain);
 const code=`import{registerHooks}from'node:module';import{readFileSync}from'node:fs';
 registerHooks({resolve(s,c,n){const r=n(s,c);if(/(economic-production-progression-v1|coupled-progression-v1|annual-baseline-internal|environment\\/progression-v1|vegetation\\/initial-v1|terrain\\/world-prototype)\\.js$/.test(r.url))throw Error('blocked producer '+r.url);return r;},load(u,c,n){const r=n(u,c);if(u.endsWith('/irrigation/geometry-v1.js')||u.endsWith('/engine/rng.js')){const s=typeof r.source==='string'?r.source:Buffer.from(r.source).toString('utf8'),m=u.endsWith('/engine/rng.js')?s.replace(/next\\(\\) \\{/,'$& throw Error("blocked RNG advance");'):s.replace(/export function proposeIrrigation\\([^\\n]+\\) \\{/,'$& throw Error("blocked intake search");');if(m===s)throw Error('missing reader guard');return {...r,source:m};}return r;}});
 const{parseEconomicProductionSave,prepareEconomicProductionSave}=await import(${JSON.stringify(new URL('../dist/irrigation/economic-production-storage-v1.js',import.meta.url).href)});const{restoreEconomicProductionSave}=await import(${JSON.stringify(new URL('../dist/irrigation/economic-production-history-v1.js',import.meta.url).href)});const p=await parseEconomicProductionSave(readFileSync(${JSON.stringify(file)},'utf8')),w=restoreEconomicProductionSave(p);if(JSON.stringify(await prepareEconomicProductionSave(w))!==readFileSync(${JSON.stringify(file)},'utf8'))throw Error('changed');console.log(w.economicCoupling.confirmedThrough);`;
 assert.match(execFileSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'}),/700/);
});
