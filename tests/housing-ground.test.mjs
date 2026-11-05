import test from 'node:test';
import assert from 'node:assert/strict';
import {findHousingGroundConflicts} from '../dist/scene/housing-ground.js';
const block=(id,x,y,w=12,d=6)=>({
 blockId:id,siteId:'river-bank',footprint:{x,y,width:w,depth:d},
 builtYear:10,housingCount:4,condition:'sound',use:'occupied',
 styleId:'low',styleSeed:42,
});
test('既存施設と同じ敷地だけを衝突とする',()=>{
 const facility={id:'market',kind:'market',x:256,y:109,builtYear:200,condition:'intact'};
 assert.deepEqual(findHousingGroundConflicts([block('a',250,108)],[],0),[]);
 const conflicts=findHousingGroundConflicts([block('a',250,108)],[facility],0);
 assert.equal(conflicts.length,1);
 assert.equal(conflicts[0].reason,'facility');
 assert.equal(conflicts[0].existingId,'market');
});
test('川と住戸街区同士の物理敷地は重複禁止',()=>{
 const conflicts=findHousingGroundConflicts([
  block('a',145,111),block('b',145,111),
 ],[],0);
 assert.ok(conflicts.some(x=>x.reason==='river'));
 assert.ok(conflicts.some(x=>x.reason==='block'));
});
test('描画上の屋根の重なりは地表占有と混同しない',()=>{
 assert.deepEqual(findHousingGroundConflicts([
  block('a',11,163,20,8),block('b',35,163,20,8)
 ],[],0),[]);
});
