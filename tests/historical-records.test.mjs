/** Issue #39 D1: the read-only history of facilities, housing blocks, bridges and waterways (D0 §3, §4, §10 D1). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalSourceOf,historicalSubjectAt,historicalTargetsAt,historicalSiteIds,housingTargetOfRoofPart,sameHistoricalTarget} from '../dist/story/historical-records.js';
import {siteAt} from '../dist/story/settlement-history.js';
import {housingAt} from '../dist/story/housing-history.js';
import {productionChannelAt} from '../dist/irrigation/production-history-v1.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import * as P from '../dist/architecture/production-v1.js';
import {architectureProductionSession,observeGeneratedWorldSession,prepareWorldSessionSave,restoreWorldSession} from '../dist/story/world-session.js';
import {parseWorldSaveAsync,serializeWorldSave} from '../dist/story/world-save.js';

// ---- plain-data source (the reader is structural) ----
const R=(id,year,kind,buildingId)=>({id,year,kind,...(buildingId?{buildingId}:{})});
const F=(year,id,kind,condition,recordId,builtYear,extra={})=>({year,building:{id,kind,x:10,y:20,builtYear,condition,...(recordId?{recordId}:{}),...extra}});
const block=(over={})=>({blockId:'b1',siteId:'river-bank',footprint:{x:100,y:150,width:12,depth:6},builtYear:60,housingCount:2,condition:'sound',use:'occupied',styleId:'low',styleSeed:7,...over});
const H=(year,seq,kind,after,causeRecordId)=>({year,seq,kind,blockId:'b1',after:block(after),...(causeRecordId?{causeRecordId}:{})});
const C=(seq,year,kind,status,cause)=>({seq,id:'ev-'+seq,year,systemId:'ch1',kind,cause,before:null,after:{id:'ch1',status,lastMaintainedYear:year,lastMaintainedEventId:'ev-'+seq,abandonedYear:null,abandonedEventId:null}});
function source(over={}){
 return {
  confirmedThrough:400,
  history:[R('0-0',0,undefined),R('5-1',5,'building-built','r-0'),R('50-2',50,'building-damaged','r-0'),R('55-3',55,'building-repaired','r-0'),
   R('60-4',60,'housing-built','b1'),R('70-5',70,'building-built','r-7'),R('80-6',80,'irrigation'),R('90-7',90,'building-damaged','r-7'),
   R('120-8',120,'building-abandoned','r-0'),R('150-9',150,'housing-damaged','b1'),R('160-10',160,'housing-ruined','b1'),
   R('200-11',200,'building-reused','r-0'),R('210-12',210,'housing-repaired','b1'),R('250-13',250,'flood'),R('300-14',300,'building-damaged','r-0')],
  sites:[{buildingChanges:[
   F(0,'r-h','house','intact',undefined,0),
   F(5,'r-0','hall','intact','5-1',5),F(8,'r-f','field','intact',undefined,8),F(50,'r-0','hall','damaged','50-2',5),F(55,'r-0','hall','intact','55-3',5),
   F(70,'r-7','bridge','intact','70-5',70),F(90,'r-7','bridge','damaged','90-7',70),
   F(120,'r-0','hall','ruined','120-8',5),F(200,'r-0','hall','intact','200-11',5),
   // a condition change whose record is of another year: never linked
   F(300,'r-0','hall','damaged','250-13',5),
  ]},{buildingChanges:[F(30,'h-1','granary','intact',undefined,30)]},{buildingChanges:[]}],
  housing:{introducedYear:0,legacyUntracked:false,events:[
   H(60,0,'built',{},'60-4'),H(150,0,'damaged',{condition:'damaged'},'150-9'),H(160,0,'ruined',{condition:'ruined',use:'vacant'},'160-10'),
   H(210,0,'repaired',{condition:'sound',use:'vacant',lastRenovatedYear:210},'210-12')]},
  bridges:[{geometry:{bridgeId:'r-7'},builtYear:70,sourceRecordId:'70-5'}],
  irrigation:{introducedYear:0,confirmedThrough:400,events:[
   C(1,80,'built','active',{kind:'chronicle',recordId:'80-6'}),
   C(2,120,'damaged','damaged',{kind:'chronicle',recordId:'80-6'}),// a chronicle id of another year: not linked
   C(3,160,'abandoned','abandoned',{kind:'policy-clock',parentEventId:'ev-2',elapsed:40}),
   C(4,180,'backfilled','retired',{kind:'land-use',recordIds:['150-9'],objectId:null})]},
  births:[
   {ref:{kind:'facility',siteId:'river-bank',id:'r-0'},source:{kind:'built',year:5,recordId:'5-1'}},
   {ref:{kind:'facility',siteId:'river-bank',id:'r-0'},source:{kind:'rebuilt',year:200,recordId:'200-11'},rebuild:{generation:2,mode:'mixed'}},
   {ref:{kind:'housing',siteId:'river-bank',blockId:'b1'},source:{kind:'built',year:60,seq:0,recordId:'60-4'}},
   {ref:{kind:'housing',siteId:'river-bank',blockId:'b1'},source:{kind:'expanded',year:61,seq:0}},
   {ref:{kind:'housing',siteId:'river-bank',blockId:'b1'},source:{kind:'rebuilt',year:210,seq:0,recordId:'210-12'},rebuild:{generation:2,mode:'old'}},
  ],
  ...over,
 };
}
const at=(src,ref,year)=>historicalSubjectAt(src,ref,year);
const summary=s=>s.history.map(c=>[c.year,c.kind,c.linkedChronicleId??null]);

test('D1: a rebuilt facility keeps one lineage and tells its generations apart',()=>{
 const src=source(),ref={kind:'facility',id:'r-0'};
 const before=at(src,ref,199);
 assert.equal(before.presence,'recorded');assert.equal(before.currentCondition,'廃墟になっている');
 assert.deepEqual(before.generations.map(g=>[g.generation,g.year]),[[1,5]],'the later rebuild is not visible before its year');
 const after=at(src,ref,200);
 assert.deepEqual(after.generations.map(g=>[g.generation,g.year,g.kind,g.mode??null]),[[1,5,'built',null],[2,200,'rebuilt','mixed']]);
 const rebuilt=after.history.at(-1);
 assert.deepEqual([rebuilt.kind,rebuilt.generation,rebuilt.linkedChronicleId],['reused',2,'200-11']);
 assert.match(rebuilt.label,/第2世代/);
 assert.equal(after.firstYear,5,'the lineage starts at the first construction, not at the rebuild');
 assert.deepEqual(summary(after),[[5,'built','5-1'],[50,'damaged','50-2'],[55,'repaired','55-3'],[120,'abandoned','120-8'],[200,'reused','200-11']]);
});

test('D1: a chronicle entry is linked only by an explicit id of the same year and target',()=>{
 const src=source(),s=at(src,{kind:'facility',id:'r-0'},400);
 const late=s.history.at(-1);
 assert.deepEqual([late.year,late.kind,late.linkedChronicleId],[300,'condition',undefined],'a record of another year is not the reason of this change');
 assert.equal(late.label,'状態の記録：損傷している');
 // a record that names another building, or whose kind disagrees with the condition, is not linked either
 const other=source({history:source().history.map(r=>r.id==='50-2'?{...r,buildingId:'r-h'}:r.id==='55-3'?{...r,kind:'building-abandoned'}:r)});
 assert.deepEqual(summary(at(other,{kind:'facility',id:'r-0'},60)),[[5,'built','5-1'],[50,'condition',null],[55,'condition',null]]);
 // the founding house of year 0 has no record: it is built (by its built year) but linked to nothing
 assert.deepEqual(summary(at(src,{kind:'facility',id:'r-h'},0)),[[0,'built',null]]);
});

test('D1: housing roof parts all lead to their block; the block history is the housing events, nothing invented',()=>{
 const a=housingTargetOfRoofPart({partId:'b1:0',blockId:'b1'}),b=housingTargetOfRoofPart({partId:'b1:1',blockId:'b1'});
 assert.deepEqual(a,{kind:'housing-block',blockId:'b1'});assert.ok(sameHistoricalTarget(a,b));
 assert.throws(()=>housingTargetOfRoofPart({partId:'x'}));
 const s=at(source(),a,400);
 assert.deepEqual(summary(s),[[60,'built','60-4'],[150,'damaged','150-9'],[160,'ruined','160-10'],[210,'repaired','210-12']]);
 assert.equal(s.history.at(-1).generation,2,'the repair of a ruin began the second generation');
 assert.deepEqual(s.generations.map(g=>g.generation),[1,2],'an expansion adds parts but is not a generation');
 assert.equal(s.currentCondition,'空き家になっている');
 assert.equal(at(source(),a,155).currentCondition,'損傷している（住まわれている）');
 for(const c of s.history)assert.doesNotMatch(c.label+c.condition,/住人|一戸/,'no resident story is generated');
});

test('D1: a bridge is tied to its ledger; damage is never shown as passable; a mismatch is unsupported',()=>{
 const src=source(),ref={kind:'bridge',id:'r-7'};
 assert.equal(at(src,ref,89).currentCondition,'渡ることができる');
 assert.equal(at(src,ref,90).currentCondition,'損傷して渡れない');
 assert.deepEqual(summary(at(src,ref,400)),[[70,'built','70-5'],[90,'damaged','90-7']]);
 assert.equal(at(src,{kind:'facility',id:'r-7'},400).presence,'unknown','a bridge is not also a facility');
 const broken=source({bridges:[{geometry:{bridgeId:'r-7'},builtYear:70,sourceRecordId:'90-7'}]});
 const s=at(broken,ref,400);
 assert.deepEqual([s.presence,s.history.length,s.currentCondition],['unsupported',0,null]);
 assert.ok(historicalTargetsAt(broken,'river-bank',400).some(x=>x.presence==='unsupported'),'the list does not silently drop it');
 assert.ok(!historicalTargetsAt(broken,'river-bank',60).some(x=>x.presence==='unsupported'),'nor lists it before its first record');
 assert.equal(at(source({bridges:[]}),ref,400).presence,'unsupported','a bridge without a ledger entry');
});

test('D1: a waterway reads its own events; only a same-year chronicle cause is a chronicle entry',()=>{
 const src=source(),ref={kind:'waterway',systemId:'ch1'};
 const s=at(src,ref,400);
 assert.deepEqual(summary(s),[[80,'built','80-6'],[120,'damaged',null],[160,'abandoned',null],[180,'backfilled',null]]);
 assert.deepEqual(s.history.map(c=>c.sourceId),['ev-1','ev-2','ev-3','ev-4']);
 assert.equal(s.currentCondition,'埋め戻されている');
 assert.equal(at(src,ref,170).currentCondition,'放棄されている');
 assert.equal(at(src,ref,0).presence,'unknown','records begin after the introduction year');
 assert.equal(at(src,ref,79).presence,'not-yet-built');
 assert.ok(historicalTargetsAt(src,'river-bank',400).some(x=>x.ref.kind==='waterway'),'a backfilled waterway stays in the land record');
 assert.ok(!historicalTargetsAt(src,'hill-side',400).some(x=>x.ref.kind==='waterway'));
});

test('D1: unknown, not yet built and the future are kept apart; years must be confirmed',()=>{
 const src=source();
 assert.equal(at(src,{kind:'facility',id:'r-0'},4).presence,'not-yet-built');
 assert.equal(at(src,{kind:'facility',id:'r-0'},4).name,'川辺の集会所','the name carries no construction year (safe before it)');
 assert.equal(at(src,{kind:'bridge',id:'r-7'},400).name,'川辺の橋');assert.equal(at(src,{kind:'waterway',systemId:'ch1'},0).name,'川辺の水路');
 assert.equal(at(src,{kind:'housing-block',blockId:'b1'},0).name,'川辺の住宅街区');
 assert.deepEqual(at(src,{kind:'facility',id:'r-0'},4).history,[]);
 assert.equal(at(src,{kind:'housing-block',blockId:'b1'},59).presence,'not-yet-built');
 const none=at(src,{kind:'facility',id:'nowhere'},100);
 assert.deepEqual([none.presence,none.siteId,none.history.length],['unknown',undefined,0]);
 const legacy=source({housing:{...source().housing,introducedYear:40,legacyUntracked:true,events:source().housing.events}});
 assert.equal(at(legacy,{kind:'housing-block',blockId:'b1'},39).presence,'unknown','before untracked housing records began');
 // the list for a year holds only what existed by then, and each history stops at that year
 for(const year of [0,5,59,60,100,199,200,400]){
  for(const site of historicalSiteIds)for(const s of historicalTargetsAt(src,site,year)){
   assert.equal(s.presence,'recorded');assert.ok(s.firstYear<=year);
   for(const c of s.history)assert.ok(c.year<=year,`${year}: ${c.year} leaked`);
   for(const g of s.generations)assert.ok(g.year<=year);
  }
 }
 assert.deepEqual(historicalTargetsAt(src,'river-bank',4).map(s=>s.ref),[{kind:'facility',id:'r-h'}]);
 assert.ok(!historicalTargetsAt(src,'river-bank',400).some(s=>s.ref.id==='r-f'),'fields are land use, not a D1 target');
 for(const y of [-1,1.5,401,NaN,'5',Infinity])assert.throws(()=>at(src,{kind:'facility',id:'r-0'},y),RangeError);
 assert.throws(()=>historicalTargetsAt(src,'river-bank',401),RangeError);
 // a broken housing history fails closed rather than being repaired
 assert.throws(()=>historicalTargetsAt(source({housing:{...source().housing,events:[H(60,0,'damaged',{condition:'damaged'})]}}),'river-bank',100));
});

// ---- a real world ----
const END=1200;
const real=(async()=>{
 const world=await P.advanceArchitectureWorld((await createNewArchitectureWorld(42)).architecture,END,'automatic');
 return {world,session:architectureProductionSession(world)};
})();
const facilityText={intact:'建っている',damaged:'損傷している',ruined:'廃墟になっている'},bridgeText={intact:'渡ることができる',damaged:'損傷して渡れない',ruined:'廃墟となり渡れない'};
const waterText={active:'水が流れている',idle:'休止している',damaged:'傷み、水が止まっている',abandoned:'放棄されている',retired:'埋め戻されている'};

test('D1 real world: every answer agrees with the existing readers of the same confirmed year',async()=>{
 const {session}=await real,state=session.state,src=historicalSourceOf(session),records=new Map(state.history.map(r=>[r.id,r]));
 assert.equal(src.confirmedThrough,END);
 const kinds=new Set(),seen=new Set();
 for(const year of [0,60,577,700,800,1100,1148,1151,1200])historicalSiteIds.forEach((siteId,si)=>{
  const list=historicalTargetsAt(src,siteId,year),site=siteAt(state.observation.sites,si,year),homes=housingAt(state.housing,year,siteId).blocks;
  for(const s of list){
   kinds.add(s.ref.kind);seen.add(s.ref.kind+':'+(s.ref.id??s.ref.blockId??s.ref.systemId));
   assert.equal(s.presence,'recorded',`${year} ${s.title}`);
   for(const c of s.history){
    assert.ok(c.year<=year);
    if(c.linkedChronicleId){const r=records.get(c.linkedChronicleId);assert.equal(r.year,c.year);if(s.ref.kind!=='waterway')assert.equal(r.buildingId,s.ref.id??s.ref.blockId);}
   }
   if(s.ref.kind==='facility'||s.ref.kind==='bridge'){const b=site.buildings.find(b=>b.id===s.ref.id);assert.ok(b,`${year} ${s.ref.id} stands in the ledger`);assert.equal(s.currentCondition,(s.ref.kind==='bridge'?bridgeText:facilityText)[b.condition]);}
   if(s.ref.kind==='housing-block')assert.ok(homes.some(b=>b.blockId===s.ref.blockId));
   if(s.ref.kind==='waterway')assert.equal(s.currentCondition,waterText[productionChannelAt(session.review,year).channel.status]);
  }
  // nothing that stands in the ledger is missing from the land record (fields are land use)
  for(const b of site.buildings)if(b.kind!=='field')assert.ok(list.some(s=>s.ref.id===b.id),`${year} ${b.id} listed`);
  for(const b of homes)assert.ok(list.some(s=>s.ref.blockId===b.blockId),`${year} ${b.blockId} listed`);
  // every drawn roof part leads to a listed block; every drawn structure to a listed facility or bridge
  const o=observeGeneratedWorldSession(session,year,si);
  for(const p of o.composition.residentialBlocks??[])for(const part of p.roofParts)assert.ok(list.some(s=>sameHistoricalTarget(s.ref,housingTargetOfRoofPart(part))),`${year} roof ${part.partId}`);
  for(const x of o.snapshot.objects)if(x.kind!=='field')assert.ok(list.some(s=>s.ref.id===x.id),`${year} structure ${x.id} (${x.kind})`);
 });
 assert.deepEqual([...kinds].sort(),['bridge','facility','housing-block','waterway'],'this world exercises all four target kinds');
 const rebuilt=historicalTargetsAt(src,'river-bank',END).filter(s=>s.generations.length>1);
 assert.ok(rebuilt.length,'a rebuilt facility or block exists by '+END);
 // a target built later is not yet built in an earlier year
 const market=historicalTargetsAt(src,'river-bank',END).find(s=>s.firstYear>700);
 assert.equal(historicalSubjectAt(src,market.ref,700).presence,'not-yet-built');
 assert.ok(!historicalTargetsAt(src,'river-bank',700).some(s=>sameHistoricalTarget(s.ref,market.ref)));
});

test('D1 real world: reading changes nothing and survives save and restore unchanged',async()=>{
 const {session}=await real;
 const before=serializeWorldSave(await prepareWorldSessionSave(session)),rng=session.state.rngState,records=session.state.history.length;
 const src=historicalSourceOf(session),all=y=>historicalSiteIds.flatMap(site=>historicalTargetsAt(src,site,y));
 const answers=[0,400,800,END].map(all);
 for(const s of all(END))for(const y of [0,s.firstYear??0,END])historicalSubjectAt(src,s.ref,y);
 assert.equal(serializeWorldSave(await prepareWorldSessionSave(session)),before,'the save is byte-identical after reading');
 assert.equal(session.state.rngState,rng);assert.equal(session.state.history.length,records);
 assert.equal(historicalSourceOf(session),src,'the source is cached per world');
 const restored=restoreWorldSession(await parseWorldSaveAsync(before));
 assert.deepEqual([0,400,800,END].map(y=>historicalSiteIds.flatMap(site=>historicalTargetsAt(historicalSourceOf(restored),site,y))),answers);
});
