import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettlementHistory,siteAt} from '../dist/story/settlement-history.js';
import {createHousingCivilization,parseHousingSave,serializeHousingSave} from '../dist/story/housing-persistence.js';
import {step,chooseAutomatically} from '../dist/story/engine.js';
import {snapshotAt} from '../dist/scene/model.js';
import {existingGround,facilityHousingConflicts} from '../dist/scene/housing-ground.js';
import {
 validateCivicBuilding,reviewCivicConstruction,appendConfirmedCivicConstruction,
} from '../dist/story/civic-architecture.js';

const json=x=>JSON.parse(JSON.stringify(x));
const foundation={architectureStyle:'great-hall',
 footprint:{x:5,y:60,width:44,depth:22},constructionRecordId:'10-communal'};
const build=(overrides={})=>({
 id:'civic-river-bank-10-communal',kind:'hall',x:27,y:75,builtYear:10,
 condition:'intact',recordId:foundation.constructionRecordId,civic:json(foundation),...overrides,
});
const record=(b=build())=>({
 id:b.civic.constructionRecordId,year:b.builtYear,kind:'building-built',buildingId:b.id,
});
const check=(candidate=build(),overrides={})=>reviewCivicConstruction({
 siteIndex:0,year:10,candidate,buildings:[],housingBlocks:[],records:[record(candidate)],
 ...overrides,
});
const expectHold=(x,reason)=>{assert.equal(x.status,'hold');assert.equal(x.reason,reason);};
test('H4-D4-A: A/Bの新築様式と実占有を持ち、旧hallと城は許可しない',()=>{
 const a=build();
 const b=build({id:'civic-river-bank-10-courtyard',
  civic:{architectureStyle:'courtyard-hall',
   footprint:{x:5,y:55,width:56,depth:30},constructionRecordId:'10-communal'},
  x:30,y:70});
 assert.ok(validateCivicBuilding(a));assert.ok(validateCivicBuilding(b));
 assert.equal(check(a).status,'clear');
 assert.equal(check(b).status,'clear');
 assert.equal(validateCivicBuilding(build({civic:{...foundation,architectureStyle:'fortress'}})),false);
 assert.equal(validateCivicBuilding(build({civic:{...foundation,constructionRecordId:''}})),false);
 assert.equal(validateCivicBuilding(build({civic:{...foundation,footprint:{x:300,y:160,width:56,depth:30}}})),false);
 assert.equal(validateCivicBuilding(build({x:100})),false);
 assert.equal(validateCivicBuilding({id:'river-bank-3',kind:'hall',x:197,y:121,builtYear:24,condition:'intact'}),false);
});
test('H4-D4-A: 建設出典・未確認地形・重複ID・候補不正をHOLD',()=>{
 const a=build();
 expectHold(check(a,{siteIndex:1}),'unsupported-terrain');
 expectHold(check(a,{siteIndex:2}),'unsupported-terrain');
 expectHold(check(a,{records:[]}),'unconfirmed-event');
 expectHold(check(a,{records:[{...record(a),kind:'building-repaired'}]}),'unconfirmed-event');
 expectHold(check(a,{records:[{...record(a),year:9}]}),'unconfirmed-event');
 expectHold(check(a,{buildings:[a]}),'duplicate-id');
 expectHold(check(build({builtYear:9})),'invalid-candidate');
 expectHold(check(build({recordId:'latest-repair'})),'invalid-candidate');
});
test('H4-D4-A: 河川・廃墟住宅・既存家屋・旧hallの敷地を避ける',()=>{
 const c=build();
 const crossingRiver=build({x:145,y:120,civic:{...foundation,footprint:{x:129,y:109,width:44,depth:22}}});
 const water=check(crossingRiver);
 expectHold(water,'occupied-ground');
 assert.deepEqual(water.conflicts,['terrain-or-boundary']);
 const housing={blockId:'old-ruin',siteId:'river-bank',footprint:{x:6,y:61,width:18,depth:8},
  builtYear:0,housingCount:2,condition:'ruined',use:'vacant',styleId:'low',styleSeed:1};
 const blocked=check(c,{housingBlocks:[housing]});
 expectHold(blocked,'occupied-ground');
 assert.deepEqual(blocked.conflicts,['housing:old-ruin']);
 const house={id:'river-bank-0',kind:'house',x:27,y:75,builtYear:0,condition:'ruined'};
 const blockedBuilding=check(c,{buildings:[house]});
 expectHold(blockedBuilding,'occupied-ground');
 assert.deepEqual(blockedBuilding.conflicts,['facility:river-bank-0']);
 const blockedHall=check(c,{buildings:[{...house,id:'river-bank-3',kind:'hall'}]});
 expectHold(blockedHall,'occupied-ground');
 assert.equal(existingGround(c).width,44);
 assert.equal(existingGround(c).depth,22);
 assert.deepEqual(facilityHousingConflicts(c,[housing]),['old-ruin']);
 assert.deepEqual(existingGround({id:'legacy',kind:'hall',x:27,y:75,builtYear:0,condition:'intact'}),
  {x:18,y:71,width:18,depth:7},'旧施設の物理敷地は変更しない');
});
test('H4-D4-A: 明示の確定イベントのみ新築でき、原台帳・過去・建設時様式は不変',()=>{
 const original=createSettlementHistory([1800,0,0],0);
 const previous=json(original),a=build(),records=[record()];
 expectHold(check(a,{records:[]}), 'unconfirmed-event');
 assert.throws(()=>appendConfirmedCivicConstruction({
  history:original,siteIndex:0,year:10,candidate:a,housingBlocks:[],records:[],
 }),/HOLD/);
 const next=appendConfirmedCivicConstruction({
  history:original,siteIndex:0,year:10,candidate:a,housingBlocks:[],records,
 });
 assert.deepEqual(original,previous,'入力は変更しない');
 assert.deepEqual(siteAt(next,0,9),siteAt(original,0,9));
 assert.equal(siteAt(original,0,10).buildings.some(x=>x.id===a.id),false);
 const created=siteAt(next,0,10).buildings.find(x=>x.id===a.id);
 assert.deepEqual(created,a);
 assert.equal(next[0].buildingChanges.at(-1).year,10);
 const copy=siteAt(next,0,10);
 copy.buildings.find(x=>x.id===a.id).civic.footprint.width=1;
 assert.deepEqual(siteAt(next,0,10).buildings.find(x=>x.id===a.id),a,
  '読み出しで履歴の深い参照を破損しない');
 assert.throws(()=>appendConfirmedCivicConstruction({
  history:next,siteIndex:0,year:9,candidate:{...a,builtYear:9},housingBlocks:[],records,
 }),/遡及/);
 assert.throws(()=>appendConfirmedCivicConstruction({
  history:next,siteIndex:0,year:10,candidate:a,housingBlocks:[],records,
 }),/HOLD/);
});
test('H4-D4-A: v4保存往復・不正な新築出典/様式/敷地の拒否、旧セーブ不変',()=>{
 const s=createHousingCivilization(42);
 while(s.year<10){step(s);if(s.pending)chooseAutomatically(s);}
 const beforeSnapshot=snapshotAt(s,9,0);
 const serializedOld=serializeHousingSave(s);
 const preCivicSave=parseHousingSave(serializedOld);
 assert.deepEqual(preCivicSave,s);
 const a=build();
 const builtRecord={...record(),tag:'地域',title:'共同の会堂が築かれる',
  body:'暮らしの中で使われ続ける場',causes:['共同維持の記録']};
 s.history.push(builtRecord);
 const origSites=json(s.observation.sites);
 s.observation.sites=appendConfirmedCivicConstruction({
  history:s.observation.sites,siteIndex:0,year:10,candidate:a,housingBlocks:[],records:s.history,
 });
 assert.deepEqual(s.observation.sites[1],origSites[1]);
 assert.deepEqual(snapshotAt(s,9,0),beforeSnapshot);
 assert.equal(snapshotAt(s,10,0).objects.find(x=>x.id===a.id).civic.architectureStyle,'great-hall');
 const wire=serializeHousingSave(s);
 const restored=parseHousingSave(wire);
 assert.deepEqual(restored,s);
 assert.deepEqual(snapshotAt(restored,9,0),beforeSnapshot);
 assert.deepEqual(snapshotAt(restored,10,0),snapshotAt(s,10,0));
 const corrupt=(f)=>{
  const raw=JSON.parse(wire);
  f(raw);assert.throws(()=>parseHousingSave(JSON.stringify(raw)),/大型公共建築/);
 };
 const target=x=>x.observation.sites[0].buildingChanges.find(e=>e.building.id===a.id).building;
 const current=x=>x.observation.sites[0].view.buildings.find(b=>b.id===a.id);
 corrupt(x=>target(x).civic.architectureStyle='fortress');
 corrupt(x=>target(x).civic.footprint.width=450);
 corrupt(x=>target(x).civic.constructionRecordId='missing-event');
 corrupt(x=>target(x).kind='market');
 corrupt(x=>current(x).civic.footprint.x+=1);
 corrupt(x=>{x.history=x.history.filter(e=>e.id!==a.civic.constructionRecordId);});
 corrupt(x=>{target(x).builtYear=9;});
 assert.deepEqual(parseHousingSave(serializedOld),preCivicSave,
  '新フィールドを持たない旧v4保存は補完・改変しない');
});
