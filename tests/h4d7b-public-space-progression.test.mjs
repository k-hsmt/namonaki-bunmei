import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {proposePublicSpaceProgression} from '../dist/story/public-space-progression.js';
import {appendConfirmedPublicSpace,appendConfirmedPublicSpaceUse,publicSpacesAt,reviewPublicSpaceFoundation} from '../dist/story/public-space-history.js';
import {createSettlementHistory,siteAt} from '../dist/story/settlement-history.js';
import {createHousingCivilization,parseHousingSave,serializeHousingSave} from '../dist/story/housing-persistence.js';
import {housingAt} from '../dist/story/housing-history.js';
import {step,chooseAutomatically,lastObservedYear} from '../dist/story/engine.js';
import {snapshotAt} from '../dist/scene/model.js';

const empty=()=>({schemaVersion:1,introducedYear:0,legacyUntracked:false,events:[]});
const council={kind:'council',active:true,originId:'council-origin',recordId:'council-established'};
function fixture(){
 const sites=createSettlementHistory([2000,0,0],0);
 const hall={id:'river-bank-3',kind:'hall',x:197,y:121,builtYear:0,condition:'intact',recordId:'hall-built'};
 sites[0].view.buildings.push(hall);sites[0].buildingChanges.push({year:0,building:hall});
 sites[0].view.practices=[council];sites[0].practiceChanges=[{year:0,practices:[council]}];
 const house={blockId:'test-home',siteId:'river-bank',footprint:{x:235,y:116,width:18,depth:8},
  builtYear:0,housingCount:3,condition:'sound',use:'occupied',styleId:'low',styleSeed:42};
 return {year:40,siteIndex:0,seed:42,spaces:empty(),sites,
  housing:{...empty(),events:[{year:0,seq:0,kind:'built',blockId:house.blockId,after:house,causeRecordId:'home-built'}]},
  population:2000,coverage:[1,1,1,1,1],shortageYears:0,recordId:'space-built'};
}
function found(input){
 const p=proposePublicSpaceProgression(input);assert.equal(p.status,'established');
 const record={id:input.recordId,year:input.year,kind:'public-space-established',publicSpaceId:p.space.id};
 const spaces=appendConfirmedPublicSpace({history:input.spaces,year:input.year,candidate:p.space,
  buildings:siteAt(input.sites,0,input.year).buildings,housingBlocks:housingAt(input.housing,input.year,'river-bank').blocks,records:[record]});
 return {...input,spaces};
}
const hold=(input,reason)=>assert.deepEqual(proposePublicSpaceProgression(input),{status:'hold',reason});
const advance=(state,to)=>{while(state.year<to){step(state);if(state.pending)chooseAutomatically(state);}};

test('D7-B: 社会史・住宅・余力と安全な敷地を要し、人口だけで成立しない',()=>{
 const input=fixture(),before=structuredClone(input);
 const p=proposePublicSpaceProgression(input);
 assert.equal(p.status,'established');assert.equal(p.space.kind,'assembly-ground');
 assert.deepEqual(proposePublicSpaceProgression(input),p);assert.deepEqual(input,before);
 assert.ok(p.relatedIds.includes(council.recordId));assert.ok(p.relatedIds.includes('hall-built'));
 hold({...input,siteIndex:1},'unsupported-terrain');hold({...input,siteIndex:2},'unsupported-terrain');
 hold({...input,spaces:undefined},'unknown-history');
 hold({...input,spaces:{...input.spaces,legacyUntracked:true}},'unknown-history');
 hold({...input,housing:{...input.housing,legacyUntracked:true}},'unknown-history');
 hold({...input,year:41},'not-ready');hold({...input,population:899},'no-capacity');
 hold({...input,coverage:[1,1,1,1,.91]},'no-capacity');hold({...input,coverage:[1,1]},'no-capacity');
 hold({...input,shortageYears:1},'no-capacity');hold({...input,housing:empty()},'no-housing');
 const absent=structuredClone(input);absent.sites[0].practiceChanges=[];hold(absent,'no-council');
 const interrupted=structuredClone(input);
 interrupted.sites[0].practiceChanges.push({year:30,practices:[]},{year:31,practices:[council]});
 hold(interrupted,'no-council');
 const damaged=structuredClone(input);
 damaged.sites[0].buildingChanges.push({year:30,building:{...input.sites[0].view.buildings[1],condition:'damaged'}},
  {year:31,building:{...input.sites[0].view.buildings[1]}});
 hold(damaged,'no-hall');
 const blocked={...input,housing:{...input.housing,events:[...input.housing.events]}};
 // 追加の敷地占有を全候補へ敷く。見栄えのために移設・不法配置しない。
 for(let i=0;i<20;i++){
  const b={...input.housing.events[0].after,blockId:'obstacle-'+i,
   footprint:{x:150+(i%5)*30,y:90+Math.floor(i/5)*20,width:30,depth:20}};
  blocked.housing.events.push({year:0,seq:i+1,kind:'built',blockId:b.blockId,after:b});
 }
 // 住宅どうしの重複を避けた別の既知台帳を使用。
 blocked.housing.events.shift();blocked.housing.events.forEach((e,i)=>e.seq=i);
 hold(blocked,'no-safe-plot');
});

test('D7-B: 8年継続で荒廃し、回復後は同じ土地を再利用する',()=>{
 const built=found(fixture());
 const space=publicSpacesAt(built.spaces,40).spaces[0];
 built.sites[0].practiceChanges.push({year:41,practices:[{...council,active:false,recordId:'council-lost'}]});
 hold({...built,year:47},'not-ready');
 const fade=proposePublicSpaceProgression({...built,year:48});
 assert.equal(fade.status,'overgrown');assert.equal(fade.reason,'practice-lost');
 assert.ok(fade.relatedIds.includes('council-lost'));
 const record={id:'fade',year:48,kind:'public-space-overgrown',publicSpaceId:space.id};
 const faded=appendConfirmedPublicSpaceUse({history:built.spaces,year:48,spaceId:space.id,
  kind:'overgrown',causeRecordId:'fade',records:[record]});
 built.sites[0].practiceChanges.push({year:50,practices:[{...council,recordId:'council-returned'}]});
 hold({...built,spaces:faded,year:65},'no-council');
 const renewed=proposePublicSpaceProgression({...built,spaces:faded,year:66});
 assert.equal(renewed.status,'reused');assert.deepEqual(renewed.space.footprint,space.footprint);
 assert.equal(renewed.space.id,space.id);assert.ok(renewed.relatedIds.includes('fade'));
 const same=proposePublicSpaceProgression({...found(fixture()),year:60});
 assert.equal(same.status,'hold','利用中の空地があれば追加成立しない');
 assert.deepEqual(publicSpacesAt(faded,40).spaces,[space],'荒廃を追記しても過去は不変');
});

test('D7-B: 単年の被害で荒廃せず、集会所の不使用・住宅の空き家・長期不足も検知',()=>{
 const built=found(fixture());
 const badHall=structuredClone(built),hall=badHall.sites[0].view.buildings[1];
 badHall.sites[0].buildingChanges.push({year:50,building:{...hall,condition:'ruined'}});
 hold({...badHall,year:56},'not-ready');
 assert.equal(proposePublicSpaceProgression({...badHall,year:57}).reason,'anchor-unavailable');
 const vacant=structuredClone(built),home=vacant.housing.events[0].after;
 vacant.housing.events.push({year:50,seq:0,kind:'vacated',blockId:home.blockId,after:{...home,use:'vacant'}});
 hold({...vacant,year:56},'not-ready');
 assert.equal(proposePublicSpaceProgression({...vacant,year:57}).reason,'homes-vacant');
 hold({...built,year:60,coverage:[1,1,1,1,.8],shortageYears:7},'not-ready');
 assert.equal(proposePublicSpaceProgression({...built,year:60,coverage:[.8,.8,.8,.8,.8],shortageYears:8}).reason,'prolonged-shortage');
});

test('D7-B: 自然史3seedの成立・荒廃・再利用、保存再開・旧v4・選択待ちを監査',async()=>{
 const report=[];
 for(const seed of [7,42,82]){
  const state=createHousingCivilization(seed);advance(state,1000);
  const past=snapshotAt(state,500,0),restored=parseHousingSave(serializeHousingSave(state));
  advance(state,2000);advance(restored,2000);assert.deepEqual(restored,state);
  assert.deepEqual(snapshotAt(state,500,0),past);
  const events=state.publicSpaces.events;
  assert.ok(events.some(e=>e.kind==='established'));assert.ok(events.some(e=>e.kind==='overgrown'));
  assert.equal(events.filter(e=>e.kind==='established').length,1);
  for(const e of events){
   const r=state.history.find(r=>r.id===e.causeRecordId);
   assert.equal(r.kind,'public-space-'+e.kind);assert.equal(r.publicSpaceId,e.spaceId);
   for(const id of r.relatedIds)assert.ok(state.history.some(source=>source.id===id),'出典IDが実在');
   assert.ok(e.year<=lastObservedYear(state));
   if(e.kind==='established'){
    assert.equal(snapshotAt(state,e.year-1,0).publicSpaces,undefined);
    assert.deepEqual(snapshotAt(state,e.year,0).publicSpaces,[e.after]);
    const gate=reviewPublicSpaceFoundation({siteIndex:0,year:e.year,candidate:e.after,
     buildings:siteAt(state.observation.sites,0,e.year).buildings,
     housingBlocks:housingAt(state.housing,e.year,'river-bank').blocks,
     existing:[],records:state.history,housingStatus:'known'});
    assert.equal(gate.status,'clear');
   }
  }
  // 未確定年に空地の更新を先取りせず、同じ選択で保存・再開できる。
  const pending=createHousingCivilization(seed);
  while(!pending.pending&&pending.year<2000)step(pending);
  assert.ok(pending.pending);assert.ok(pending.publicSpaces.events.every(e=>e.year<=lastObservedYear(pending)));
  const waiting=parseHousingSave(serializeHousingSave(pending));
  chooseAutomatically(pending);chooseAutomatically(waiting);assert.deepEqual(waiting,pending);
  const old=createHousingCivilization(seed);delete old.publicSpaces;advance(old,1000);
  const oldWire=serializeHousingSave(old),oldPast=snapshotAt(old,500,0);
  const oldRestored=parseHousingSave(oldWire);advance(oldRestored,2000);advance(old,2000);
  assert.deepEqual(oldRestored,old);assert.equal(old.publicSpaces,undefined);
  assert.deepEqual(snapshotAt(old,500,0),oldPast);
  report.push({seed,events:events.map(e=>({year:e.year,kind:e.kind,spaceId:e.spaceId,
   footprint:e.after.footprint,causeRecordId:e.causeRecordId})),bytes:Buffer.byteLength(serializeHousingSave(state))});
 }
 assert.ok(report.some(r=>r.events.some(e=>e.kind==='reused')),'再利用が自然史にあること');
 await mkdir('artifacts/h4d7b-natural',{recursive:true});
 await writeFile('artifacts/h4d7b-natural/audit.json',JSON.stringify({status:'ACTUAL natural history',report},null,2));
 console.log('H4-D7-B-NATURAL '+JSON.stringify(report));
});
