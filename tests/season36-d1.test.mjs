/** Issue #36 D1 — projection and rapid-mode scheduling are display-only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {appearance,phaseAt,visualHash,coalesceRapidFrames,PHASES} from '../scripts/lib/season36-d1.mjs';

const climate=(override={})=>({
  effectiveTemperature:2,effectiveMoisture:17,annualTemperatureRangeIndex:75,rainfallConcentrationIndex:36,...override
});
test('D1: 4-year representative cycle is stable and rejects invalid years',()=>{
 assert.equal(PHASES.length,4);
 assert.deepEqual([0,1,2,3,4,99,100,10000].map(phaseAt),[0,1,2,3,0,3,0,0]);
 for(const year of [-1,1.1,10001,NaN])assert.throws(()=>phaseAt(year));
});
test('D1: cold moist winter has snow, warm tropical forest does not gain artificial snow',()=>{
 const cold=appearance(climate({effectiveTemperature:-70,effectiveMoisture:30,annualTemperatureRangeIndex:90}),{temperature:0,humidity:0},3);
 const warm=appearance(climate({effectiveTemperature:65,effectiveMoisture:65,annualTemperatureRangeIndex:12}),{temperature:0,humidity:0},3);
 assert.ok(cold.snow>.5);
 assert.equal(warm.snow,0);
 assert.ok(cold.snow>appearance(climate({effectiveTemperature:-70,effectiveMoisture:-140,annualTemperatureRangeIndex:90}),{temperature:0,humidity:0},3).snow);
 assert.equal(Object.isFrozen(cold),true);
});
test('D1: stable visual hash and projection do not consume an RNG',()=>{
 const values=Array.from({length:60},(_,i)=>visualHash(27,i%9,Math.floor(i/9),2));
 assert.deepEqual(values,Array.from({length:60},(_,i)=>visualHash(27,i%9,Math.floor(i/9),2)));
 assert.ok(new Set(values).size>40);
 const input=climate(),dev={temperature:-12,humidity:5},before=JSON.stringify({input,dev});
 const a=appearance(input,dev,2),b=appearance(input,dev,2);
 assert.deepEqual(a,b);assert.equal(JSON.stringify({input,dev}),before);
 assert.equal(a.phase,2);assert.ok(a.autumn>0);
 for(const invalid of [-1,4,5.5])assert.throws(()=>appearance(input,dev,invalid));
});
test('D1: rapid coalescing bounds visual updates and flushes last confirmed year',()=>{
 const events=Array.from({length:82},(_,i)=>({timeMs:i*75,year:180+i}));
 const sampled=coalesceRapidFrames(events,700);
 assert.ok(sampled.length<12);
 assert.equal(sampled.at(-1).year,261);
 assert.equal(sampled.at(-1).phase,1);
 assert.equal(sampled.at(-1).reason,'stop');
 assert.equal(events[0].year,180);
 for(const [i,frame]of sampled.entries())if(i>0&&frame.reason==='sample'){
  assert.ok(frame.timeMs-sampled[i-1].timeMs>=700);
 }
 assert.deepEqual(coalesceRapidFrames([],700),[]);
 assert.throws(()=>coalesceRapidFrames([{timeMs:10,year:3},{timeMs:2,year:4}],700));
});
