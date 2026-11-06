import test from 'node:test';
import assert from 'node:assert/strict';
import {createHousingCivilization,parseHousingSave,serializeHousingSave} from '../dist/story/housing-persistence.js';
import {step,chooseAutomatically} from '../dist/story/engine.js';
import {housingAt} from '../dist/story/housing-history.js';
import {siteAt} from '../dist/story/settlement-history.js';
import {snapshotAt} from '../dist/scene/model.js';
import {
 publicSpacesAt,reviewPublicSpaceFoundation,appendConfirmedPublicSpace,
 appendConfirmedPublicSpaceUse,overlapsPublicSpace,
} from '../dist/story/public-space-history.js';
const ledger=()=>({schemaVersion:1,introducedYear:0,legacyUntracked:false,events:[]});
const fixture={
 id:'public-river-bank-test-40',siteId:'river-bank',kind:'assembly-ground',
 footprint:{x:5,y:155,width:24,depth:12},establishedYear:40,
 anchorBuildingId:'hall-left',foundationRecordId:'40-space',condition:'used',
};
const hall={id:'hall-left',kind:'hall',x:35,y:140,builtYear:10,condition:'intact',recordId:'10-hall'};
const established={id:'40-space',year:40,kind:'public-space-established',publicSpaceId:fixture.id};
const params=(overrides={})=>({
 siteIndex:0,year:40,candidate:fixture,buildings:[hall],housingBlocks:[],existing:[],
 housingStatus:'known',records:[established],...overrides,
});
const hold=(result,reason)=>{assert.equal(result.status,'hold');assert.equal(result.reason,reason);};
test('D7-A: 建築・住宅・河川・予約敷地に衝突しない場所だけが明示新設候補',()=>{
 assert.equal(reviewPublicSpaceFoundation(params()).status,'clear');
 hold(reviewPublicSpaceFoundation(params({siteIndex:1})),'unsupported-terrain');
 hold(reviewPublicSpaceFoundation(params({siteIndex:2})),'unsupported-terrain');
 hold(reviewPublicSpaceFoundation(params({housingStatus:'unknown'})),'unknown-history');
 hold(reviewPublicSpaceFoundation(params({housingStatus:'partial'})),'unknown-history');
 hold(reviewPublicSpaceFoundation(params({records:[]})),'unconfirmed-event');
 hold(reviewPublicSpaceFoundation(params({records:[established,established]})),'unconfirmed-event');
 hold(reviewPublicSpaceFoundation(params({buildings:[]})),'anchor-unavailable');
 hold(reviewPublicSpaceFoundation(params({buildings:[{...hall,condition:'ruined'}]})),'anchor-unavailable');
 hold(reviewPublicSpaceFoundation(params({candidate:{...fixture,kind:'fortress'}})),'invalid-candidate');
 hold(reviewPublicSpaceFoundation(params({candidate:{...fixture,footprint:{...fixture.footprint,x:310}}})),'invalid-candidate');
 const crossed={...fixture,footprint:{x:129,y:112,width:24,depth:12}};
 hold(reviewPublicSpaceFoundation(params({candidate:crossed})), 'anchor-unavailable');
 const home={blockId:'old-ruin',footprint:{...fixture.footprint},builtYear:0,
  siteId:'river-bank',housingCount:2,condition:'ruined',use:'vacant',
  styleId:'low',styleSeed:1};
 const blocked=reviewPublicSpaceFoundation(params({housingBlocks:[home]}));
 hold(blocked,'occupied-ground');
 assert.deepEqual(blocked.conflicts,['housing:old-ruin']);
 assert.deepEqual(reviewPublicSpaceFoundation(params({existing:[fixture]})),
  {status:'hold',reason:'duplicate-space',conflicts:[fixture.id]});
 assert.equal(overlapsPublicSpace({x:6,y:160,width:3,depth:2},[fixture]),true);
 assert.equal(overlapsPublicSpace({x:45,y:160,width:3,depth:2},[fixture]),false);
});
test('D7-A: 成立・荒廃・再利用は確定記録でのみ変化し、敷地は不変',()=>{
 const original=ledger(),before=structuredClone(original);
 const founded=appendConfirmedPublicSpace({
  history:original,year:40,candidate:fixture,buildings:[hall],housingBlocks:[],
  records:[established],
 });
 assert.deepEqual(original,before);
 assert.equal(publicSpacesAt(founded,39).spaces.length,0);
 assert.deepEqual(publicSpacesAt(founded,40).spaces,[fixture]);
 const fade={id:'70-fade',year:70,kind:'public-space-overgrown',publicSpaceId:fixture.id};
 const after=appendConfirmedPublicSpaceUse({
  history:founded,year:70,spaceId:fixture.id,kind:'overgrown',
  causeRecordId:fade.id,records:[established,fade],
 });
 assert.equal(publicSpacesAt(after,70).spaces[0].condition,'overgrown');
 assert.deepEqual(publicSpacesAt(after,40).spaces,[fixture]);
 const again={id:'95-renew',year:95,kind:'public-space-reused',publicSpaceId:fixture.id};
 const renewed=appendConfirmedPublicSpaceUse({
  history:after,year:95,spaceId:fixture.id,kind:'reused',
  causeRecordId:again.id,records:[established,fade,again],
 });
 assert.deepEqual(publicSpacesAt(renewed,95).spaces,[fixture]);
 assert.deepEqual(publicSpacesAt(founded,95).spaces,[fixture]);
 const invalid={...founded,events:[...founded.events,{
  year:70,seq:0,kind:'overgrown',spaceId:fixture.id,causeRecordId:fade.id,
  after:{...fixture,footprint:{...fixture.footprint,x:6},condition:'overgrown'},
 }]};
 assert.throws(()=>publicSpacesAt(invalid,70),/不変属性/);
 assert.throws(()=>appendConfirmedPublicSpaceUse({
  history:founded,year:70,spaceId:fixture.id,kind:'reused',
  causeRecordId:'70-unknown',records:[],
 }),/確定記録/);
});
test('D7-A: 旧v4は無変更、新しい公共空地は保存・過去観測・将来占有に残る',()=>{
 const state=createHousingCivilization(42);
 while(state.year<160){step(state);if(state.pending)chooseAutomatically(state);}
 const oldWire=serializeHousingSave(state),before=snapshotAt(state,159,0);
 assert.equal(state.publicSpaces,undefined);
 const site=siteAt(state.observation.sites,0,160);
 const homes=housingAt(state.housing,160,'river-bank');
 assert.equal(homes.status,'known');
 const occupied=site.buildings.filter(b=>
  (b.kind==='hall'||b.kind==='market')&&b.condition==='intact');
 assert.ok(occupied.length>0,'自然進行で既存集会所または市場がある');
 const year=160,recordId=year+'-manual-space';
 let chosen;
 for(const anchor of occupied){
  for(const y of [119,126,133,140,147,154,160]){
   for(const x of [5,17,29,41,53,65,77,89,101,210,222,234,246,258,270,282]){
    const candidate={
     id:'public-river-bank-fixture-'+year,siteId:'river-bank',
     kind:anchor.kind==='market'?'market-yard':'assembly-ground',
     footprint:{x,y,width:24,depth:10},establishedYear:year,
     anchorBuildingId:anchor.id,foundationRecordId:recordId,condition:'used',
    };
    const rec={id:recordId,year,kind:'public-space-established',publicSpaceId:candidate.id};
    const gate=reviewPublicSpaceFoundation({
     siteIndex:0,year,candidate,buildings:site.buildings,
     housingBlocks:homes.blocks,existing:[],housingStatus:homes.status,records:[rec],
    });
    if(gate.status==='clear'){chosen=candidate;break;}
   }
   if(chosen)break;
  }
  if(chosen)break;
 }
 assert.ok(chosen,'既存施設周辺に歴史と両立する公共空地の敷地が必要');
 const confirmedRecord={id:recordId,year,tag:'地域',
  kind:'public-space-established',publicSpaceId:chosen.id,
  title:'共同の空地が定められる',body:'人々はここを共同で使うことにした。',
  causes:['寄り合いの確定記録'],relatedIds:[]};
 const next=appendConfirmedPublicSpace({
  history:ledger(),year,candidate:chosen,buildings:site.buildings,
  housingBlocks:homes.blocks,records:[...state.history,confirmedRecord],
 });
 state.history.push(confirmedRecord);
 state.publicSpaces=next;
 assert.deepEqual(snapshotAt(state,159,0),before);
 assert.deepEqual(snapshotAt(state,160,0).publicSpaces,[chosen]);
 const wire=serializeHousingSave(state),saved=parseHousingSave(wire);
 assert.deepEqual(saved,state);
 assert.deepEqual(snapshotAt(saved,160,0).publicSpaces,[chosen]);
 const corrupt=fn=>{
  const copy=JSON.parse(wire);fn(copy);
  assert.throws(()=>parseHousingSave(JSON.stringify(copy)),/公共空地履歴/);
 };
 corrupt(copy=>{copy.publicSpaces.events[0].after.footprint.width=500;});
 corrupt(copy=>{copy.publicSpaces.events[0].after.id='public-river-bank-fake';});
 corrupt(copy=>{copy.publicSpaces.events[0].causeRecordId='no-record';});
 corrupt(copy=>{copy.history=copy.history.filter(e=>e.id!==recordId);});
 corrupt(copy=>{copy.publicSpaces.events[0].after.kind='fortress';});
 assert.deepEqual(parseHousingSave(oldWire),JSON.parse(oldWire),'旧v4には存在しない公共空地を補完しない');
 while(state.year<400){step(state);if(state.pending)chooseAutomatically(state);}
 const future=parseHousingSave(serializeHousingSave(state));
 assert.deepEqual(publicSpacesAt(future.publicSpaces,400).spaces,[chosen]);
 assert.deepEqual(snapshotAt(future,159,0),before);
 console.log('D7-A-MANUAL-FIXTURE '+JSON.stringify({seed:42,year:160,kind:chosen.kind,
  footprint:chosen.footprint,anchor:chosen.anchorBuildingId,
  status:'explicit test fixture only: NOT natural history'}));
});
