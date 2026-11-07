import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettlementHistory,updateSettlements} from '../dist/story/settlement-history.js';
import {createSociety} from '../dist/story/society.js';

// Synthetic cadence counterexample only; never used for natural scenery.
function clock(until,coverage,permit){
 const history=createSettlementHistory([18000,0,0],0),society=createSociety(),records=[],attempts=[],lastWork=[];
 for(let year=1;year<=until;year++){
  updateSettlements(history,society,[0,1,2].map(i=>({population:i===0?18000:0,coverage:coverage(year),tradeYears:8,shortageYears:0})),year,event=>{
   const id=String(records.length+1);records.push({id,year,...event});return id;
  },(i,candidate)=>{
   if(i!==0)return false;
   attempts.push({year,id:candidate.id,lastWork:history[0].lastWork});return permit(year);
  });lastWork[year]=history[0].lastWork;
 }
 return {history,records,attempts,lastWork};
}
test('D5 synthetic clock: HOLD at 8 retries at 9; success waits until 17 for the next slot',()=>{
 const result=clock(17,()=>1,year=>year!==8);
 assert.deepEqual(result.attempts,[{year:8,id:'river-bank-1',lastWork:0},{year:9,id:'river-bank-1',lastWork:0},{year:17,id:'river-bank-2',lastWork:9}]);
 assert.equal(result.lastWork[8],0);assert.equal(result.lastWork[9],9);assert.equal(result.lastWork[16],9);assert.equal(result.lastWork[17],17);
 assert.deepEqual(result.records.filter(r=>r.kind==='building-built').map(r=>r.year),[9,17]);
});
test('D5 synthetic clock: social readiness loss and recovery preserve the held head and work year',()=>{
 const result=clock(10,year=>year===9?.9:1,year=>year!==8);
 assert.deepEqual(result.attempts,[{year:8,id:'river-bank-1',lastWork:0},{year:10,id:'river-bank-1',lastWork:0}]);
 assert.equal(result.lastWork[9],0);assert.equal(result.lastWork[10],10);
 assert.deepEqual(result.records.filter(r=>r.kind==='building-built').map(r=>r.year),[10]);
});
