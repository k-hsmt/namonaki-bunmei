import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeHousingLifecycle,appendHousingLifecycle} from '../dist/story/housing-lifecycle.js';
import {housingAt} from '../dist/story/housing-history.js';
import {createHousingCivilization} from '../dist/story/housing-persistence.js';
import {step,chooseAutomatically} from '../dist/story/engine.js';
import {snapshotAt} from '../dist/scene/model.js';
const json=x=>JSON.parse(JSON.stringify(x));
const block=(id,year=10)=>({
 blockId:id,siteId:'river-bank',footprint:{x:15,y:145,width:18,depth:8},
 builtYear:year,housingCount:3,condition:'sound',use:'occupied',
 styleId:'terraced',styleSeed:42,
});
const built=(b)=>({year:b.builtYear,seq:0,kind:'built',blockId:b.blockId,after:b,causeRecordId:'event-built'});
const initial=(b=block('home'))=>({introducedYear:0,legacyUntracked:false,events:[built(b)]});
const propose=(history,year,options={})=>proposeHousingLifecycle({
 history,year,siteId:'river-bank',population:1500,coverage:1,shortageYears:0,...options,
});
const apply=(history,year,options,expected)=>{
 const result=propose(history,year,options);
 assert.equal(result?.kind,expected,'wrong event at year '+year);
 const next=appendHousingLifecycle(history,year,result,'cause-'+year);
 assert.equal(next.events.at(-1).causeRecordId,'cause-'+year);
 return next;
};
test('建設→低利用→空き家→損傷→廃墟→修繕→再利用の履歴と年次不変性',()=>{
 let history=initial();
 const baseline=json(history);
 assert.equal(propose(history,12,{coverage:.5,shortageYears:20}),null);
 history=apply(history,22,{coverage:.8,shortageYears:5},'underused');
 history=apply(history,30,{coverage:.7,shortageYears:9},'vacated');
 history=apply(history,32,{hazard:{id:'flood32',kind:'flood'}},'damaged');
 assert.equal(propose(history,33,{coverage:.4,shortageYears:20}),null);
 history=apply(history,47,{coverage:.6,shortageYears:12},'ruined');
 assert.equal(housingAt(history,48).blocks[0].use,'vacant');
 assert.equal(propose(history,50,{coverage:1}),null);
 history=apply(history,59,{coverage:.97},'repaired');
 assert.equal(housingAt(history,59).blocks[0].use,'vacant');
 assert.equal(housingAt(history,59).blocks[0].lastRenovatedYear,59);
 history=apply(history,62,{coverage:.96},'reused');
 assert.equal(housingAt(history,62).blocks[0].use,'occupied');
 assert.equal(housingAt(history,31).blocks[0].condition,'sound');
 assert.equal(housingAt(history,31).blocks[0].use,'vacant');
 assert.equal(housingAt(history,48).blocks[0].condition,'ruined');
 const final=housingAt(history,62).blocks[0];
 assert.deepEqual(final.footprint,baseline.events[0].after.footprint);
 assert.equal(final.builtYear,10);assert.equal(final.styleId,'terraced');
 assert.equal(final.housingCount,3);
 assert.deepEqual(initial(),baseline);
 assert.deepEqual(housingAt(json(history),62),housingAt(history,62));
});
test('災害原因がないと住宅損傷は発生せず、丘陵・入り江に河畔災害を適用しない',()=>{
 const h=initial();
 assert.equal(propose(h,20,{hazard:undefined}),null);
 assert.equal(propose(h,20,{hazard:{id:'f20',kind:'flood'}})?.kind,'damaged');
 const other=proposeHousingLifecycle({history:h,year:20,siteId:'hill-side',
  population:1500,coverage:1,shortageYears:0,hazard:{id:'f20',kind:'flood'}});
 assert.equal(other,null);
});
test('同年の建設イベントと状態イベントのseqは衝突しない',()=>{
 const b=block('older');
 const fresh=block('new',60);
 fresh.footprint.x=45;
 const h={introducedYear:0,legacyUntracked:false,events:[
  built(b),{...built(fresh),year:60,seq:0},
 ]};
 const result=propose(h,60,{hazard:{id:'quake60',kind:'earthquake'}});
 assert.equal(result?.blockId,'older');
 const after=appendHousingLifecycle(h,60,result,'life60');
 assert.equal(after.events.at(-1).seq,1);
 assert.equal(housingAt(after,60).blocks.length,2);
 assert.throws(()=>appendHousingLifecycle(after,60,result,'duplicate'),/重複/);
 assert.deepEqual(h.events.length,2);
});
test('移行境界以前と住宅未記録期間には状態遷移を遡及作成しない',()=>{
 const h={introducedYear:100,legacyUntracked:true,events:[]};
 assert.equal(propose(h,99,{coverage:.1,shortageYears:100}),null);
 assert.equal(propose(h,101,{coverage:.1,shortageYears:100}),null);
 assert.equal(housingAt(h,99).status,'unknown');
 assert.equal(housingAt(h,101).status,'partial');
});
test('自然進行の同seedと再開は人口・住宅・施設・原因記録まで決定的',()=>{
 const a=createHousingCivilization(42),b=createHousingCivilization(42);
 const run=(s,target)=>{
  while(s.year<target){
   step(s);
   if(s.pending)chooseAutomatically(s);
  }
 };
 run(a,750);run(b,750);
 assert.deepEqual(a,b);
 assert.ok(a.housing.events.some(e=>e.kind==='built'));
 for(const e of a.housing.events){
  assert.ok(e.causeRecordId);
  assert.ok(a.history.some(x=>x.id===e.causeRecordId&&x.buildingId===e.blockId));
 }
 const imageBefore=snapshotAt(a,400,0);
 const restored=json(a);
 run(a,900);run(restored,900);
 assert.deepEqual(a,restored);
 assert.deepEqual(snapshotAt(a,400,0),imageBefore);
 assert.equal(housingAt(a.housing,900).blocks.length,housingAt(restored.housing,900).blocks.length);
});
