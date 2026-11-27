import test from 'node:test';
import assert from 'node:assert/strict';
import {BIOME_KINDS,generateClimateBaseline} from '../dist/climate/initial-climate-v1.js';
import {distribution,dispersion,firstYearAtLeast,declines,boundedSeries,siteResidency,centerMoves,recordClass,chronicleMeasures,memoryMeasures,decisionMeasures,allocateSeeds} from '../scripts/lib/history40-measures.mjs';

const yearly=values=>values.map((value,year)=>({year,value}));

test('distribution: nearest-rank quantiles; empty input is all null, not 0', () => {
 const d=distribution([5,1,4,2,3]);
 assert.deepEqual([d.n,d.min,d.median,d.max,d.mean],[5,1,3,5,3]);
 assert.equal(distribution([]).median,null);
 assert.equal(distribution([NaN,undefined,2]).n,1);
});

test('declines: a recovered fall counts the years from its peak; one still open at the horizon is censored', () => {
 const r=declines(yearly([100,80,70,90,100,110,60,70]),.25);
 assert.equal(r.count,2);assert.equal(r.recovered,1);assert.equal(r.censored,1);
 assert.deepEqual(r.recoveryYears,[4]);// peak at 0, below 75 at year 2, back to 100 at year 4
 assert.equal(r.episodes[1].peakYear,5);assert.equal(r.episodes[1].recoveredYear,null);
 assert.equal(r.deepest.fraction,round(50/110));
 // a fall shallower than the depth is not a decline, but is still the deepest fall
 const s=declines(yearly([100,90,100]),.25);assert.equal(s.count,0);assert.equal(s.deepest.fraction,.1);
});
const round=v=>Math.round(v*1000)/1000;

test('firstYearAtLeast: the first observed year at the threshold, or null (censored)', () => {
 assert.equal(firstYearAtLeast([{year:0,value:10},{year:25,value:96},{year:50,value:99}],95),25);
 assert.equal(firstYearAtLeast(yearly([1,2,3]),95),null);
});

test('boundedSeries: shares near the bounds and quarter means', () => {
 const r=boundedSeries([0,5,50,95,100,100,40,60],{high:95,low:5});
 assert.equal(r.nearHighShare,.375);assert.equal(r.nearLowShare,.25);
 assert.deepEqual(r.quarterMeans,[2.5,72.5,100,50]);
});

test('siteResidency: held states up to the horizon; uninhabited years belong to no scale; repeated states merge', () => {
 const v=(scale,inhabited=true)=>({scale,inhabited,trend:'stable',communityId:'c'});
 const changes=[{year:0,view:v(0)},{year:10,view:v(0)},{year:20,view:v(1)},{year:50,view:v(1,false)},{year:70,view:v(0)},{year:200,view:v(2)}];
 const r=siteResidency(changes,99);
 assert.deepEqual(r.yearsByScale,[20+30,30,0,0]);
 assert.equal(r.uninhabitedYears,20);assert.equal(r.abandoned,1);assert.equal(r.resettled,1);
 assert.equal(r.scaleUps,1);assert.equal(r.maxScale,1);assert.equal(r.endScale,0);
 assert.deepEqual(r.longestStayByScale,[30,30,0,0]);
 assert.equal(r.yearsByScale.reduce((a,b)=>a+b,0)+r.uninhabitedYears,100);
});

test('centerMoves: ties keep the earlier leader; the last tenure runs to the last year', () => {
 const rows=[[5,5,1],[5,5,1],[4,6,1],[4,6,9]].map((people,year)=>({year,people}));
 assert.deepEqual(centerMoves(rows),{changes:2,distinctLeaders:3,longestTenureYears:2,endLeader:2});
});

test('recordClass: kinds as stored; untyped economy, society and memory records by their fixed titles; others flagged', () => {
 assert.equal(recordClass({kind:'flood',tag:'自然',title:'x'}),'flood');
 assert.equal(recordClass({kind:'legacy-formed-granary',tag:'継承',title:'x'}),'legacy-formed');
 assert.equal(recordClass({tag:'地域',title:'川辺の食糧不足が続く'}),'economy-shortage');
 assert.equal(recordClass({tag:'地域',title:'川辺と丘陵を結ぶ往来が途絶える'}),'economy-route-closed');
 assert.equal(recordClass({tag:'地域',title:'丘陵が別の寄り合いを持つ'}),'society-split');
 assert.equal(recordClass({tag:'地域',title:'川辺が町と呼ばれるようになる'}),'settlement-scale');
 assert.equal(recordClass({tag:'継承',title:'記録の習慣が失われる'}),'legacy-lost');
 assert.equal(recordClass({tag:'選択',title:'何か'}),'choice');
 assert.equal(recordClass({tag:'地域',title:'見知らぬ記録'}),'unclassified:地域');
});

test('chronicleMeasures: windows, empty windows, civilization records and groups; a record after the horizon is an error', () => {
 const h=[{id:'0-0',year:0,tag:'誕生',title:'誕生',important:true},{id:'5-1',year:5,tag:'自然',kind:'flood',title:'f'},
  {id:'6-2',year:6,tag:'自然',kind:'flood',title:'f'},{id:'250-3',year:250,tag:'地域',kind:'building-damaged',buildingId:'b',title:'d'},
  {id:'251-4',year:251,tag:'地域',title:'川辺の食糧不足が続く'}];
 const r=chronicleMeasures(h,299,100);
 assert.equal(r.windows,3);assert.equal(r.emptyWindows,1);assert.equal(r.windowsWithoutCivilizationRecord,2);
 assert.equal(r.consecutiveSameClass,1);assert.equal(r.groups.damage,1);assert.equal(r.groups.shortage,1);assert.equal(r.unclassified,0);
 assert.throws(()=>chronicleMeasures(h,200,100),/after the horizon/);
 // years 0..250: two full windows; the record of year 250 is in the totals but not in a window
 const p=chronicleMeasures(h.slice(0,4),250,100);
 assert.equal(p.windows,2);assert.equal(p.partialWindowYears,51);assert.equal(p.total,4);assert.equal(p.perWindow.all.max,3);
});

test('memoryMeasures: re-formation after a loss; an institution still active is censored', () => {
 const log=[{year:10,kind:'granary',action:'formed',established:10},{year:40,kind:'granary',action:'lost',established:10},
  {year:60,kind:'granary',action:'formed',established:60},{year:20,kind:'care',action:'formed',established:20}];
 const r=memoryMeasures(log,{granary:{established:60},care:{established:20}},100);
 assert.equal(r.byKind.granary.reformed,1);assert.equal(r.lifespanLost.median,30);
 assert.deepEqual([r.lifespanCensored.min,r.lifespanCensored.max],[40,80]);
});

test('decisionMeasures: gaps, and the open gap to the horizon', () => {
 const r=decisionMeasures([{year:100},{year:250}],1000);
 assert.deepEqual([r.count,r.gaps.min,r.gaps.max,r.censoredGapToHorizon],[2,100,150,750]);
});

test('allocateSeeds: stable seeds alternate tuning/acceptance in ascending order per biome; the two sets never overlap', () => {
 const a=allocateSeeds({tuning:3,acceptance:3});
 const all=BIOME_KINDS.flatMap(b=>[...a.biomes[b].tuning,...a.biomes[b].acceptance]);
 assert.equal(new Set(all).size,all.length);
 for(const b of BIOME_KINDS){
  const {tuning,acceptance}=a.biomes[b];
  for(const s of [...tuning,...acceptance]){const c=generateClimateBaseline(s);assert.equal(c.dominantBiome,b);assert.equal(c.transition,null);}
  // ranks 0,2,4 are tuning and 1,3,5 acceptance among the biome's stable seeds
  const stable=[];for(let s=1;stable.length<6;s++){const c=generateClimateBaseline(s);if(c.dominantBiome===b&&!c.transition)stable.push(s);}
  assert.deepEqual(tuning,[stable[0],stable[2],stable[4]]);assert.deepEqual(acceptance,[stable[1],stable[3],stable[5]]);
 }
 assert.deepEqual(allocateSeeds({tuning:3,acceptance:3}),a);
});

test('dispersion: variance / mean of counts; constant counts give 0; null without a mean', () => {
 assert.equal(dispersion([2,2,2]),0);assert.equal(dispersion([0,4]),2);assert.equal(dispersion([0,0]),null);assert.equal(dispersion([3]),null);
});

test('chronicleMeasures: gaps between civilization events and the years that have one', () => {
 const h=[5,6,20,20].map((year,i)=>({id:year+'-'+i,year,tag:'自然',kind:'flood',title:'f'}));
 const r=chronicleMeasures(h,99,50);
 assert.deepEqual([r.civilizationGaps.min,r.civilizationGaps.max,r.civilizationYearsWithEvent],[0,14,3]);
 assert.equal(r.civilizationWindowDispersion,2);// counts [4,0]: mean 2, variance 4
});

test('economyMeasures: shortage years and runs from the economy counter, trade runs, moves; nothing inferred', async () => {
 const {economyMeasures}=await import('../scripts/lib/history40-measures.mjs');
 const cap=(year,short,traded,moves=[])=>({year,traded,moves,routes:traded.map(()=>({blocked:false})),
  economy:{harvest:[10,5],imports:[0,1],discarded:[1,0],districts:short.map((s,i)=>({coverage:s?0.8:1,shortageYears:s,reserve:i,importShare:0}))}});
 const c=[cap(1,[0,1],[0]),cap(2,[1,2],[3]),cap(3,[2,3],[2],[{from:0,to:1,amount:5},{from:2,to:0,amount:7}]),cap(4,[0,0],[0]),cap(5,[1,0],[1])];
 const r=economyMeasures(c);
 assert.deepEqual([r.years,r.firstYear,r.lastYear],[5,1,5]);
 assert.deepEqual([r.districts[0].shortageYears,r.districts[0].longestShortageRun,r.districts[0].runsOfThreeOrMore],[3,2,0]);
 assert.deepEqual([r.districts[1].shortageYears,r.districts[1].longestShortageRun,r.districts[1].runsOfThreeOrMore],[3,3,1]);
 assert.deepEqual([r.routes[0].yearsWithTrade,r.routes[0].tradedTotal,r.routes[0].longestTradeRun,r.routes[0].tradeRuns],[3,6,2,2]);
 assert.deepEqual(r.moves,{betweenDistricts:1,settledFromOutside:1,peopleMoved:5});
 assert.equal(r.districts[1].importsTotal,5);
});

test('eventTiming: runs of consecutive years, the densest 10 years, gaps and quiet 100-year windows', async () => {
 const {eventTiming}=await import('../scripts/lib/history40-measures.mjs');
 const r=eventTiming([3,4,5,6,7,8,40,41,90,150],199);
 assert.equal(r.longestRun,6);assert.equal(r.yearsInRunsOfFive,6);assert.equal(r.maxInTenYears,6);
 assert.equal(r.longestGap,60);assert.equal(r.gapsOf20,3);assert.equal(r.gapsOf30,3);
 assert.deepEqual([r.windows,r.quietWindows,r.yearsWithEvent],[2,1,10]);// 0-99 has 9 events, 100-199 has 1
 assert.equal(eventTiming([],99).longestGap,0);
});

test('hardshipRuns: confirmed years with food or cohesion below 40', async () => {
 const {hardshipRuns}=await import('../scripts/lib/history40-measures.mjs');
 const r=hardshipRuns([50,30,30,50,50],[50,50,50,39,60]);
 assert.deepEqual(r,{share:.6,longestRun:3,runsOf50:0});
});
