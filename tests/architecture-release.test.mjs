/** Issue #35 D2-d/D3 release (v0.7): the normal new world is v9; existing saves keep their own version. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNewArchitectureWorld,createNewTerrainWorld} from '../dist/story/new-world.js';
import {advanceWorldSession,advanceWorldSessionAsync,chooseWorldSessionAsync,prepareWorldSessionSave,restoreWorldSession,improveWorldEnvironment,slowWorldClimate,enableWorldTerrainDevelopment,worldTerrainDevelopmentAtYear,observeGeneratedWorldSession} from '../dist/story/world-session.js';
import {ARCHITECTURE_WORLD_SAVE_KEY,TERRAIN_WORLD_SAVE_KEY,parseWorldSaveAsync,serializeWorldSave,validateWorldSave} from '../dist/story/world-save.js';
import {encodeWorldSave,decodeWorldSave,findWorldSave,storeWorldSave,higherPriorityWorldSaveKeys} from '../dist/story/world-storage.js';
import {prepareTerrainProductionSave} from '../dist/terrain/terrain-production-storage-v1.js';

const v9=await createNewArchitectureWorld(42),v8=await createNewTerrainWorld(42);

test('release: 新しい世界はv9で、同じseedのv8と社会・地形が同じ',async()=>{
 assert.equal(v9.architecture.format,'architecture-production-world-v1');
 assert.equal(v9.review,v9.architecture.terrain);assert.equal(v9.state,v9.review.review.state);
 assert.equal((await prepareTerrainProductionSave(v9.review)).payloadHash,(await prepareTerrainProductionSave(v8.review)).payloadHash);
 for(let site=0;site<3;site++)assert.deepEqual(observeGeneratedWorldSession(v9,0,site).snapshot,observeGeneratedWorldSession(v8,0,site).snapshot);
 assert.deepEqual(worldTerrainDevelopmentAtYear(v9,0),worldTerrainDevelopmentAtYear(v8,0));
 // explicit opt-ins never drop the architecture record
 for(const f of [improveWorldEnvironment,slowWorldClimate])assert.equal(f(v9),v9);
 assert.equal(await enableWorldTerrainDevelopment(v9),v9);
});

test('release: v9の進行と選択はv9のまま、v8と同じ歴史をたどる',async()=>{
 assert.throws(()=>advanceWorldSession(v9),/asynchronous/);
 let a=v9,b=v8;
 for(let i=0;i<40;i++){
  if(a.state.pending){a=await chooseWorldSessionAsync(a,'random');b=await chooseWorldSessionAsync(b,'random');}
  else{a=await advanceWorldSessionAsync(a);b=await advanceWorldSessionAsync(b);}
  assert.ok(a.architecture,'still v9');assert.equal(a.state.year,b.state.year);
 }
 assert.ok(a.state.year>0);
 assert.equal((await prepareTerrainProductionSave(a.review)).payloadHash,(await prepareTerrainProductionSave(b.review)).payloadHash);
 assert.equal(a.architecture.architecture.interaction.confirmedThrough>=a.state.year-1,true);
});

test('release: v9の保存は専用の場所に入り、最初に読まれ、圧縮しても元に戻る',async()=>{
 const packet=await prepareWorldSessionSave(v9);
 assert.equal(packet.version,9);assert.equal(validateWorldSave(packet),packet);
 const encoded=await encodeWorldSave(packet);assert.notEqual(encoded.json,encoded.plain,'compressed');
 const back=restoreWorldSession(await decodeWorldSave(encoded.json));assert.ok(back.architecture);
 assert.deepEqual(await prepareWorldSessionSave(back),packet);
 assert.deepEqual(await prepareWorldSessionSave(restoreWorldSession(await parseWorldSaveAsync(serializeWorldSave(packet)))),packet,'JSON export / file import');
 const data=new Map(),v8packet=await prepareWorldSessionSave(v8);
 await storeWorldSave({setItem:(k,v)=>data.set(k,v)},v8packet);
 await storeWorldSave({setItem:(k,v)=>data.set(k,v)},packet);
 assert.deepEqual([...data.keys()].sort(),[ARCHITECTURE_WORLD_SAVE_KEY,TERRAIN_WORLD_SAVE_KEY].sort());
 assert.equal((await findWorldSave(k=>data.get(k)??null)).version,9);
 assert.deepEqual(higherPriorityWorldSaveKeys(packet),[]);
 assert.deepEqual(higherPriorityWorldSaveKeys(v8packet),[ARCHITECTURE_WORLD_SAVE_KEY],'saving an opened v8 world makes it the one found next');
 // an external v9 packet must go through the asynchronous reader
 assert.throws(()=>validateWorldSave(JSON.parse(JSON.stringify(packet))),/asynchronous/);
});

test('release: 既存のv8の保存はv8のまま開き、変換しない',async()=>{
 const packet=await prepareWorldSessionSave(v8),back=restoreWorldSession(await decodeWorldSave((await encodeWorldSave(packet)).json));
 assert.equal(back.architecture,undefined);assert.equal((await prepareWorldSessionSave(back)).version,8);
 assert.equal((await advanceWorldSessionAsync(back)).architecture,undefined);
});

test('release: 通常画面は新しい世界をv9で作り、版（v0.9）と説明を表示する',async()=>{
 const main=await readFile('src/main.ts','utf8'),html=await readFile('index.html','utf8');
 assert.equal((main.match(/createNewArchitectureWorld/g)??[]).length,3);assert.ok(!main.includes('createNewTerrainWorld'));
 assert.ok(html.includes('A LIFE OF A CIVILIZATION · v0.9')&&html.includes('名もなき文明 / v0.9')&&!html.includes('v0.8')&&!html.includes('v0.7'),'D5: v0.9');
 assert.ok(html.includes('廃墟になった建物は、暮らしが戻るとその土地で建て直され、もとの様式で再現されることも、その時の様式や新しい技術で建て直されることもあります。'));
 assert.ok(html.includes('建物は建った年の伝統で建ち、その後に伝統が変わっても姿は変わりません。'));
});

test('release: v9の保存は、歴史を進めるコードを読み込まずに読める',async()=>{
 const packet=await prepareWorldSessionSave(await advanceWorldSessionAsync(v9)),dir=await mkdtemp(join(tmpdir(),'architecture-native-')),file=join(dir,'world.json');
 await writeFile(file,(await encodeWorldSave(packet)).json);
 try{
  const code=String.raw`import{registerHooks}from'node:module';import{readFileSync}from'node:fs';
  registerHooks({resolve(s,c,n){const r=n(s,c);if(/(terrain-production-progression-v1|terrain-evolution-progression-internal|economic-production-progression-v1|annual-baseline-internal|environment\/progression-v1|vegetation\/initial-v1|terrain\/world-prototype|story\/new-world)\.js$/.test(r.url))throw Error('blocked producer '+r.url);return r;}});
  const{decodeWorldSave}=await import(WORLD_STORAGE),{restoreArchitectureSave,prepareArchitectureSave}=await import(PRODUCTION);const p=await decodeWorldSave(readFileSync(process.argv[1],'utf8'));console.log(JSON.stringify(await prepareArchitectureSave(restoreArchitectureSave(p))).length);`;
  const script=code.replace('WORLD_STORAGE',JSON.stringify(new URL('../dist/story/world-storage.js',import.meta.url).href)).replace('PRODUCTION',JSON.stringify(new URL('../dist/architecture/production-v1.js',import.meta.url).href));
  assert.equal(Number(execFileSync(process.execPath,['--input-type=module','-e',script,file],{encoding:'utf8'}).trim()),JSON.stringify(packet).length);
 }finally{await rm(dir,{recursive:true,force:true});}
});
