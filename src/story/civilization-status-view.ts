/**
 * Issue #29 S2/S3: what the status bar and the history graph show, as pure functions of the confirmed record.
 *
 * Every value comes from observeCivilizationMetrics() (S1): only confirmed years, never the live draft of a pending
 * year, never interpolated. Nothing here reads or changes the simulation's RNG or history. Display rounding is
 * applied to the text only; changes are computed from the unrounded values.
 */
import {lastObservedYear,type CivilizationState,type RecordEntry} from './engine.js';
import {observeCivilizationMetrics,confirmedMetricRange,civilizationMetricKeys,type CivilizationMetricKey,type CivilizationMetricObservation} from './civilization-metrics.js';

export const CHANGE_SPAN_YEARS=20;
export const metricLabels:Readonly<Record<CivilizationMetricKey,string>>={population:'人口',food:'食料',cohesion:'結束',knowledge:'知識',culture:'文化'};
const numberFormat=new Intl.NumberFormat('ja-JP');
const decimalFormat=new Intl.NumberFormat('ja-JP',{minimumFractionDigits:1,maximumFractionDigits:1});

/** Value text: people as whole persons, the four 0–100 metrics to one decimal place. */
export function formatMetricValue(key:CivilizationMetricKey,value:number):string {
 return key==='population'?`約 ${numberFormat.format(Math.round(value))} 人`:`${decimalFormat.format(value)} / 100`;
}
/** Change text with an explicit sign and direction mark; a change that rounds to zero is shown as ±0 without a mark. */
export function formatMetricChange(key:CivilizationMetricKey,delta:number):{text:string;direction:'up'|'down'|'flat'} {
 // Rounded by magnitude so that +x and −x read the same (Math.round alone rounds −0.5 toward zero).
 const unit=key==='population'?1:10,rounded=Math.sign(delta)*Math.round(Math.abs(delta)*unit)/unit;
 if(rounded===0)return {text:key==='population'?'±0人':'±0.0',direction:'flat'};
 const magnitude=key==='population'?`${numberFormat.format(Math.abs(rounded))}人`:decimalFormat.format(Math.abs(rounded));
 return rounded>0?{text:`↑ +${magnitude}`,direction:'up'}:{text:`↓ −${magnitude}`,direction:'down'};
}

export type MetricChange=
 |{readonly kind:'change';readonly fromYear:number;readonly delta:number;readonly text:string;readonly direction:'up'|'down'|'flat'}
 |{readonly kind:'no-baseline';readonly text:string}
 |{readonly kind:'unrecorded';readonly text:string};
export interface StatusRow {readonly key:CivilizationMetricKey;readonly label:string;readonly value:number|null;readonly valueText:string;readonly change:MetricChange}
export interface StatusView {readonly year:number;readonly recorded:boolean;readonly rows:readonly StatusRow[]}

/**
 * The five civilization-wide values of a confirmed year and their change since `span` years earlier.
 * Before year `span` there is nothing to compare with (not a gap in the record). A year the ledger never recorded
 * (a world from before Issue #29) shows as unrecorded; `fallbackPopulation` is the population already shown for it.
 */
export function civilizationStatusView(state:Readonly<CivilizationState>,year:number,fallbackPopulation?:number,span=CHANGE_SPAN_YEARS):StatusView {
 const now=observeCivilizationMetrics(state,year);
 const before=now&&year>=span?observeCivilizationMetrics(state,year-span):null;
 const rows=civilizationMetricKeys.map((key):StatusRow=>{
  const value=now?now[key]:key==='population'&&fallbackPopulation!==undefined?fallbackPopulation:null;
  const valueText=value===null?'記録なし':formatMetricValue(key,value);
  let change:MetricChange;
  if(!now)change={kind:'unrecorded',text:'記録なし'};
  else if(year<span)change={kind:'no-baseline',text:`比較対象なし（${span}年未満）`};
  else if(!before)change={kind:'unrecorded',text:`${span}年前の記録なし`};
  else change={kind:'change',fromYear:year-span,delta:now[key]-before[key],...formatMetricChange(key,now[key]-before[key])};
  return {key,label:metricLabels[key],value,valueText,change};
 });
 return {year,recorded:Boolean(now),rows};
}

export interface SeriesPoint {readonly year:number;readonly value:number}
/**
 * The confirmed values of one metric for the years from..to (inclusive, clamped to the confirmed range). Years the
 * ledger never recorded are left out, so a gap is never drawn as a line.
 */
export function metricSeries(state:Readonly<CivilizationState>,key:CivilizationMetricKey,from:number,to:number):SeriesPoint[] {
 return confirmedMetricRange(state,key,from,to);
}
/** Splits a series into runs of consecutive years (a missing year starts a new run). */
export function seriesRuns(points:readonly SeriesPoint[]):SeriesPoint[][] {
 const runs:SeriesPoint[][]=[];
 for(const p of points){const run=runs.at(-1);if(run&&run.at(-1)!.year===p.year-1)run.push(p);else runs.push([p]);}
 return runs;
}
/**
 * Fewer points for drawing a long series in `buckets` columns: within each column the first, last, lowest and highest
 * confirmed points are kept, with their own years and values, so a short famine is not averaged away. The stored record
 * is not changed; a selected year is always read again from the record, never from these points.
 */
export function reduceSeries(points:readonly SeriesPoint[],buckets:number):SeriesPoint[] {
 if(!Number.isSafeInteger(buckets)||buckets<1)throw Error('Invalid bucket count');
 if(points.length<=buckets*4)return [...points];
 const first=points[0]!.year,span=points.at(-1)!.year-first+1,out:SeriesPoint[]=[];
 const bucketOf=(p:SeriesPoint)=>Math.min(buckets-1,Math.floor((p.year-first)*buckets/span));
 for(let i=0;i<points.length;){
  const b=bucketOf(points[i]!);let j=i,lo=i,hi=i;
  while(j+1<points.length&&bucketOf(points[j+1]!)===b){j++;if(points[j]!.value<points[lo]!.value)lo=j;if(points[j]!.value>points[hi]!.value)hi=j;}
  for(const k of [...new Set([i,lo,hi,j])].sort((x,y)=>x-y))out.push(points[k]!);
  i=j+1;
 }
 return out;
}

export interface MetricScale {readonly min:number;readonly max:number;readonly ticks:readonly number[];readonly unit:string}
/** The four metrics share the fixed 0–100 scale; population starts at 0 and ends at a rounded top above the visible data. */
export function metricScale(key:CivilizationMetricKey,points:readonly SeriesPoint[]):MetricScale {
 if(key!=='population')return {min:0,max:100,ticks:[0,50,100],unit:'0〜100の指標'};
 const top=Math.max(1,...points.map(p=>p.value)),magnitude=10**Math.floor(Math.log10(top)),step=[1,2,2.5,5,10].map(m=>m*magnitude).find(s=>Math.ceil(top/s)<=5)!;
 const max=Math.ceil(top/step)*step;return {min:0,max,ticks:[0,max/2,max],unit:'人数'};
}

export interface RecordMarker {readonly year:number;readonly count:number;readonly records:readonly RecordEntry[]}
/**
 * Years with chronicle records marked important, among confirmed years from..to. Only records already in the history
 * are used (no new event is derived); several records in one year are one marker with their count.
 */
export function recordMarkers(state:Readonly<CivilizationState>,from:number,to:number):RecordMarker[] {
 const last=lastObservedYear(state as CivilizationState),byYear=new Map<number,RecordEntry[]>();
 for(const r of state.history){if(!r.important||r.year<from||r.year>to||r.year>last)continue;const list=byYear.get(r.year);if(list)list.push(r);else byYear.set(r.year,[r]);}
 return [...byYear].sort((a,b)=>a[0]-b[0]).map(([year,records])=>({year,count:records.length,records}));
}

export type GraphRange=50|200|'all';
/** The years a graph shows: `range` years ending at `end` (clamped to 0..confirmed), or every confirmed year. */
export function graphWindow(confirmedYear:number,range:GraphRange,end:number):{from:number;to:number} {
 if(range==='all')return {from:0,to:confirmedYear};
 const to=Math.max(0,Math.min(confirmedYear,Math.round(end)));
 return {from:Math.max(0,to-range),to};
}
/** The confirmed integer year nearest a fraction (0..1) across a window; never outside it. */
export function yearAtFraction(window:{from:number;to:number},fraction:number):number {
 const f=Math.min(1,Math.max(0,Number.isFinite(fraction)?fraction:0));
 return Math.round(window.from+f*(window.to-window.from));
}
export type {CivilizationMetricKey,CivilizationMetricObservation};
