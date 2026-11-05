import test from 'node:test';
import assert from 'node:assert/strict';
import {createCivilization,step,chooseAutomatically} from '../dist/story/engine.js';
import {createHousingCivilization,findSavedHousing,parseHousingSave,serializeHousingSave,CURRENT_SAVE_KEY} from '../dist/story/housing-persistence.js';
import {housingAt} from '../dist/story/housing-history.js';
const json=x=>JSON.parse(JSON.stringify(x));

test('新規作成と再作成は住宅ゼロを既知として保存し、エンジンの乱数には干渉しない',()=>{
 const a=createHousingCivilization(42),b=createCivilization(42);
 assert.equal(a.version,4);
 assert.equal(a.housing.introducedYear,0);
 assert.equal(a.housing.legacyUntracked,false);
 assert.equal(housingAt(a.housing,0).status,'known');
 const {version,housing,...withoutHousing}=a;
 const {version:oldVersion,...original}=b;
 assert.deepEqual(withoutHousing,original);
 assert.deepEqual(parseHousingSave(serializeHousingSave(a)),a);
 const first=json(a);
 step(a);step(b);
 assert.equal(a.rngState,b.rngState);
 assert.deepEqual(a.observation,b.observation);
 assert.deepEqual(first.housing.events,[]);
});
test('v3の選択待ちセーブをロードして同じ選択で再開できる',()=>{
 const old=createCivilization(731);
 while(!old.pending&&old.year<3000)step(old);
 assert.ok(old.pending);
 const before=json(old);
 const a=parseHousingSave(JSON.stringify(old)),b=parseHousingSave(JSON.stringify(old));
 assert.deepEqual(old,before);
 assert.equal(a.housing.introducedYear,old.observation.lastYear+1);
 assert.equal(housingAt(a.housing,old.observation.lastYear).status,'unknown');
 assert.equal(housingAt(a.housing,a.housing.introducedYear).status,'partial');
 chooseAutomatically(a);chooseAutomatically(b);
 assert.deepEqual(a,b);
 step(a);step(b);
 assert.deepEqual(a,b);
 assert.deepEqual(parseHousingSave(serializeHousingSave(a)),a);
});
test('現行キーの破損があっても旧キーに自動フォールバックしない',()=>{
 const data=new Map([
  ['namonaki-story-v3',JSON.stringify(createCivilization(42))],
  [CURRENT_SAVE_KEY,'{ invalid'],
 ]);
 const found=findSavedHousing(k=>data.get(k)??null);
 assert.equal(found.key,CURRENT_SAVE_KEY);
 assert.throws(()=>parseHousingSave(found.raw),SyntaxError);
 assert.equal(data.get(CURRENT_SAVE_KEY),'{ invalid');
 data.delete(CURRENT_SAVE_KEY);
 assert.equal(findSavedHousing(k=>data.get(k)??null).key,'namonaki-story-v3');
 assert.equal(findSavedHousing(()=>null),null);
});
test('不正なv4は保存前に拒否し既存データを生成しない',()=>{
 const a=createHousingCivilization(42);
 delete a.housing;
 assert.throws(()=>serializeHousingSave(a),/住宅保存形式/);
});
