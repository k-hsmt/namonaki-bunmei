/**
 * Issue #40 D1a: measurement functions for the baseline trials (D0 §11.2). Pure: they read confirmed values that the
 * caller has already taken from the existing readers, and never touch a civilization, an RNG or a save.
 *
 * Conventions (D0 §11.2):
 *  - a value that was not observed is missing (null / absent), never interpolated or inferred;
 *  - a decline, an institution or a stay that is still running at the horizon is censored, not closed;
 *  - an uninhabited site is not counted as a settlement of any scale;
 *  - no composite diversity score is made here.
 * The analysis parameters below (decline depth, window width, cap margins) are measurement choices, not game rules.
 */
import {BIOME_KINDS,generateClimateBaseline} from '../../dist/climate/initial-climate-v1.js';

export const MEASURE_ID='history40-measures-v1';
export const ANALYSIS={declineDepth:.25,windowYears:100,capHigh:95,capLow:5};

const round=(v,d=3)=>v===null||v===undefined||!Number.isFinite(v)?null:Math.round(v*10**d)/10**d;

/** Order statistics of finite numbers (nearest-rank quantiles). Empty input gives n 0 and nulls. */
export function distribution(values){
 const a=values.filter(Number.isFinite).sort((x,y)=>x-y),n=a.length;
 if(!n)return {n:0,min:null,p10:null,p25:null,median:null,p75:null,p90:null,max:null,mean:null,sd:null};
 const q=p=>a[Math.min(n-1,Math.max(0,Math.ceil(p*n)-1))];
 const mean=a.reduce((s,v)=>s+v,0)/n,sd=Math.sqrt(a.reduce((s,v)=>s+(v-mean)**2,0)/n);
 return {n,min:round(a[0]),p10:round(q(.1)),p25:round(q(.25)),median:round(q(.5)),p75:round(q(.75)),p90:round(q(.9)),max:round(a[n-1]),mean:round(mean),sd:round(sd)};
}

/**
 * Declines of a yearly series below (1 - depth) × its running peak. A decline starts at the peak it fell from and ends
 * when the series is back at that peak (recovered, with the years from the peak) or at the horizon (censored).
 * Also the deepest fall from any earlier peak. `series` is [{year,value}] in year order with no gaps.
 */
export function declines(series,depth=ANALYSIS.declineDepth){
 let peak=-Infinity,peakYear=null,open=null,deepest={fraction:0,peakYear:null,troughYear:null};
 const done=[];
 for(const {year,value} of series){
  if(value>=peak){
   if(open){done.push({...open,recoveredYear:year,recoveryYears:year-open.peakYear,censored:false});open=null;}
   peak=value;peakYear=year;continue;
  }
  const fraction=peak>0?(peak-value)/peak:0;
  if(fraction>deepest.fraction)deepest={fraction,peakYear,troughYear:year};
  if(!open&&fraction>=depth)open={peakYear,peak,startYear:year,troughYear:year,trough:value};
  if(open&&value<open.trough){open.trough=value;open.troughYear=year;}
 }
 if(open)done.push({...open,recoveredYear:null,recoveryYears:null,censored:true});
 return {depth,deepest:{fraction:round(deepest.fraction),peakYear:deepest.peakYear,troughYear:deepest.troughYear},
  count:done.length,recovered:done.filter(d=>!d.censored).length,censored:done.filter(d=>d.censored).length,
  recoveryYears:done.filter(d=>!d.censored).map(d=>d.recoveryYears),episodes:done.map(d=>({...d,trough:round(d.trough),peak:round(d.peak)}))};
}

/** Share of the observed values at or above `high` and at or below `low`, and the mean of each quarter of the series. */
export function boundedSeries(values,{high=ANALYSIS.capHigh,low=ANALYSIS.capLow}={}){
 const a=values.filter(Number.isFinite),n=a.length;
 const quarter=i=>{const s=a.slice(Math.floor(n*i/4),Math.floor(n*(i+1)/4));return s.length?round(s.reduce((x,v)=>x+v,0)/s.length):null;};
 return {...distribution(a),nearHighShare:n?round(a.filter(v=>v>=high).length/n):null,nearLowShare:n?round(a.filter(v=>v<=low).length/n):null,quarterMeans:[0,1,2,3].map(quarter)};
}

/** The first observed year at or above `threshold` in [{year,value}], or null when never reached by the horizon (censored). */
export function firstYearAtLeast(series,threshold){return series.find(p=>p.value>=threshold)?.year??null;}

/**
 * One site's recorded states from its ledger changes ([{year,view:{scale,inhabited}}], the first at year 0), held until
 * the next change, up to and including `horizon`. Years by scale count inhabited years only.
 */
export function siteResidency(changes,horizon){
 const byScale=[0,0,0,0],longest=[0,0,0,0];let uninhabited=0,resettled=0,abandoned=0,up=0,down=0,maxScale=0;
 const spans=[];
 for(let i=0;i<changes.length;i++){
  const c=changes[i],end=i+1<changes.length?changes[i+1].year:horizon+1;
  if(c.year>horizon)break;
  spans.push({from:c.year,to:Math.min(end,horizon+1)-1,scale:c.view.scale,inhabited:c.view.inhabited});
  if(i>0){const p=changes[i-1].view;
   if(c.view.inhabited&&!p.inhabited)resettled++;if(!c.view.inhabited&&p.inhabited)abandoned++;
   if(c.view.inhabited&&p.inhabited){if(c.view.scale>p.scale)up++;if(c.view.scale<p.scale)down++;}}
 }
 // merge consecutive spans of the same state (the ledger also stores changes of trend and community)
 const merged=[];for(const s of spans){const l=merged.at(-1);if(l&&l.scale===s.scale&&l.inhabited===s.inhabited&&l.to+1===s.from)l.to=s.to;else merged.push({...s});}
 for(const s of merged){const years=s.to-s.from+1;
  if(!s.inhabited){uninhabited+=years;continue;}
  byScale[s.scale]+=years;longest[s.scale]=Math.max(longest[s.scale],years);maxScale=Math.max(maxScale,s.scale);}
 const last=merged.at(-1);
 return {yearsByScale:byScale,longestStayByScale:longest,uninhabitedYears:uninhabited,abandoned,resettled,scaleUps:up,scaleDowns:down,maxScale,
  endScale:last?.inhabited?last.scale:null,endInhabited:last?.inhabited??null,stateChanges:merged.length-1};
}

/** The leading site (most residents) of each year: number of changes, distinct leaders and the longest tenure. Ties keep the earlier leader. */
export function centerMoves(rows){
 let leader=null,since=null,changes=0,longest=0;const seen=new Set();
 for(const {year,people} of rows){
  let best=leader??0;for(let i=0;i<people.length;i++)if(people[i]>people[best])best=i;
  if(leader===null){leader=best;since=year;}
  else if(best!==leader){longest=Math.max(longest,year-since);changes++;leader=best;since=year;}
  seen.add(leader);
 }
 if(rows.length)longest=Math.max(longest,rows.at(-1).year-since+1);
 return {changes,distinctLeaders:seen.size,longestTenureYears:longest,endLeader:leader};
}

// ---- chronicle classes ----
/** Title patterns for records the existing generators store without a kind (economy, society, settlement scale, memory loss, choices). */
const untypedPatterns=[
 ['economy-shortage',/の食糧不足が続く$/],['economy-route-closed',/を結ぶ往来が途絶える$/],
 ['economy-route-shared',/が交易路を共同で維持する$/],['economy-route-paused',/の共同管理が休止する$/],
 ['economy-move',/(新たに定住する|住まいを移す)人々$/],
 ['society-practice-formed',/で.+が根づく$/],['society-practice-inherited',/が.+を受け継ぐ$/],['society-practice-lost',/で.+が途絶える$/],
 ['society-split',/が別の寄り合いを持つ$/],['society-rejoined',/が再び共同の寄り合いに加わる$/],
 ['settlement-scale',/と呼ばれるようになる$/],
];
export function recordClass(r){
 if(r.kind)return r.kind.startsWith('legacy-formed-')?'legacy-formed':r.kind;
 if(r.tag==='誕生')return 'founding';
 if(r.tag==='選択')return 'choice';
 if(r.tag==='継承'&&/が失われる$/.test(r.title))return 'legacy-lost';
 if(r.tag==='地域')for(const [k,p] of untypedPatterns)if(p.test(r.title))return k;
 return 'unclassified:'+r.tag;
}
/** Groups used to compare existing shortages, trade, damage and social change with the future episodes (D0 §11.2). */
export const RECORD_GROUPS={
 shortage:['economy-shortage','famine','drought'],
 trade:['economy-route-closed','economy-route-shared','economy-route-paused','trade','isolation','market','first_port','salt','ferry'],
 damage:['building-damaged','building-repaired','building-abandoned','building-reused','housing-damaged','housing-repaired','housing-ruined','housing-reused','housing-vacated','housing-underused'],
 society:['society-practice-formed','society-practice-inherited','society-practice-lost','society-split','society-rejoined','split','dispute','reconciliation','first_fragment','first_confederation'],
};

/**
 * Counts by class, records per fixed window, windows without any record, and consecutive repeats of a class.
 * Window statistics use full windows only (years 0..horizon split into windows of `windowYears`); the years after the
 * last full window are counted in the totals and reported as `partialWindowYears`, not as a short, sparse window.
 */
export function chronicleMeasures(history,horizon,windowYears=ANALYSIS.windowYears){
 const byClass={},windows=Math.floor((horizon+1)/windowYears),all=Array(windows).fill(0),important=Array(windows).fill(0),civil=Array(windows).fill(0);
 let repeats=0,prev=null;const civilSet=new Set();
 for(const r of history){
  if(r.year>horizon)throw Error('a record after the horizon '+r.id);
  const c=recordClass(r);byClass[c]=(byClass[c]??0)+1;
  const w=Math.floor(r.year/windowYears),full=w<windows;if(full){all[w]++;if(r.important)important[w]++;}
  // "civilization" records: the annual event draw of story/engine (they have a kind and no land object)
  if(r.kind&&!r.buildingId&&!r.publicSpaceId&&!/^(legacy-|building-|housing-|public-space-)/.test(r.kind)){if(full)civil[w]++;civilSet.add(r.kind);}
  if(c===prev)repeats++;prev=c;
 }
 const groups=Object.fromEntries(Object.entries(RECORD_GROUPS).map(([g,ks])=>[g,ks.reduce((s,k)=>s+(byClass[k]??0),0)]));
 return {windowYears,total:history.length,important:history.filter(r=>r.important).length,byClass:Object.fromEntries(Object.entries(byClass).sort()),groups,
  unclassified:Object.entries(byClass).filter(([k])=>k.startsWith('unclassified:')).reduce((s,[,v])=>s+v,0),
  perWindow:{all:distribution(all),important:distribution(important),civilization:distribution(civil)},
  emptyWindows:all.filter(v=>v===0).length,windowsWithoutCivilizationRecord:civil.filter(v=>v===0).length,windows,partialWindowYears:horizon+1-windows*windowYears,
  distinctCivilizationKinds:civilSet.size,consecutiveSameClass:repeats};
}

/** Institutions (CivilizationMemory) from the memory log: actions, re-formations and lifespans (censored when active). */
export function memoryMeasures(log,active,horizon){
 const byKind={},lifespans=[],censored=[];
 for(const e of log){
  const k=byKind[e.kind]??={formed:0,strengthened:0,weakened:0,lost:0,reformed:0};
  k[e.action]++;if(e.action==='formed'&&k.lost>0)k.reformed++;
  if(e.action==='lost')lifespans.push(e.year-e.established);
 }
 for(const l of Object.values(active))censored.push(horizon-l.established);
 return {byKind:Object.fromEntries(Object.entries(byKind).sort()),activeAtHorizon:Object.keys(active).sort(),
  lifespanLost:distribution(lifespans),lifespanCensored:distribution(censored),formed:log.filter(e=>e.action==='formed').length,lost:log.filter(e=>e.action==='lost').length};
}

/** Decisions: count, years, the gaps between them and to the horizon (the last gap is censored). */
export function decisionMeasures(decisions,horizon){
 const years=decisions.map(d=>d.year),gaps=years.map((y,i)=>i?y-years[i-1]:y);
 return {count:years.length,years,gaps:distribution(gaps),firstYear:years[0]??null,censoredGapToHorizon:horizon-(years.at(-1)??0)};
}

// ---- seed allocation (D0 §11.1) ----
/**
 * Pre-fixed candidates 1, 2, 3, … classified by the production climate reader. Worlds in a climate transition zone are
 * left out (as in #38 D3 / #39 D5). Within each biome, stable seeds alternate in ascending order: even rank → tuning,
 * odd rank → acceptance. The acceptance seeds are never used for tuning.
 */
export function allocateSeeds({tuning,acceptance,limit=200000}){
 const out=Object.fromEntries(BIOME_KINDS.map(b=>[b,{tuning:[],acceptance:[]}])),rank=Object.fromEntries(BIOME_KINDS.map(b=>[b,0]));let transition=0,scanned=0;
 for(let seed=1;seed<=limit;seed++){
  scanned=seed;const c=generateClimateBaseline(seed);
  if(c.transition){transition++;continue;}
  // strict alternation by rank among the biome's stable seeds; a seed whose list is already full is not used
  const slot=out[c.dominantBiome],list=rank[c.dominantBiome]++%2===0?slot.tuning:slot.acceptance,cap=list===slot.tuning?tuning:acceptance;
  if(list.length<cap)list.push(seed);
  if(BIOME_KINDS.every(b=>out[b].tuning.length>=tuning&&out[b].acceptance.length>=acceptance))break;
 }
 for(const b of BIOME_KINDS)if(out[b].tuning.length<tuning||out[b].acceptance.length<acceptance)throw Error('not enough '+b+' seeds below '+limit);
 return {rule:'ascending-stable-alternate-v1',scannedUpTo:scanned,transitionSkipped:transition,biomes:out};
}
