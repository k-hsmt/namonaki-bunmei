import test from 'node:test';
import assert from 'node:assert/strict';
import {createHousingCivilization} from '../dist/story/housing-persistence.js';
import {createCivilization,step,chooseAutomatically} from '../dist/story/engine.js';
import {housingAt} from '../dist/story/housing-history.js';
import {proposeHousingConstruction} from '../dist/story/housing-progression.js';
import {facilityHousingConflicts,findHousingGroundConflicts} from '../dist/scene/housing-ground.js';
import {siteAt} from '../dist/story/settlement-history.js';
const json=x=>JSON.parse(JSON.stringify(x));
const empty={schemaVersion:1,introducedYear:0,legacyUntracked:false,events:[]};
const proposal=(overrides={})=>proposeHousingConstruction({
 history:empty,year:120,seed:42,siteIndex:0,population:3000,buildings:[],...overrides,
});
test('地形未検証の丘陵・入り江は住宅の自然建設をHOLD',()=>{
 assert.deepEqual(proposal({siteIndex:1}),{status:'hold',reason:'unsupported-terrain'});
 assert.deepEqual(proposal({siteIndex:2}),{status:'hold',reason:'unsupported-terrain'});
 assert.deepEqual(proposal({year:20}),{status:'hold',reason:'not-ready'});
 assert.deepEqual(proposal({history:{...empty,introducedYear:130}}),{status:'hold',reason:'before-boundary'});
});
test('住宅建設は既存地表・川との衝突を拒否し、元台帳を変更しない',()=>{
 const before=json(empty),r=proposal();
 assert.equal(r.status,'built');
 assert.equal(r.event.year,120);
 assert.equal(r.event.kind,'built');
 assert.equal(r.event.after.builtYear,120);
 assert.equal(findHousingGroundConflicts([r.event.after],[],0).length,0);
 assert.deepEqual(empty,before);
 const withFacility=proposal({buildings:[{
  id:'facility',kind:'hall',x:r.event.after.footprint.x+7,
  y:r.event.after.footprint.y+4,builtYear:100,condition:'intact',
 }]});
 assert.equal(withFacility.status,'built');
 assert.notDeepEqual(withFacility.event.after.footprint,r.event.after.footprint);
 assert.deepEqual(empty,before);
});
test('後発施設の固定区画が既存住宅と重なるとHOLDを判定（廃墟も占有）',()=>{
 const b={blockId:'b',siteId:'river-bank',builtYear:20,
  footprint:{x:250,y:108,width:12,depth:7},
  housingCount:2,condition:'ruined',use:'vacant',styleId:'low',styleSeed:2};
 const facility={id:'market',kind:'market',x:256,y:109,builtYear:120,condition:'intact'};
 assert.deepEqual(facilityHousingConflicts(facility,[b]),['b']);
 assert.deepEqual(facilityHousingConflicts({...facility,x:40},[b]),[]);
});
test('新規v4の住宅自然建設は確定履歴にのみ追加し、同一seedで再開後も決定的',()=>{
 const a=createHousingCivilization(42),b=createHousingCivilization(42);
 const run=(s,to)=>{
  while(s.year<to){
   step(s);
   if(s.pending)chooseAutomatically(s);
  }
 };
 run(a,600);run(b,600);
 assert.deepEqual(a,b);
 assert.ok(a.housing.events.length>0,'少なくとも一件の建設履歴を確認');
 assert.ok(a.housing.events.every(e=>e.kind==='built'&&e.year<=a.observation.lastYear));
 const houses=housingAt(a.housing,600,'river-bank').blocks;
 for(const block of houses){
  const site=siteAt(a.observation.sites,0,block.builtYear);
  // built時点の成立済み施設との物理衝突はゼロ。
  assert.deepEqual(findHousingGroundConflicts([block],site?.buildings??[],0),[]);
 }
 const copy=json(a);
 const restored=json(a);
 run(a,750);run(restored,750);
 assert.deepEqual(a,restored);
 assert.deepEqual(b.housing.events,copy.housing.events);
});
test('既存v3の自然進行は住宅のゲートを有効化せず、従来と同じ結果を出す',()=>{
 const original=createCivilization(42),clone=json(original);
 for(let n=0;n<150;n++){
  step(original);step(clone);
  if(original.pending)chooseAutomatically(original);
  if(clone.pending)chooseAutomatically(clone);
 }
 assert.deepEqual(original,clone);
 assert.equal(original.housing,undefined);
});


test('施設建設HOLDでも同年の共同体変更を履歴へ確定する',async()=>{
 const {createSettlementHistory,updateSettlements,siteAt}=await import('../dist/story/settlement-history.js');
 const {createSociety}=await import('../dist/story/society.js');
 const ledger=createSettlementHistory([2000,0,0,0],0),society=createSociety();
 society.sites[0].communityId='review-community';
 const population=[2000,0,0].map(n=>({
  population:n,coverage:1,tradeYears:10,shortageYears:0,
 }));
 let attempts=0;
 updateSettlements(ledger,society,population,8,()=> 'record-id',
  (i,building)=>{if(i===0){attempts++;return false;}return true;});
 assert.ok(attempts>=1);
 const snapshot=siteAt(ledger,0,8);
 assert.equal(snapshot.communityId,'review-community');
 assert.equal(snapshot.buildings.length,1,'HOLDした施設を建てない');
});
