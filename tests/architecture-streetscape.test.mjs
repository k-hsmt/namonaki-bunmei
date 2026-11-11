/** Issue #35 D5: height by settlement scale, the real town condition and the layout of a district. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../dist/architecture/grammar-v1.js';
import * as L from '../dist/architecture/layout-v1.js';
import * as P from '../dist/architecture/production-v1.js';
import {createNewArchitectureWorld,createNewTerrainWorld} from '../dist/story/new-world.js';
import {architectureProductionSession,terrainProductionSession,worldStreetscapeAt} from '../dist/story/world-session.js';

const flat={slope:100,water:100,rock:0,forest:500},plot={grade:0,nearWater:false};
const birth=(t,g,use,id,scale)=>G.deriveBirthStyle({grammar:g,tradition:t,use,plot,ref:['rowhouse','courtyard'].includes(use)?{kind:'housing',siteId:t.siteId,blockId:id,parts:{from:0,to:2}}:{kind:'facility',siteId:t.siteId,id},
 source:{kind:'built',year:900},scale},()=>true);

test('D5 #1: 町・都市では、整形石・混合・高度構造の住宅・仕事場・市場の一部が2階建てになる。倉と集落・村ではならない',()=>{
 const g=G.createWorldGrammar(3),base=G.createRegionalTradition(g,'hill-side',flat);
 const t={...base,choices:{...base.choices,structure:'S05',wall:'ashlar'}},s01={...base,choices:{...base.choices,structure:'S01',wall:'wattle'}};
 const count=(tr,use,scale)=>{let n=0;for(let i=0;i<200;i++)if(birth(tr,g,use,'b'+i,scale).adjustments.includes('scale:two-storeys'))n++;return n;};
 for(const use of G.scaleStoreyUses){assert.equal(count(t,use,1),0,use+' in a village');assert.ok(count(t,use,2)>10&&count(t,use,2)<70,use+' in a town');}
 assert.ok(count(t,'house',3)>count(t,'house',2),'cities more than towns');
 assert.equal(count(t,'granary',3),0,'granaries stay one storey');
 assert.equal(count(s01,'house',3),0,'a timber-frame tradition does not rise');
 for(let i=0;i<50;i++){const b=birth(t,g,'house','b'+i,3);if(b.adjustments.includes('scale:two-storeys'))assert.equal(b.features.storeys,2);}
});

test('D5 #2: 街並みの型は、実在の建物・水・斜面・中心だけから決まる',()=>{
 const far=()=>Infinity,at=(x,y,kind='house',extra={})=>({x,y,kind,...extra});
 assert.equal(L.classifyLayout({buildings:[at(10,10)],waterDistance:far}),'L01','too few');
 assert.equal(L.classifyLayout({buildings:[at(10,150),at(60,150),at(110,150),at(160,150)],waterDistance:()=>5}),'L03','along the water');
 assert.equal(L.classifyLayout({buildings:[at(100,120,'hall'),at(120,130),at(90,140),at(130,110)],waterDistance:far}),'L06','around the hall');
 assert.equal(L.classifyLayout({buildings:[at(20,120,'hall'),at(300,130,'market'),at(150,140),at(160,150)],waterDistance:far}),'L07','two centres apart');
 assert.equal(L.classifyLayout({buildings:[at(20,120,'block',{foundation:'F4'}),at(120,130,'block',{foundation:'F4'}),at(220,140),at(280,150)],waterDistance:far}),'L05','terraced');
 assert.equal(L.classifyLayout({buildings:[at(20,120,'block',{courtyard:true}),at(150,160,'block',{courtyard:true}),at(260,120,'block')],waterDistance:far}),'L04','courtyards');
 assert.equal(L.classifyLayout({buildings:[at(10,130),at(80,132),at(160,134),at(240,136),at(310,138)],waterDistance:far}),'L02','in a line');
 assert.equal(L.layoutLabel('L03',2),'水辺沿いに並ぶ町');
});

test('D5 #1/#4: 本番では、2階建ても技術の成立も、その年に町・都市だった地区だけで起きる',async()=>{
 const w=await P.advanceArchitectureWorld(P.introduceArchitectureProduction((await createNewTerrainWorld(88)).review),3000,'automatic');
 const a=w.architecture;assert.equal(a.streetscape,'architecture-scale-v1');
 const raised=a.births.filter(b=>b.adjustments.includes('scale:two-storeys'));
 assert.ok(raised.length>0,'seed 88 raises some buildings by 3000');
 for(const b of raised){assert.ok(P.scaleAt(w.terrain,b.ref.siteId,b.source.year)>=2);assert.notEqual(b.use,'granary');}
 for(const b of a.births.filter(b=>b.substitutions.some(s=>s.axis==='storeys')))assert.equal(b.features.storeys,1,'given up when the air above is taken');
 for(const e of a.capabilityEvents.filter(e=>e.op!=='lose'))assert.ok(P.scaleAt(w.terrain,e.site,e.year)>=2);
 const json=JSON.stringify(await P.prepareArchitectureSave(w));assert.ok(await P.validateArchitectureSave(JSON.parse(json)));
});

test('D5 #3: 観測地点の説明は v9 の世界だけに出る（例：水辺沿いに並ぶ町）',async()=>{
 const v9=architectureProductionSession(await P.advanceArchitectureWorld((await createNewArchitectureWorld(7)).architecture,1500,'automatic'));
 for(let site=0;site<3;site++)assert.match(worldStreetscapeAt(v9,1500,site),/(散らばる|連なる|並ぶ|囲む|段をなす|中心をもつ|家が多い)(集落|村|町|都市)$/);
 assert.equal(worldStreetscapeAt(v9,1500,0),worldStreetscapeAt(v9,1500,0),'deterministic');
 assert.equal(worldStreetscapeAt(await createNewTerrainWorld(7),0,0),undefined,'v8 worlds show nothing');
});
