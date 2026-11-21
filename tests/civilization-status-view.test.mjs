/** Issue #29 S2/S3: the pure view of the status bar and history graph (src/story/civilization-status-view.ts). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCivilization,step,chooseAutomatically,clone,lastObservedYear} from '../dist/story/engine.js';
/** Confirmed years through `years`, resolving choices automatically (advance() stops at a pending choice). */
const advance=(s,years)=>{while(lastObservedYear(s)<years){if(s.pending)chooseAutomatically(s);else step(s);}return s;};
import {observeCivilizationMetrics} from '../dist/story/civilization-metrics.js';
import {civilizationStatusView,formatMetricValue,formatMetricChange,metricSeries,seriesRuns,reduceSeries,metricScale,recordMarkers,graphWindow,yearAtFraction,CHANGE_SPAN_YEARS} from '../dist/story/civilization-status-view.js';

test('S2: the five values and their change come only from confirmed years', ()=>{
 const s=advance(createCivilization(42),120),y=lastObservedYear(s),before=JSON.stringify(s);
 const view=civilizationStatusView(s,y),now=observeCivilizationMetrics(s,y),then=observeCivilizationMetrics(s,y-CHANGE_SPAN_YEARS);
 assert.equal(view.recorded,true);assert.deepEqual(view.rows.map(r=>r.key),['population','food','cohesion','knowledge','culture']);
 for(const row of view.rows){
  assert.equal(row.value,now[row.key]);assert.equal(row.valueText,formatMetricValue(row.key,now[row.key]));
  assert.equal(row.change.kind,'change');assert.equal(row.change.fromYear,y-20);assert.equal(row.change.delta,now[row.key]-then[row.key],'computed from unrounded values');
 }
 assert.equal(JSON.stringify(s),before,'reading the view changes nothing');
 // Before year 20 there is nothing to compare with — not a gap in the record.
 const early=civilizationStatusView(s,19);
 assert.ok(early.rows.every(r=>r.change.kind==='no-baseline'&&r.change.text.includes('比較対象なし')));
 assert.equal(civilizationStatusView(s,20).rows[0].change.kind,'change');
});

test('S2: a pending year shows the last confirmed year; a pre-#29 world is unrecorded, not estimated',()=>{
 const s=createCivilization(7);for(let i=0;i<3000&&!s.pending;i++)step(s);assert.ok(s.pending);
 const confirmed=lastObservedYear(s),view=civilizationStatusView(s,confirmed);
 assert.deepEqual(view.rows.slice(1).map(r=>r.value),s.observation.metrics.values.at(-1));
 assert.equal(civilizationStatusView(s,s.year).recorded,false,'the pending year itself is not readable');
 const old=clone(s);delete old.observation.metrics;
 const unrecorded=civilizationStatusView(old,confirmed,1234);
 assert.equal(unrecorded.recorded,false);
 assert.deepEqual(unrecorded.rows.map(r=>r.valueText),['約 1,234 人','記録なし','記録なし','記録なし','記録なし']);
 assert.ok(unrecorded.rows.every(r=>r.change.kind==='unrecorded'));
});

test('S2: value and change texts carry the sign and direction in words, and zero has no direction',()=>{
 assert.equal(formatMetricValue('population',12345.4),'約 12,345 人');assert.equal(formatMetricValue('food',63.449),'63.4 / 100');
 assert.deepEqual(formatMetricChange('food',2.06),{text:'↑ +2.1',direction:'up'});
 assert.deepEqual(formatMetricChange('food',-0.04),{text:'±0.0',direction:'flat'});
 assert.deepEqual(formatMetricChange('culture',-12.25),{text:'↓ −12.3',direction:'down'});assert.deepEqual(formatMetricChange('culture',12.25),{text:'↑ +12.3',direction:'up'});
 assert.deepEqual(formatMetricChange('food',-0.05),{text:'↓ −0.1',direction:'down'});
 assert.deepEqual(formatMetricChange('population',-1520),{text:'↓ −1,520人',direction:'down'});
 assert.deepEqual(formatMetricChange('population',0.4),{text:'±0人',direction:'flat'});
});

test('S3: a series is the confirmed record, a missing year breaks the line, and the window never passes the confirmed year',()=>{
 const s=advance(createCivilization(3),300),last=lastObservedYear(s);
 const series=metricSeries(s,'knowledge',250,last+50);
 assert.equal(series.at(-1).year,last);assert.equal(series[0].year,250);
 for(const p of series)assert.equal(p.value,observeCivilizationMetrics(s,p.year).knowledge);
 // The one-pass population range equals the per-year read contract across checkpoint blocks.
 const people=metricSeries(s,'population',0,last);assert.equal(people.length,last+1);
 for(const p of people)assert.equal(p.value,observeCivilizationMetrics(s,p.year).population,'year '+p.year);
 assert.deepEqual(seriesRuns([{year:1,value:1},{year:2,value:1},{year:4,value:1}]).map(r=>r.map(p=>p.year)),[[1,2],[4]]);
 const old=clone(s);delete old.observation.metrics;assert.deepEqual(metricSeries(old,'food',0,last),[]);
 assert.deepEqual(graphWindow(last,200,last),{from:last-200,to:last});
 assert.deepEqual(graphWindow(last,50,last+999),{from:last-50,to:last},'never beyond the confirmed year');
 assert.deepEqual(graphWindow(30,200,30),{from:0,to:30},'no invented years before year 0');
 assert.deepEqual(graphWindow(last,'all',10),{from:0,to:last});
 assert.equal(yearAtFraction({from:100,to:300},.5),200);assert.equal(yearAtFraction({from:100,to:300},-3),100);assert.equal(yearAtFraction({from:100,to:300},7),300);assert.equal(yearAtFraction({from:0,to:9},NaN),0);
});

test('S3: the long-series reduction keeps first, last and every bucket extreme with its own year and value',()=>{
 const points=Array.from({length:10001},(_,year)=>({year,value:50+Math.sin(year/40)*5}));
 points[6203]={year:6203,value:2};points[777]={year:777,value:99};// one-year dip and peak
 const reduced=reduceSeries(points,580);
 assert.ok(reduced.length<=580*4&&reduced.length<points.length);
 assert.deepEqual(reduced[0],points[0]);assert.deepEqual(reduced.at(-1),points.at(-1));
 assert.ok(reduced.some(p=>p.year===6203&&p.value===2),'the short dip is kept');
 assert.ok(reduced.some(p=>p.year===777&&p.value===99),'the short peak is kept');
 for(let i=1;i<reduced.length;i++)assert.ok(reduced[i].year>reduced[i-1].year,'ordered, no duplicates');
 for(const p of reduced)assert.deepEqual(p,points[p.year],'only real confirmed points');
 const short=points.slice(0,100);assert.deepEqual(reduceSeries(short,580),short);
 assert.throws(()=>reduceSeries(points,0));
});

test('S3: scales and record markers',()=>{
 assert.deepEqual(metricScale('food',[]),{min:0,max:100,ticks:[0,50,100],unit:'0〜100の指標'});
 const pop=metricScale('population',[{year:0,value:3120},{year:1,value:41870}]);
 assert.equal(pop.min,0);assert.ok(pop.max>=41870&&pop.max<=50000);assert.equal(pop.unit,'人数');
 const s=advance(createCivilization(42),400),last=lastObservedYear(s),markers=recordMarkers(s,0,last);
 const important=s.history.filter(r=>r.important&&r.year<=last);
 assert.equal(markers.reduce((n,m)=>n+m.count,0),important.length,'every important record, none invented');
 for(const m of markers){assert.ok(m.records.every(r=>r.year===m.year&&r.important));assert.equal(m.count,m.records.length);}
 assert.ok(recordMarkers(s,100,200).every(m=>m.year>=100&&m.year<=200));
});
