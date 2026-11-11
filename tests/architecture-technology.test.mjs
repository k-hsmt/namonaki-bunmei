/** Issue #35 D3-c: district capabilities (architecture-technology-v1) and advanced-technology births. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createNewTerrainWorld} from '../dist/story/new-world.js';
import * as G from '../dist/architecture/grammar-v1.js';
import * as V from '../dist/architecture/vocab-v1.js';
import * as T from '../dist/architecture/technology-v1.js';
import * as I from '../dist/architecture/interaction-v1.js';
import * as P from '../dist/architecture/production-v1.js';

const flat={slope:100,water:100,rock:0,forest:500};
const plot={grade:0,nearWater:false};
const birth=(g,t,use,id,technologies)=>G.deriveBirthStyle({grammar:g,tradition:t,use,plot,
 ref:{kind:'facility',siteId:t.siteId,id},source:{kind:'built',year:900},...(technologies?{technologies}:{})},()=>true);

test('D3-c: 技術を持つ地区でも、採用するのは会堂・市場・仕事場の一部だけ。持っていない技術は使わない',()=>{
 const g=G.createWorldGrammar(5),t=G.createRegionalTradition(g,'river-bank',flat);
 let adopted=0,total=0;
 for(let i=0;i<60;i++)for(const use of ['hall','market','workshop','house','granary']){
  const plain=birth(g,t,use,'f'+i),none=birth(g,t,use,'f'+i,[]),b=birth(g,t,use,'f'+i,['metal-glass']);
  assert.deepEqual(none,plain,'no technology: the D2 birth is unchanged');
  const tech=b.adjustments.filter(x=>x.startsWith('technology:'));
  if(!G.technologyUses.includes(use)){assert.deepEqual(b,plain,use+' stays vernacular');continue;}
  total++;
  if(tech.length){
   adopted++;
   assert.deepEqual(tech,['technology:metal-glass']);
   assert.equal(b.features.structure,'X3');assert.equal(b.features.window,'W7');assert.equal(b.features.wall,'metal');
   assert.equal(b.features.roofMaterial,use==='market'?'glazed':'metal');
   assert.ok(b.features.storeys<=2,'no 3+ storeys (Human decision 2)');
   assert.deepEqual(V.advancedBirthInconsistencies({use,...b.features}),[]);
   assert.ok(V.d2Inconsistencies({use,...b.features}).length>0,'advanced features stay banned without a technology');
  }else assert.deepEqual(b,plain,'not adopting leaves the birth as in D2');
 }
 assert.ok(adopted>total*.4&&adopted<total*.8,'about '+G.technologyAdoption+'% adopt: '+adopted+'/'+total);
});

test('D3-c: 大スパン木造と石造＋アーチは、D1の語彙で建ち、制約を満たす',()=>{
 for(const [tech,structure] of [['timber-span','X1'],['masonry-arch','X2']]){
  let seen=0;
  for(let seed=1;seed<=20;seed++){
   const g=G.createWorldGrammar(seed);
   for(const site of ['river-bank','hill-side','coast-inlet']){
    const t=G.createRegionalTradition(g,site,flat);
    for(const use of G.technologyUses)for(let i=0;i<4;i++){
     const b=birth(g,t,use,use+i,[tech]);
     assert.equal(b.status,'ok');
     if(!b.adjustments.includes('technology:'+tech))continue;
     seen++;assert.equal(b.features.structure,structure);
     assert.deepEqual(V.advancedBirthInconsistencies({use,...b.features}),[]);
     if(tech==='masonry-arch')assert.equal(b.features.wall,'ashlar');
    }
   }
  }
  assert.ok(seen>0,tech);
 }
});

const SEED=3;
const base={seed:SEED,grammar:G.createWorldGrammar(SEED)};
base.initial=['river-bank','hill-side','coast-inlet'].map((s,i)=>{const t=G.createRegionalTradition(base.grammar,s,flat);
 return {...t,choices:{...t.choices,structure:['S02','S05','S03'][i],wall:['plank','ashlar','earth'][i]}};});
const inputs=(over={})=>({...base,confirmedThrough:2000,changes:[],interaction:I.emptyInteraction(2000),
 facts:()=>({experience:3,records:['r1','r2'],disasters:0}),town:()=>true,...over});

test('D3-c: 技術は町の規模・施工の経験・伝統の素地がそろうときだけ成立し、長く仕事がないと失われる',()=>{
 const all=T.capabilityEventsFor(inputs());
 assert.ok(all.length>0);
 for(const e of all){assert.equal(e.year%25,0);assert.equal(e.effectiveFrom,e.year+1);}
 // timber from the plank tradition (river-bank), masonry from ashlar (hill-side); earth (coast) reaches neither by itself
 assert.ok(all.filter(e=>e.op==='establish').every(e=>e.site==='river-bank'&&e.technology==='timber-span'||e.site==='hill-side'&&e.technology==='masonry-arch'),JSON.stringify(all));
 assert.ok(!all.some(e=>e.technology==='metal-glass'),'metal-glass needs trade contact');
 assert.ok(!all.some(e=>e.op==='lose'),'work continues, nothing is lost');
 assert.deepEqual(T.capabilityEventsFor(inputs({town:()=>false})),[],'no town, no technology');
 assert.deepEqual(T.capabilityEventsFor(inputs({facts:()=>({experience:0,records:[],disasters:0})})),[],'no experience, no technology');
 // determinism and confirmed years only
 for(const through of [500,1000,1500])assert.deepEqual(T.capabilityEventsFor(inputs({confirmedThrough:through})),all.filter(e=>e.year<=through));
 // a century without any work loses a held technology (and buildings already standing are not touched: births are separate)
 const quietAfter=all.find(e=>e.op==='establish').year+25,events=T.capabilityEventsFor(inputs({facts:(s,y)=>y<=quietAfter?{experience:3,records:['r'],disasters:0}:{experience:0,records:[],disasters:0}}));
 const lost=events.filter(e=>e.op==='lose');
 assert.ok(lost.length>0&&lost.every(e=>e.year>=quietAfter+100),JSON.stringify(lost));
 const firstEstablish=events.find(e=>e.op==='establish');
 if(firstEstablish&&firstEstablish.year<quietAfter){
  assert.deepEqual(T.technologiesAt(events,firstEstablish.site,firstEstablish.year),[]);
  assert.ok(T.technologiesAt(events,firstEstablish.site,firstEstablish.effectiveFrom).includes(firstEstablish.technology));
 }
});

test('D3-c: 技術の習得は交流のある相手からだけ。金属＋ガラスは基礎の技術と交易が要る',()=>{
 // coast-inlet (earth) cannot establish by itself; it can only acquire from river-bank (route 1) by contact
 const trade=[[1,1,2000],[0,1,2000]];
 const withContact=T.capabilityEventsFor(inputs({interaction:{...I.emptyInteraction(2000),trade}}));
 const acquired=withContact.filter(e=>e.op==='acquire');
 assert.ok(acquired.length>0);
 for(const e of acquired){assert.ok(e.sources.fromSite&&e.sources.tradeYears>0);
  assert.ok(T.technologiesAt(withContact,e.sources.fromSite,e.year).includes(e.technology),'the teacher held it');}
 assert.ok(!T.capabilityEventsFor(inputs()).some(e=>e.op==='acquire'),'no contact, no acquisition');
 const metal=withContact.filter(e=>e.technology==='metal-glass'&&e.op!=='lose');
 for(const e of metal){const held=T.technologiesAt(withContact,e.site,e.year);assert.ok(held.includes('timber-span')||held.includes('masonry-arch'));}
});

test('D3-c: 本番の記録に技術の出来事を持ち、読込で照合する（seed 5、1100年）',async()=>{
 const w=await P.advanceArchitectureWorld(P.introduceArchitectureProduction((await createNewTerrainWorld(5)).review),1100,'automatic');
 const a=w.architecture;
 assert.equal(a.schemaVersion,6);assert.equal(a.technology,T.TECHNOLOGY_ID);
 assert.ok(a.capabilityEvents.length>0,'seed 5 establishes a technology before 1100');
 for(const b of a.births){
  const tech=b.adjustments.find(x=>x.startsWith('technology:'));
  if(tech)assert.ok(T.technologiesAt(a.capabilityEvents,b.ref.siteId,b.source.year).includes(tech.slice(11)));
  else assert.ok(!V.isAdvancedStructure(b.features.structure));
 }
 const json=JSON.stringify(await P.prepareArchitectureSave(w));
 assert.ok(await P.validateArchitectureSave(JSON.parse(json)));
 const mutate=f=>{const d=JSON.parse(json);f(d.architecture);return P.validateArchitectureSave(d);};
 await assert.rejects(mutate(x=>{x.capabilityEvents.pop();}),/does not match/);
 await assert.rejects(mutate(x=>{x.capabilityEvents[0].technology='metal-glass';}),/does not match/);
});
