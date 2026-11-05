import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCivilization,step,chooseAutomatically} from '../dist/story/engine.js';
import {prepareHousingSave,validateHousingSave} from '../dist/story/housing-save.js';
import {housingAt} from '../dist/story/housing-history.js';
import {snapshotAt} from '../dist/scene/model.js';
const fixture=name=>JSON.parse(readFileSync(new URL('./fixtures/'+name+'.json',import.meta.url),'utf8'));
const json=x=>JSON.parse(JSON.stringify(x));
const init=()=>{
 const s=createCivilization(42);
 return {...s,version:4,housing:{schemaVersion:1,introducedYear:0,legacyUntracked:false,events:[]}};
};
test('新規v4は履歴を正確にゼロとして扱い冪等に読み込む',()=>{
 const a=init(),before=json(a);
 const b=prepareHousingSave(a);
 assert.deepEqual(b,before);
 assert.deepEqual(validateHousingSave(b),b);
 assert.deepEqual(a,before);
 assert.deepEqual(housingAt(b.housing,0),{status:'known',blocks:[]});
 assert.throws(()=>validateHousingSave(createCivilization(42)),/v4/);
});
test('v3通常年の旧住宅は不明で、既存人口・施設・乱数を変更しない',()=>{
 const old=createCivilization(42);
 for(let i=0;i<25;i++){step(old);if(old.pending)chooseAutomatically(old);}
 const before=json(old),scene=snapshotAt(old,old.observation.lastYear);
 const result=prepareHousingSave(old);
 assert.deepEqual(old,before);
 assert.equal(result.version,4);
 assert.equal(result.housing.introducedYear,old.observation.lastYear+1);
 assert.equal(housingAt(result.housing,old.observation.lastYear).status,'unknown');
 assert.equal(housingAt(result.housing,old.observation.lastYear+1).status,'partial');
 assert.equal(result.rngState,old.rngState);
 assert.deepEqual(result.observation,old.observation);
 assert.deepEqual(snapshotAt(result,old.observation.lastYear),scene);
 assert.deepEqual(prepareHousingSave(result),result);
});
test('v3選択待ちは最後の確定年の翌年を住宅境界とする',()=>{
 const old=createCivilization(731);
 while(!old.pending&&old.year<3000)step(old);
 assert.ok(old.pending);
 const boundary=old.observation.lastYear+1;
 assert.equal(boundary,old.year);
 const result=prepareHousingSave(old);
 assert.equal(result.housing.introducedYear,boundary);
 assert.deepEqual(result.pending,old.pending);
 assert.equal(result.rngState,old.rngState);
});
test('v05の通常・選択待ちfixtureは未記録境界を保持',()=>{
 for(const name of ['v05-seed42-year473','v05-seed82-pending']){
  const old=fixture(name),raw=json(old),scenes=[old.year-1,old.year].map(y=>snapshotAt(old,y));
  const result=prepareHousingSave(old);
  assert.deepEqual(old,raw);
  assert.equal(result.version,4);
  assert.equal(result.housing.introducedYear,old.year+1);
  assert.deepEqual(result.observation.people,[0,0,0,old.population]);
  assert.equal(result.observation.legacy.year,old.year);
  assert.equal(result.rngState,old.rngState);
  for(const scene of scenes)assert.deepEqual(snapshotAt(result,scene.year),scene);
  assert.deepEqual(prepareHousingSave(result),result);
 }
});
test('v4の住宅欠損・未知の版・余分な属性・未来イベントは拒否',()=>{
 const base=init();
 const cases=[
  {...base,housing:undefined},
  {...base,housing:{...base.housing,schemaVersion:2}},
  {...base,housing:{...base.housing,untrackedHousingCount:20}},
  {...base,housing:{...base.housing,introducedYear:2}},
  {...base,housing:{...base.housing,events:[{
   year:100,seq:0,kind:'built',blockId:'future',after:{
    blockId:'future',siteId:'river-bank',footprint:{x:5,y:5,width:10,depth:5},
    builtYear:100,housingCount:1,condition:'sound',use:'occupied',
    styleId:'low',styleSeed:1,
   },
  }]}}
 ];
 for(const v of cases)assert.throws(()=>prepareHousingSave(v),/住宅保存形式/,JSON.stringify(v.housing));
});
test('v4建設イベントはJSON往復で同じ街区状態になる',()=>{
 const s=init();
 const after={blockId:'h1',siteId:'river-bank',footprint:{x:6,y:8,width:18,depth:9},
  builtYear:0,housingCount:3,condition:'sound',use:'occupied',styleId:'terraced',styleSeed:42};
 s.housing.events.push({year:0,seq:0,kind:'built',blockId:'h1',after});
 const before=json(s),v=prepareHousingSave(json(s));
 assert.deepEqual(v,before);
 assert.deepEqual(housingAt(v.housing,0),housingAt(s.housing,0));
 assert.deepEqual(s,before);
});
