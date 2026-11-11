/** Issue #35 D3-b: regional tradition change every 25 years (architecture-change-v1). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewTerrainWorld} from '../dist/story/new-world.js';
import * as P from '../dist/architecture/production-v1.js';
import * as C from '../dist/architecture/change-v1.js';
import * as I from '../dist/architecture/interaction-v1.js';
import {d2Inconsistencies} from '../dist/architecture/vocab-v1.js';
import {wallFits} from '../dist/architecture/grammar-v1.js';

const SEED=11,YEARS=1300;
let world;
const ready=(async()=>{world=await P.advanceArchitectureWorld(P.introduceArchitectureProduction((await createNewTerrainWorld(SEED)).review),YEARS,'automatic');})();
const inputs=(a,over={})=>({seed:SEED,confirmedThrough:a.interaction.confirmedThrough,grammar:a.grammar,initial:a.traditions,interaction:a.interaction,
 facts:()=>({experience:10,records:['r'],disasters:1}),...over});
const spec=t=>({use:'house',...t.choices,roofFamily:t.shared.roofFamily,eaves:t.shared.eaves,pitch:t.shared.pitch,ornaments:[...t.shared.ornaments]});

test('D3-b: 変化は25年の区切りで決まり、翌年から効き、前に建った建物の様式は変えない',async()=>{
 await ready;
 const a=world.architecture,changes=a.traditionChanges;
 assert.equal(a.schemaVersion,7,'D5');assert.equal(a.change,C.CHANGE_ID);
 assert.ok(changes.length>0,'seed 11 changes within 1300 years');
 for(const c of changes){assert.equal(c.year%C.CHANGE_PERIOD,0);assert.equal(c.effectiveFrom,c.year+1);assert.notEqual(c.from,c.to);}
 const first=changes[0],site=first.site,initial=a.traditions.find(t=>t.siteId===site);
 const value=year=>{const s=spec(C.traditionAt(a.grammar,initial,changes,year))[first.axis];return Array.isArray(s)?[...s].sort().join('+'):String(s);};
 assert.equal(value(first.year),first.from);assert.equal(value(first.effectiveFrom),first.to);
 // the house built in the district reflects the tradition in force in its construction year
 // D4: a rebuild that reproduces the old style (or keeps structure, wall and foundation) keeps the previous values
 const inherits=b=>b.rebuild&&(b.adjustments.includes('rebuild:old')||b.adjustments.includes('rebuild:mixed')&&['structure','wall','foundation'].includes(first.axis));
 const houses=a.births.filter(b=>b.ref.siteId===site&&b.status==='ok'&&b.use==='house'&&!inherits(b)&&!b.adjustments.some(x=>x==='variation:'+first.axis));
 const before=houses.filter(b=>b.source.year<=first.year),after=houses.filter(b=>b.source.year>first.year&&b.source.year<(changes.find(c=>c!==first&&c.site===site&&c.axis===first.axis)?.effectiveFrom??Infinity));
 assert.ok(before.length&&after.length,'houses on both sides of the change');
 if(first.axis!=='ornaments'){
  for(const b of before)assert.equal(String(b.features[first.axis]),first.from);
  for(const b of after)assert.equal(String(b.features[first.axis]),first.to);
 }
});

test('D3-b: 変化は確定した年だけから決まり、記録を延ばしても過去の変化は変わらない',async()=>{
 await ready;
 const a=world.architecture,full=C.traditionChangesFor(inputs(a));
 for(const through of [300,700,1000]){
  assert.deepEqual(C.traditionChangesFor(inputs(a,{confirmedThrough:through})),full.filter(c=>c.year<=through));
 }
 assert.deepEqual(C.traditionChangesFor(inputs(a)),full,'deterministic');
 // continuing the world keeps every recorded change (next() would throw otherwise)
 const later=await P.advanceArchitectureWorld(world,60,'automatic');
 assert.deepEqual(later.architecture.traditionChanges.slice(0,a.traditionChanges.length),a.traditionChanges);
});

test('D3-b: 伝わる変化は実際の交流のあった相手からだけ。変化の後も制約を満たし、1度に1つの軸だけ変わる',async()=>{
 await ready;
 const a=world.architecture;
 const none=C.traditionChangesFor(inputs(a,{interaction:I.emptyInteraction(a.interaction.confirmedThrough)}));
 assert.ok(none.length>0&&none.every(c=>c.cause!=='transmission'),'no contact, no transmission');
 const all=C.traditionChangesFor(inputs(a));
 assert.ok(all.some(c=>c.cause==='transmission'));
 // design §3.2: invention only while building or repair work goes on
 assert.ok(!C.traditionChangesFor(inputs(a,{facts:()=>({experience:0,records:[],disasters:1})})).some(c=>c.cause==='invention'));
 for(const c of world.architecture.traditionChanges.filter(c=>c.cause==='invention'))assert.ok(c.sources.experience>0&&c.sources.records.length>0);
 for(const c of all.filter(c=>c.cause==='transmission'))assert.ok(c.sources.tradeYears>0||c.sources.migrations>0);
 for(const t of a.traditions){
  const mine=all.filter(c=>c.site===t.siteId);
  for(const c of mine){
   const prev=C.traditionAt(a.grammar,t,all,c.year),now=C.traditionAt(a.grammar,t,all,c.effectiveFrom);
   assert.deepEqual(d2Inconsistencies(spec(now)),[]);
   assert.ok(wallFits(now.choices.structure,now.choices.wall),'structure-wall pairing of the D2 grammar: '+now.choices.structure+'/'+now.choices.wall);
   const diff=Object.keys(spec(now)).filter(k=>JSON.stringify(spec(now)[k])!==JSON.stringify(spec(prev)[k]));
   const sameYear=mine.filter(x=>x.year===c.year).length;
   assert.equal(sameYear,1,'one change per district per boundary');assert.deepEqual(diff,[c.axis]);
  }
 }
});

test('D3-b: 読込で伝統の変化の改竄を拒否する',async()=>{
 await ready;
 const json=JSON.stringify(await P.prepareArchitectureSave(world));
 assert.ok(await P.validateArchitectureSave(JSON.parse(json)));
 const mutate=f=>{const d=JSON.parse(json);f(d.architecture);return P.validateArchitectureSave(d);};
 await assert.rejects(mutate(a=>{a.traditionChanges.pop();}),/does not match/);
 await assert.rejects(mutate(a=>{a.traditionChanges[0].to='X';}),/does not match/);
});
