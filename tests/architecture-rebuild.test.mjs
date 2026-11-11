/** Issue #35 D4-a: rebuilding at v8's recovery of ruins (architecture-rebuild-v1, Human decision A). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import * as P from '../dist/architecture/production-v1.js';
import * as R from '../dist/architecture/rebuild-v1.js';
import {createArchitecturePainter} from '../dist/architecture/scene-v1.js';

const SEED=7,YEARS=3000;
let world;
const ready=(async()=>{world=await P.advanceArchitectureWorld((await createNewArchitectureWorld(SEED)).architecture,YEARS,'automatic');})();
const keyOf=b=>b.ref.kind==='facility'?b.ref.id:b.ref.blockId;

test('D4-a: 建て直しは、v8で廃墟から立ち直った建物だけ（施設の再利用・住宅の廃墟からの修繕）。損傷からの修繕は含めない',async()=>{
 await ready;
 const a=world.architecture,state=world.terrain.review.state,records=new Map(state.history.map(h=>[h.id,h]));
 assert.equal(a.schemaVersion,7);assert.equal(a.rebuild,R.REBUILD_ID);
 const rebuilt=a.births.filter(b=>b.source.kind==='rebuilt');
 assert.ok(rebuilt.length>0);
 for(const b of rebuilt){
  const rec=records.get(b.source.recordId),ruin=records.get(b.rebuild.ruinRecordId);
  assert.ok(rec&&ruin,'both v8 records exist');assert.equal(rec.year,b.source.year);assert.ok(ruin.year<rec.year);
  if(b.ref.kind==='facility'){assert.equal(rec.kind,'building-reused');assert.equal(ruin.kind,'building-abandoned');}
  else{assert.equal(rec.kind,'housing-repaired');assert.equal(ruin.kind,'housing-ruined');assert.equal(b.ref.parts.from,0);}
  assert.equal(rec.buildingId,keyOf(b));
 }
 // every reused building (not field/bridge) and every ruin-repaired block is rebuilt exactly once per recovery
 const kinds=new Map(state.observation.sites.flatMap(l=>l.buildingChanges).map(c=>[c.building.id,c.building.kind]));
 const reused=state.history.filter(h=>h.kind==='building-reused'&&!['field','bridge'].includes(kinds.get(h.buildingId)));
 assert.equal(rebuilt.filter(b=>b.ref.kind==='facility').length,reused.length);
 const repairsOfDamage=state.history.filter(h=>h.kind==='building-repaired').map(h=>h.id);
 assert.ok(!rebuilt.some(b=>repairsOfDamage.includes(b.source.recordId)),'repairs of damage keep the building');
 // generations count up per building
 const gens=new Map();for(const b of rebuilt){const k=keyOf(b),g=(gens.get(k)??1)+1;assert.equal(b.rebuild.generation,g);gens.set(k,g);}
});

test('D4-a: 様式は「古い様式・その時の様式・混合」。古い様式は前の世代をそのまま、混合は構造・壁・基礎を受け継ぐ',async()=>{
 await ready;
 const births=world.architecture.births,prev=new Map(),seen={old:0,current:0,mixed:0};
 for(const b of births){
  const k=(b.ref.kind==='facility'?'F:':'H:')+keyOf(b);
  if(b.rebuild){
   const p=prev.get(k),mode=b.adjustments.find(x=>/^rebuild:(old|current|mixed)$/.test(x)).slice(8);seen[mode]++;
   assert.ok(p,'a previous generation exists');
   const lost=b.adjustments.some(x=>x.endsWith('-technology-lost'));
   if(mode==='old'&&!b.substitutions.length)assert.deepEqual(b.features,p.features,'old reproduces the previous generation');
   if(mode==='mixed')for(const axis of ['structure','wall'])assert.equal(b.features[axis],p.features[axis]);
   assert.equal(lost?'current':b.rebuild.mode,mode);
  }
  if(b.ref.kind==='facility'||b.ref.parts.from===0)prev.set(k,b);
 }
 assert.ok(seen.old>0&&seen.current>0,JSON.stringify(seen));
 // weights: no mixed when the tradition has not moved; more current as it moves
 assert.equal(R.rebuildWeights(0).mixed,0);assert.ok(R.rebuildWeights(5).current>R.rebuildWeights(0).current);
 assert.equal(R.chooseRebuildMode(1,'F:x',100,2),R.chooseRebuildMode(1,'F:x',100,2),'deterministic');
});

test('D4-a: 風景は、その年に建っていた世代の様式で描く（過去の年には前の世代）',async()=>{
 await ready;
 const births=world.architecture.births,painter=createArchitecturePainter(births);
 const b=births.find(x=>x.rebuild&&x.ref.kind==='facility'&&!x.ref.civic&&JSON.stringify(x.features)!==JSON.stringify(births.find(y=>y.ref.kind==='facility'&&y.ref.id===x.ref.id&&y.source.year<x.source.year)?.features));
 assert.ok(b,'a facility rebuilt in a different style');
 const ctx=()=>{const calls=[];return {calls,set fillStyle(v){calls.push(['fill',v]);},get fillStyle(){return '';},fillRect(...a){calls.push(['rect',...a]);},save(){},restore(){},translate(){},scale(){},beginPath(){},rect(){},clip(){}};};
 const o={id:b.ref.id,kind:b.use==='hall'?'hall':b.use,x:100,y:120,builtYear:0,condition:'intact'},plot={x:90,y:120,width:20,depth:8};
 const at=y=>{const c=ctx();painter.facility(c,o,plot,y);return JSON.stringify(c.calls);};
 assert.notEqual(at(b.source.year-1),at(b.source.year),'the generation changes in the rebuild year');
 const next=births.find(x=>x.ref.kind==='facility'&&x.ref.id===b.ref.id&&x.source.year>b.source.year)?.source.year??YEARS+1;
 assert.equal(at(b.source.year),at(next-1),'and stays until the next rebuild or the present');
});

test('D4-a: 読込で建て直しの記録を照合し、改竄を拒否する。進めても記録済みの世代は変わらない',async()=>{
 await ready;
 const json=JSON.stringify(await P.prepareArchitectureSave(world));
 assert.ok(await P.validateArchitectureSave(JSON.parse(json)));
 const mutate=f=>{const d=JSON.parse(json);f(d.architecture);return P.validateArchitectureSave(d);};
 await assert.rejects(mutate(a=>{const b=a.births.find(x=>x.rebuild);b.rebuild.mode=b.rebuild.mode==='old'?'current':'old';}),/does not match/);
 await assert.rejects(mutate(a=>{a.births=a.births.filter(x=>!x.rebuild);}),/does not match/);
 const later=await P.advanceArchitectureWorld(world,200,'automatic');
 const key=b=>JSON.stringify([b.ref,b.source]),now=new Map(later.architecture.births.map(b=>[key(b),JSON.stringify(b)]));
 for(const b of world.architecture.births)assert.equal(now.get(key(b)),JSON.stringify(b));
});

test('D4-c: 年代記には、v8の再利用・修繕の記録の後に「建て直される」を、様式（と技術）とともに出す',async()=>{
 await ready;
 const {architectureProductionSession,worldArchitectureChronicle}=await import('../dist/story/world-session.js');
 const session=architectureProductionSession(world),list=worldArchitectureChronicle(session);
 const rebuilt=world.architecture.births.filter(b=>b.rebuild);
 assert.equal(list.length,rebuilt.length);
 const records=new Map(world.terrain.review.state.history.map(h=>[h.id,h]));
 for(const n of list){
  const r=records.get(n.afterRecordId);assert.ok(r&&['building-reused','housing-repaired'].includes(r.kind));assert.equal(n.year,r.year);
  assert.match(n.title,/が建て直される（(もとの様式で|その時の様式で|もとの造りに、その時の様式を合わせて)(、(大スパンの木造|石造とアーチ|金属とガラス)で)?）$/);
  assert.ok(n.title.startsWith(r.title.replace(/が(再利用|修繕)される$/,'')),n.title);
 }
 assert.equal(worldArchitectureChronicle(session),list,'cached, read-only');
});
