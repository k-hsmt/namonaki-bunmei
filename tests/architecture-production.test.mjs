/** Issue #35 D2-b1: v9 architecture layer over v8 — births, invariance, determinism, persistence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewTerrainWorld} from '../dist/story/new-world.js';
import {advanceTerrainProductionWorld} from '../dist/terrain/terrain-production-progression-v1.js';
import {prepareTerrainProductionSave} from '../dist/terrain/terrain-production-storage-v1.js';
import * as P from '../dist/architecture/production-v1.js';

const SEED=7,YEARS=900;
const fresh=async()=>(await createNewTerrainWorld(SEED)).review;
let bulk,plain;
const ready=(async()=>{
 const w=P.introduceArchitectureProduction(await fresh());
 bulk=await P.advanceArchitectureWorld(w,YEARS,'automatic');
 plain=await advanceTerrainProductionWorld(await fresh(),YEARS,'automatic');
})();

test('D2-b1: 建築の層はv8の歴史を一切変えない（同じseedのv8と保存内容が完全一致）',async()=>{
 await ready;
 assert.equal((await prepareTerrainProductionSave(bulk.terrain)).payloadHash,(await prepareTerrainProductionSave(plain)).payloadHash);
});

test('D2-b1: 確定した建設1件に記録がちょうど1件（施設はfield以外、住宅はbuilt/expanded）、年0の家を含む',async()=>{
 await ready;
 const r=bulk.terrain.review,births=bulk.architecture.births;
 const facilities=r.placements.filter(p=>p.kind!=='field');
 const housing=(r.state.housing?.events??[]).filter(e=>e.kind==='built'||e.kind==='expanded');
 assert.equal(births.length,facilities.length+housing.length);
 for(const p of facilities)assert.equal(births.filter(b=>b.ref.kind==='facility'&&b.ref.id===p.objectId).length,1,p.objectId);
 for(const e of housing)assert.equal(births.filter(b=>b.ref.kind==='housing'&&b.ref.blockId===e.blockId&&b.source.year===e.year&&b.source.seq===e.seq).length,1,e.blockId);
 assert.ok(births.some(b=>b.source.year===0&&b.ref.kind==='facility'&&b.use==='house'),'year-0 houses have births');
 assert.ok(!births.some(b=>b.ref.kind==='facility'&&r.placements.find(p=>p.objectId===b.ref.id)?.kind==='field'));
 for(let i=1;i<births.length;i++)assert.ok(births[i-1].source.year<=births[i].source.year,'ordered by year');
});

test('D2-b1: 一括進行と分割進行で、v8と建築の記録が一致する',async()=>{
 await ready;
 let w=P.introduceArchitectureProduction(await fresh());
 for(let done=0;done<YEARS;){const step=Math.min(YEARS-done,137);w=await P.advanceArchitectureWorld(w,step,'automatic');done+=step;}
 assert.equal(JSON.stringify(w.architecture),JSON.stringify(bulk.architecture));
 assert.equal((await prepareTerrainProductionSave(w.terrain)).payloadHash,(await prepareTerrainProductionSave(bulk.terrain)).payloadHash);
});

test('D2-b1: 過去の記録は後の地形・進行で変わらない（建設年の地形で決まる）',async()=>{
 await ready;
 const later=await P.advanceArchitectureWorld(bulk,600,'automatic');
 const n=bulk.architecture.births.length;
 assert.equal(JSON.stringify(later.architecture.births.slice(0,n)),JSON.stringify(bulk.architecture.births));
 // full recompute from the later world reproduces the earlier births as well
 assert.equal(JSON.stringify(P.expectedArchitectureLedger(later.terrain).births.slice(0,n)),JSON.stringify(bulk.architecture.births));
});

test('D2-b1: 新規世界の年0でだけ導入でき、所有していない世界は拒否する',async()=>{
 await ready;
 assert.throws(()=>P.introduceArchitectureProduction(plain),/year 0/);
 await assert.rejects(P.advanceArchitectureWorld({...bulk},10),/owned or validated/);
});

test('D2-b1: 進行に失敗しても元の世界は変わらない',async()=>{
 await ready;
 const before=JSON.stringify(bulk.architecture);
 await assert.rejects(P.advanceArchitectureWorld(bulk,-1));
 await assert.rejects(P.advanceArchitectureWorld(bulk,20000));
 assert.equal(JSON.stringify(bulk.architecture),before);
 assert.ok(Object.isFrozen(bulk)&&Object.isFrozen(bulk.architecture.births));
});

test('D2-b1: v9の保存は読み込みで全件を再計算して照合し、改竄・欠落・重複・余分を拒否する',async()=>{
 await ready;
 const json=JSON.stringify(await P.prepareArchitectureSave(bulk));
 const back=P.restoreArchitectureSave(await P.validateArchitectureSave(JSON.parse(json)));
 assert.equal(JSON.stringify(back.architecture),JSON.stringify(bulk.architecture));
 assert.equal((await prepareTerrainProductionSave(back.terrain)).payloadHash,(await prepareTerrainProductionSave(bulk.terrain)).payloadHash);
 const mutate=async f=>{const d=JSON.parse(json);f(d);return P.validateArchitectureSave(d);};
 await assert.rejects(mutate(d=>{d.architecture.births[1].features.window=d.architecture.births[1].features.window==='W1'?'W2':'W1';}),/does not match/);
 await assert.rejects(mutate(d=>{d.architecture.births.pop();}),/does not match/);
 await assert.rejects(mutate(d=>{d.architecture.births.push(d.architecture.births[0]);}),/does not match/);
 await assert.rejects(mutate(d=>{d.architecture.births.reverse();}),/does not match/);
 await assert.rejects(mutate(d=>{d.architecture.traditions[0].choices.palette='P05';d.architecture.traditions[1].choices.palette='P05';d.architecture.traditions[2].choices.palette='P05';}),/does not match/);
 await assert.rejects(mutate(d=>{d.architecture.births[0].features.roofFamily='R07';}),/does not match/);
 await assert.rejects(mutate(d=>{d.extra=1;}),/unknown v9 contract/);
 await assert.rejects(mutate(d=>{d.version=8;}),/unknown v9 contract/);
 await assert.rejects(mutate(d=>{d.world.state.year+=1;}));
 await assert.rejects(P.validateArchitectureSave(null),/object/);
});

// ---- listConstructions on synthetic records (civic halls and expansions are rare in short natural runs) ----
const fake=({placements=[],buildingChanges=[[],[],[]],events=[]})=>({review:{placements,state:{observation:{sites:buildingChanges.map(c=>({buildingChanges:c}))},housing:{events}}}});
const plot={x:10,y:120,width:18,depth:7};
const block=(id,count,style='terraced')=>({blockId:id,siteId:'river-bank',footprint:{x:40,y:140,width:18,depth:8},builtYear:5,housingCount:count,condition:'sound',use:'occupied',styleId:style,styleSeed:1});

test('D2-b1: 共同建築は施設の記録に civic 属性として付き、建設出典が一致しなければ拒否する',()=>{
 const civic={id:'civic-river-bank-40-great-hall',kind:'hall',x:1,y:1,builtYear:40,condition:'intact',civic:{architectureStyle:'great-hall',footprint:plot,constructionRecordId:'40-9'}};
 const ok=fake({placements:[{objectId:civic.id,site:'river-bank',kind:'civic',plot,entrance:[1,1],builtYear:40,sourceRecordId:'40-9'}],buildingChanges:[[{year:40,building:civic}],[],[]]});
 const [c]=P.listConstructions(ok);
 assert.equal(c.use,'hall');assert.deepEqual(c.ref.civic,{style:'great-hall',constructionRecordId:'40-9'});
 const bad=fake({placements:[{objectId:civic.id,site:'river-bank',kind:'civic',plot,entrance:[1,1],builtYear:40,sourceRecordId:'40-8'}],buildingChanges:[[{year:40,building:civic}],[],[]]});
 assert.throws(()=>P.listConstructions(bad),/civic construction source mismatch/);
 assert.throws(()=>P.listConstructions(fake({placements:[{objectId:'x',site:'river-bank',kind:'civic',plot,entrance:[1,1],builtYear:40,sourceRecordId:'40-9'}]})),/without a civic hall/);
});

test('D2-b1: 施設の建設年は集落の台帳の初出の年と一致しなければ拒否する。fieldは対象外',()=>{
 const house={id:'river-bank-0',kind:'house',x:1,y:1,builtYear:0,condition:'intact'};
 const place=(year)=>({objectId:'river-bank-0',site:'river-bank',kind:'house',plot,entrance:[1,1],builtYear:year,sourceRecordId:'0-0'});
 assert.equal(P.listConstructions(fake({placements:[place(0),{...place(0),objectId:'f',kind:'field'}],buildingChanges:[[{year:0,building:house},{year:30,building:{...house,condition:'damaged'}}],[],[]]})).length,1);
 assert.throws(()=>P.listConstructions(fake({placements:[place(5)],buildingChanges:[[{year:0,building:house}],[],[]]})),/first recorded in 0/);
});

test('D2-b1/§3.4.1: 増築は増えた部品番号の範囲で記録し、順序の矛盾は拒否する',()=>{
 const ev=(year,seq,kind,count)=>({year,seq,kind,blockId:'b1',after:block('b1',count)});
 const list=P.listConstructions(fake({events:[ev(5,0,'built',3),ev(9,0,'damaged',3),ev(20,1,'expanded',5),ev(31,0,'expanded',6)]}));
 assert.deepEqual(list.map(c=>[c.source.kind,c.ref.parts.from,c.ref.parts.to,c.use]),[['built',0,3,'rowhouse'],['expanded',3,5,'rowhouse'],['expanded',5,6,'rowhouse']]);
 assert.throws(()=>P.listConstructions(fake({events:[ev(20,0,'expanded',5)]})),/out of order/);
 assert.throws(()=>P.listConstructions(fake({events:[ev(5,0,'built',3),ev(9,0,'built',4)]})),/out of order/);
 assert.throws(()=>P.listConstructions(fake({events:[ev(5,0,'built',3),ev(9,0,'expanded',3)]})),/out of order/);
});

test('D2-b1/§5.3: 同じ年の建設は 地区→施設→住宅→ID→seq の順に固定する',()=>{
 const house=(site,id)=>({objectId:id,site,kind:'house',plot,entrance:[1,1],builtYear:50,sourceRecordId:'50-'+id});
 const ev={year:50,seq:0,kind:'built',blockId:'a-block',after:{...block('a-block',2,'low'),siteId:'river-bank'}};
 const list=P.listConstructions(fake({placements:[house('coast-inlet','c'),house('river-bank','z'),house('river-bank','a')],events:[ev]}));
 assert.deepEqual(list.map(c=>c.ref.kind==='facility'?c.ref.id:c.ref.blockId),['a','z','a-block','c']);
});
