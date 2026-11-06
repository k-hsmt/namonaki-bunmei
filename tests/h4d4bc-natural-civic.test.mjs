import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettlementHistory,siteAt} from '../dist/story/settlement-history.js';
import {proposeCivicConstruction} from '../dist/story/civic-progression.js';
import {createHousingCivilization,parseHousingSave,serializeHousingSave} from '../dist/story/housing-persistence.js';
import {step,chooseAutomatically} from '../dist/story/engine.js';
import {existingGround,facilityCivicConflicts,findHousingGroundConflicts} from '../dist/scene/housing-ground.js';
import {housingAt} from '../dist/story/housing-history.js';
import {snapshotAt} from '../dist/scene/model.js';
import {composeScene} from '../dist/scene/composition.js';

const housing={schemaVersion:1,introducedYear:0,legacyUntracked:false,events:[]};
const make=()=>{
 const h=createSettlementHistory([7000,0,0],0),site=h[0];
 const hall={id:'river-bank-3',kind:'hall',x:197,y:121,builtYear:10,condition:'intact',recordId:'hall-10'};
 site.view.buildings.push(hall);
 site.buildingChanges.push({year:10,building:{...hall}});
 const p={kind:'council',originId:'shared',recordId:'council-founded',active:true};
 site.view.practices=[p];site.practiceChanges.push({year:10,practices:[p]});
 return h;
};
const propose=(overrides={})=>proposeCivicConstruction({
 siteIndex:0,year:40,seed:82,history:make(),housing,
 population:10000,coverage:1,shortageYears:0,tradeYears:6,recordId:'40-assembly',
 ...overrides,
});
const reason=(got,want)=>{assert.equal(got.status,'hold');assert.equal(got.reason,want);};
test('H4-D4-B: 寄り合いの継続・実在hall・余力が必要、単なる都市規模は条件としない',()=>{
 const a=propose();
 assert.equal(a.status,'built','社会・地表が揃った時は新築の候補が生まれる');
 assert.equal(a.candidate.kind,'hall');
 assert.equal(a.candidate.civic.constructionRecordId,a.event.id);
 assert.deepEqual(a.event,{id:'40-assembly',year:40,kind:'building-built',buildingId:a.candidate.id});
 assert.equal(propose().candidate.id,a.candidate.id,'同一条件で完全に決定的');
 reason(propose({year:39}),'not-ready');
 reason(propose({siteIndex:1}),'unsupported-terrain');
 reason(propose({siteIndex:2}),'unsupported-terrain');
 reason(propose({housing:{...housing,legacyUntracked:true}}),'unknown-history');
 reason(propose({population:1000}),'no-capacity');
 reason(propose({coverage:.5}),'no-capacity');
 reason(propose({shortageYears:5}),'no-capacity');
 reason(propose({tradeYears:0}),'no-capacity');
 const withoutCouncil=make();
 withoutCouncil[0].practiceChanges=[];withoutCouncil[0].view.practices=[];
 reason(propose({history:withoutCouncil}),'no-council');
 const recent=make();recent[0].practiceChanges.at(-1).year=30;
 reason(propose({history:recent}),'no-council');
 // 始点・終点では有効でも途中で途絶えた慣習は「24年間の継続」ではない。
 const interrupted=make();
 const p=interrupted[0].view.practices.find(p=>p.kind==='council');
 interrupted[0].practiceChanges.push({year:25,practices:[{...p,active:false}]});
 interrupted[0].practiceChanges.push({year:34,practices:[{...p,active:true}]});
 reason(propose({history:interrupted}),'no-council');
 // 集会所自体ができたばかりなのに、歴史の古さを借用して大型化しない。
 const newlyBuiltHall=make();
 const entry=newlyBuiltHall[0].buildingChanges.find(e=>e.building.id==='river-bank-3');
 entry.year=30;entry.building.builtYear=30;
 newlyBuiltHall[0].view.buildings.find(b=>b.id==='river-bank-3').builtYear=30;
 reason(propose({history:newlyBuiltHall}),'no-hall');
 const missingHall=make();
 missingHall[0].buildingChanges=missingHall[0].buildingChanges.filter(e=>e.building.kind!=='hall');
 missingHall[0].view.buildings=missingHall[0].view.buildings.filter(b=>b.kind!=='hall');
 reason(propose({history:missingHall}),'no-hall');
 const already=make();already[0].view.buildings.push(a.candidate);
 already[0].buildingChanges.push({year:40,building:a.candidate});
 reason(propose({history:already}),'already-built');
});
test('H4-D4-B: 全候補の敷地が占有済みなら建設しない、既存台帳も不変',()=>{
 const h=make(),before=structuredClone(h);
 const allPlots=[112,124,136,148].flatMap(y=>
  [6,22,38,54,70,86,102,208,224,240,256,272].map(x=>[x,y]));
 const events=allPlots.map(([x,y],i)=>({
  year:40,seq:i,kind:'built',
  blockId:'crowded-'+i,after:{
   blockId:'crowded-'+i,siteId:'river-bank',builtYear:40,
   footprint:{x,y,width:4,depth:4},housingCount:1,
   condition:'sound',use:'occupied',styleId:'low',styleSeed:i,
  },
 }));
 // モックの空き地占有状態は街区履歴の順序・非重複で有効。
 const blocked=propose({history:h,housing:{...housing,events}});
 reason(blocked,'no-safe-plot');
 assert.deepEqual(h,before,'HOLD時に施設正本を変更しない');
});
test('H4-D4-B/C: 新設施設の敷地・前景・保存・過去観測・自然進行が整合する',()=>{
 const results=[];
 for(const seed of [7,42,82]){
  const state=createHousingCivilization(seed);
  const original0=snapshotAt(state,0,0);
  while(state.year<2000){step(state);if(state.pending)chooseAutomatically(state);}
  const built=state.history.filter(e=>e.kind==='building-built'&&e.buildingId?.startsWith('civic-'));
  const homes=housingAt(state.housing,2000,'river-bank').blocks;
  const facility=siteAt(state.observation.sites,0,2000).buildings.filter(b=>b.civic);
  for(const b of facility){
   assert.equal(b.kind,'hall');
   assert.equal(b.civic.footprint.width,b.civic.architectureStyle==='great-hall'?44:56);
   assert.equal(b.civic.footprint.depth,b.civic.architectureStyle==='great-hall'?22:30);
   assert.equal(built.filter(e=>e.id===b.civic.constructionRecordId).length,1);
   assert.equal(findHousingGroundConflicts(homes,facility,0).length,0);
   assert.equal(facilityCivicConflicts({id:'other',kind:'house',x:b.x,y:b.y,condition:'intact',builtYear:3000},[b]).length,1);
   const f=existingGround(b);assert.deepEqual(f,b.civic.footprint);
   const before=siteAt(state.observation.sites,0,b.builtYear-1);
   assert.equal(before.buildings.some(x=>x.id===b.id),false,'建設年より前に存在してはならない');
   const then=snapshotAt(state,b.builtYear,0);
   assert.equal(then.objects.find(x=>x.id===b.id).civic.architectureStyle,b.civic.architectureStyle);
   assert.equal(composeScene(then,state.housing).structures.find(x=>x.id===b.id).civicStyle,b.civic.architectureStyle);
  }
  assert.deepEqual(snapshotAt(state,0,0),original0);
  const restored=parseHousingSave(serializeHousingSave(state));
  assert.deepEqual(restored,state);
  assert.deepEqual(snapshotAt(restored,1000,0),snapshotAt(state,1000,0));
  assert.deepEqual(snapshotAt(restored,2000,0),snapshotAt(state,2000,0));
  results.push({seed,built:built.map(e=>({id:e.id,year:e.year,buildingId:e.buildingId})),
   styles:facility.map(x=>x.civic.architectureStyle),housingCount:homes.length});
 }
 console.log('H4-D4-BC-NATURAL '+JSON.stringify(results));
 assert.ok(results.some(x=>x.built.length>0),
  '3シードの自然進行で大型共同施設が一件も成立しなければ実装前提を見直す');
});
