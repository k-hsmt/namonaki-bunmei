import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createNewEconomicWorld} from '../dist/story/new-world.js';
import {introduceTerrainProduction,advanceTerrainProductionWorld} from '../dist/terrain/terrain-production-progression-v1.js';
import {prepareTerrainProductionSave} from '../dist/terrain/terrain-production-storage-v1.js';
import {validateTerrainProductionSave,restoreTerrainProductionSave} from '../dist/terrain/terrain-production-history-v1.js';
import {terrainRevisionHash} from '../dist/terrain/terrain-revision-wire-v1.js';
import {prepareEconomicProductionSave} from '../dist/irrigation/economic-production-storage-v1.js';
import {parseWorldSaveAsync,validateWorldSave,serializeWorldSave,TERRAIN_WORLD_SAVE_KEY,ECONOMIC_WORLD_SAVE_KEY} from '../dist/story/world-save.js';
import {encodeWorldSave,decodeWorldSave,storeWorldSave,findWorldSave} from '../dist/story/world-storage.js';
const source=(await createNewEconomicWorld(42)).review,world=await advanceTerrainProductionWorld(await introduceTerrainProduction(source),700,'automatic'),packet=await prepareTerrainProductionSave(world),text=serializeWorldSave(packet);
const rehash=async raw=>{const {payloadHash,...body}=raw;raw.payloadHash=await terrainRevisionHash(body);return raw;};

test('normal writer operates with every public terrain trial module unavailable',()=>{
 const code=String.raw`import{registerHooks}from'node:module';registerHooks({resolve(s,c,n){const r=n(s,c);if(/terrain-trial-(progression|storage|history|owned)-[^/]+\.js$/.test(r.url))throw Error('blocked public terrain trial '+r.url);return r;}});const{createNewEconomicWorld}=await import(NEW_WORLD),{introduceTerrainProduction,advanceTerrainProductionWorld}=await import(PRODUCTION),{prepareTerrainProductionSave}=await import(STORAGE);const w=await advanceTerrainProductionWorld(await introduceTerrainProduction((await createNewEconomicWorld(42)).review),101,'automatic');console.log((await prepareTerrainProductionSave(w)).version+':'+w.terrainHistory.events[0].ruleId);`;
 const script=code.replace('NEW_WORLD',JSON.stringify(new URL('../dist/story/new-world.js',import.meta.url).href)).replace('PRODUCTION',JSON.stringify(new URL('../dist/terrain/terrain-production-progression-v1.js',import.meta.url).href)).replace('STORAGE',JSON.stringify(new URL('../dist/terrain/terrain-production-storage-v1.js',import.meta.url).href));assert.equal(execFileSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'}).trim(),'8:terrain-cut-v1');
});

test('normal v8 plain/gzip dispatch retains the complete recorded world and rejects mixed contracts',async()=>{
 assert.equal(validateWorldSave(packet),packet);assert.throws(()=>validateWorldSave(JSON.parse(text)),/asynchronous/);
 assert.deepEqual(await parseWorldSaveAsync(text),packet);const encoded=await encodeWorldSave(packet);assert.equal(JSON.parse(encoded.json).version,8);assert.deepEqual(await decodeWorldSave(encoded.json),packet);
 const loaded=restoreTerrainProductionSave(await decodeWorldSave(encoded.json));assert.deepEqual(await prepareTerrainProductionSave(loaded),packet);
 for(const mutate of [e=>e.version=7,e=>e.version=9,e=>e.mode='legacy-fixed',e=>e.uncompressedBytes--]){const e=JSON.parse(encoded.json);mutate(e);await assert.rejects(()=>decodeWorldSave(JSON.stringify(e)));}
 const over=JSON.parse(encoded.json);over.data='x'.repeat(4*1024*1024);await assert.rejects(()=>decodeWorldSave(JSON.stringify(over)),/oversized/);
});

test('native proof detaches before the first hash yield and recomputed hashes cannot hide illegal revisions or policies',async()=>{
 const input=JSON.parse(text),reading=validateTerrainProductionSave(input);input.terrainDevelopment.economicRule.additionalWorkBp=100;input.state.history[0].title='changed after call';assert.deepEqual(await reading,packet);
 for(const mutate of [p=>p.terrainDevelopment.economicRule.additionalWorkBp=1,p=>p.terrainDevelopment.runtimeRules.maxCut=3,p=>p.terrainDevelopment.originPrefix.format='terrain-origin-prefix-v1',p=>p.terrainHistory.events.at(-1).cause.fieldBuiltYear++,p=>p.economicCoupling.receipts[0][13][0]++,p=>p.environment.checkpoints[0].patches['hill-side'][0][2]++,p=>p.landHistory.terrainPolicyBoundary='terrain-change-review-v1',p=>p.terrainHistory.events.at(-1).ruleId='terrain-cut-review-v2']){
  const raw=JSON.parse(text);mutate(raw);await rehash(raw);await assert.rejects(()=>validateTerrainProductionSave(raw));
 }
 const raw=JSON.parse(text),event=raw.terrainHistory.events.at(-1);event.cells[0][8]++;const {revisionId,...body}=event;event.revisionId=await terrainRevisionHash({baseHash:raw.terrainHistory.baseHash,...body});await rehash(raw);await assert.rejects(()=>validateTerrainProductionSave(raw));
});

test('v8 key precedence fails closed, retains old v7 bytes and returns complete export on quota failure',async()=>{
 const old=(await encodeWorldSave(await prepareEconomicProductionSave(source))).json,values=new Map([[ECONOMIC_WORLD_SAVE_KEY,old]]),reads=[];
 assert.equal((await findWorldSave(k=>{reads.push(k);return values.get(k)??null;})).version,7);assert.deepEqual(reads,['namonaki-story-v10','namonaki-story-v9',TERRAIN_WORLD_SAVE_KEY,ECONOMIC_WORLD_SAVE_KEY]);
 assert.deepEqual(await storeWorldSave({setItem:(k,v)=>values.set(k,v)},packet),{status:'saved'});assert.equal(values.get(ECONOMIC_WORLD_SAVE_KEY),old);assert.equal((await findWorldSave(k=>values.get(k)??null)).version,8);
 values.set(TERRAIN_WORLD_SAVE_KEY,'broken');const failedReads=[];await assert.rejects(()=>findWorldSave(k=>{failedReads.push(k);return values.get(k)??null;}));assert.deepEqual(failedReads,['namonaki-story-v10','namonaki-story-v9',TERRAIN_WORLD_SAVE_KEY]);
 const previous=new Map(values),result=await storeWorldSave({setItem:()=>{throw Error('quota');}},packet);assert.equal(result.status,'not-saved');assert.deepEqual(values,previous);assert.deepEqual(await decodeWorldSave(result.exportJson),packet);
});

test('native v8 read/rewrite blocks trial APIs, all progress/new search and RNG advancement',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'terrain-production-native-')),file=join(dir,'world.json');await writeFile(file,text);
 try{
  const code=String.raw`import{registerHooks}from'node:module';import{readFileSync}from'node:fs';
  registerHooks({resolve(s,c,n){const r=n(s,c);if(/(terrain-trial-(progression|storage|history|owned)-[^/]+|terrain-production-progression-v1|terrain-evolution-progression-internal|terrain-cut-(policy-v1|selection-internal)|economic-production-progression-v1|coupled-progression-v1|annual-baseline-internal|environment\/progression-v1|vegetation\/initial-v1|terrain\/world-prototype|story\/new-world)\.js$/.test(r.url))throw Error('blocked producer/trial '+r.url);return r;},load(u,c,n){const r=n(u,c);let s=typeof r.source==='string'?r.source:Buffer.from(r.source).toString('utf8'),m=s;
  if(u.endsWith('/engine/rng.js'))m=m.replace(/next\(\) \{/,'$& throw Error("blocked RNG next");');
  if(u.endsWith('/irrigation/geometry-v1.js'))m=m.replace(/export function proposeIrrigation\([^\n]+\) \{/,'$& throw Error("blocked water search");');
  if(u.endsWith('/terrain/placement-search-review.js'))m=m.replace(/export function findPlacementReview\([^\n]+\) \{/,'$& throw Error("blocked placement search");');
  if(u.endsWith('/terrain/terrain-earthwork-v1.js'))m=m.replace(/export async function proposeTerrainCut\([^\n]+\) \{/,'$& throw Error("blocked cut proposal");').replace(/export function commitTerrainCut\([^\n]+\) \{/,'$& throw Error("blocked cut commit");');
  if(['/engine/rng.js','/irrigation/geometry-v1.js','/terrain/placement-search-review.js','/terrain/terrain-earthwork-v1.js'].some(x=>u.endsWith(x))&&m===s)throw Error('Missing native guard '+u);if(u.endsWith('/terrain/terrain-earthwork-v1.js')&&(!m.includes('blocked cut proposal')||!m.includes('blocked cut commit')))throw Error('Missing cut guards');return m===s?r:{...r,source:m};}});
  const{decodeWorldSave}=await import(WORLD_STORAGE),{restoreTerrainProductionSave}=await import(PRODUCTION_HISTORY),{prepareTerrainProductionSave}=await import(PRODUCTION_STORAGE);const packet=await decodeWorldSave(readFileSync(process.argv[1],'utf8'));console.log((await prepareTerrainProductionSave(restoreTerrainProductionSave(packet))).payloadHash);`;
  const script=code.replace('WORLD_STORAGE',JSON.stringify(new URL('../dist/story/world-storage.js',import.meta.url).href)).replace('PRODUCTION_HISTORY',JSON.stringify(new URL('../dist/terrain/terrain-production-history-v1.js',import.meta.url).href)).replace('PRODUCTION_STORAGE',JSON.stringify(new URL('../dist/terrain/terrain-production-storage-v1.js',import.meta.url).href));
  assert.equal(execFileSync(process.execPath,['--input-type=module','-e',script,file],{encoding:'utf8'}).trim(),packet.payloadHash);
 }finally{await rm(dir,{recursive:true,force:true});}
});
