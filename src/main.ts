import {environmentLabel} from './environment/presentation-v1.js';
import {SceneMotionPlayer} from './scene/motion-player.js';
import {lastObservedYear,ensureMemory,legacyNames} from './story/engine.js';
import {findWorldSave,storeWorldSave,decodeWorldSave,higherPriorityWorldSaveKeys} from './story/world-storage.js';
import {restoreWorldSession,prepareWorldSessionSave,enableWorldEconomicCoupling,enableWorldTerrainDevelopment,worldTerrainDevelopmentAtYear,enableWorldIrrigation,improveWorldGrowth,improveWorldEnvironment,slowWorldClimate,advanceWorldSessionAsync,chooseWorldSessionAsync,observeWorldSession,drawWorldSession,worldArchitectureChronicle,worldStreetscapeAt,type WorldSession} from './story/world-session.js';
import {serializeWorldSave,PreClimateWorldError,OutdatedWorldSaveError} from './story/world-save.js';
/** Issue #47 B2a: saves from before the climate record (v9) are kept but not opened. */
const preClimateNote='以前の版（気候の記録がない世界）の保存です。この版では開けません。保存値はそのまま残しています。新しい文明を作ってください。';
/** Issue #47 B2b: saves of an earlier version of the current format (v10 before the flora record). */
const outdatedNote='以前の版の保存です。この版では開けません。保存値はそのまま残しています。新しい文明を作ってください。';
const unopenableNote=(error:unknown):string|null=>error instanceof PreClimateWorldError?preClimateNote:error instanceof OutdatedWorldSaveError?outdatedNote:null;
import type {RecordEntry} from './story/engine.js';
import {siteAt} from './story/settlement-history.js';
import {practiceNames} from './story/society.js';
import {civilizationStatusView,metricSeries,seriesRuns,reduceSeries,metricScale,recordMarkers,graphWindow,yearAtFraction,formatMetricValue,metricLabels,type GraphRange} from './story/civilization-status-view.js';
import {observeCivilizationMetrics,type CivilizationMetricKey} from './story/civilization-metrics.js';
import {historicalSourceOf,historicalSubjectAt,historicalTargetsAt,historicalSiteIds,sameHistoricalTarget,type HistoricalTargetRef,type HistoricalSubject} from './story/historical-records.js';
import {buildPickMask,pickAt,targetPixels,type PickMask} from './scene/historical-pick-mask.js';
import type {ArchitectureGeneratedSession} from './story/world-session.js';
const el=(id:string)=>document.getElementById(id)!;
const randomSeed=()=>Math.floor(Math.random()*4294967295)+1;
/** Paint feedback before native JSON/terrain validation; hidden tabs use a bounded timer. */
async function paintFeedback(){await new Promise<void>(resolve=>{const timer=setTimeout(resolve,50);requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve();}));});}
function verifyWorldCandidate(candidate:WorldSession){for(let i=0;i<3;i++){const s=drawWorldSession(document.createElement('canvas'),candidate,lastObservedYear(candidate.state),i);if(!Number.isFinite(s.population)||s.population<0||s.local&&(!Number.isFinite(s.local.population)||s.local.population<0)||s.objects.some(o=>typeof o.id!=='string'||!['house','hall','bridge','field','ruin','memorial','market','workshop','granary'].includes(o.kind)||![o.x,o.y,o.builtYear].every(Number.isSafeInteger)||o.x<0||o.x>320||o.y<0||o.y>180||o.builtYear<0||o.builtYear>s.year||!['intact','damaged','ruined'].includes(o.condition)))throw Error('Invalid observed world');}}
function mount(initial:WorldSession){
const input=el('seed') as HTMLInputElement;
const scrubber=el('rewind-year') as HTMLInputElement;
const siteSelect=el('site-select') as HTMLSelectElement;
const canvas=el('scene') as HTMLCanvasElement;
const motion=new SceneMotionPlayer(canvas,el('scene-motion') as HTMLInputElement);
const slot=el('choice');
const speedInput=el('speed') as HTMLSelectElement;
const autoChoiceInput=el('auto-choice') as HTMLInputElement;
const autoDelayInput=el('auto-delay') as HTMLSelectElement;
const autoStatus=el('auto-choice-status');
const speedDelays:Record<string,number>={slow:2100,normal:850,fast:250,rapid:75};
let world=initial;
let state=world.state;
let busy=false;
let operation=0;
let active:RecordEntry=state.history[0]!;
let timer:ReturnType<typeof setInterval>|null=null;
let expanded=false;
let choiceTimeout:ReturnType<typeof setTimeout>|null=null;
let choiceDeadline=0;
let choiceId:string|null=null;
function clearChoiceTimer(){if(choiceTimeout!==null){clearTimeout(choiceTimeout);choiceTimeout=null;}choiceId=null;choiceDeadline=0;autoStatus.textContent='';}
async function resolvePending(index:number|'random'){
 if(busy||!state.pending)return;clearChoiceTimer();const source=world,ticket=++operation;setBusy(true);
 try{if(source.mode==='generated'&&source.review.format==='terrain-production-world-v1')await paintFeedback();const candidate=await chooseWorldSessionAsync(source,index);if(ticket!==operation||world!==source)return;adopt(candidate,true,true);}
 catch{if(ticket===operation&&world===source){stop();el('feedback').textContent='選択を確定できませんでした。現在の歴史は保持しています。';}}
 finally{if(ticket===operation){setBusy(false);render();scheduleChoice();}}
}
function scheduleChoice(){
 if(!state.pending||!autoChoiceInput.checked||timer===null||viewedYear!==null){clearChoiceTimer();return;}
 if(choiceTimeout!==null&&choiceId===state.pending.id)return;
 clearChoiceTimer();choiceId=state.pending.id;
 const delay=Number(autoDelayInput.value)*1000;
 choiceDeadline=Date.now()+delay;
 autoStatus.textContent=`${delay/1000}秒後にランダム選択`;
 const source=world;choiceTimeout=setTimeout(()=>{
  choiceTimeout=null;
  if(world===source&&state.pending?.id===choiceId&&autoChoiceInput.checked&&timer!==null&&viewedYear===null)resolvePending('random');
  else clearChoiceTimer();
 },delay);
}

let viewedYear:number|null=null;
function stop(){clearChoiceTimer();if(timer!==null){clearInterval(timer);timer=null;}el('play').textContent='自動で見守る ▷';if(throttledRender!==null)render();}
function start(){if(timer!==null)clearInterval(timer);timer=setInterval(forward,speedDelays[speedInput.value]??850);el('play').textContent='自動進行を停止 Ⅱ';scheduleChoice();}
function chapter(entries:RecordEntry[]){
 const has=(title:string)=>entries.some(e=>e.title===title);
 if(has('長く続いた共同の決まりが解かれる')||has('人々は二つの道を選ぶ'))return '分かれた道 · 受け継がれるもの';
 if(has('村々の中心に大きな町が生まれる'))return '町の時代 · 人々が集う土地';
 if(has('集落の寄り合いが連合となる'))return '寄り合いの時代 · 交わる暮らし';
 if(has('共同の穀物庫が築かれる'))return '蓄えの時代 · 変わる暮らし';
 return '小さな集落 · はじまりの時代';
}
function format(v:number){return new Intl.NumberFormat('ja-JP').format(Math.round(v));}
function inspect(year:number,record?:RecordEntry){stop();graphCandidate=null;viewedYear=year;active=record??[...state.history].reverse().find(e=>e.year<=year)??state.history[0]!;render();document.querySelector('.paper')!.scrollIntoView({behavior:'smooth',block:'start'});}
/**
 * Issue #36 D3 (Human decisions after D1c): a step to a later confirmed year blends a changed season over 250 ms; at the
 * fast and rapid speeds the whole observation (scene and year label together) is redrawn at most every 1400 ms, showing
 * only the latest confirmed year, with a 350 ms blend. Stopping, or any other action, draws the latest year at once.
 */
const SEASON_BLEND_MS=250,THROTTLED_BLEND_MS=350,THROTTLE_MS=1400;
let stepped=false,stepTransition=0,lastStepRender=0,throttledRender:ReturnType<typeof setTimeout>|null=null;
function renderStep(){
 const fast=timer!==null&&(speedInput.value==='fast'||speedInput.value==='rapid');
 if(!fast){stepTransition=SEASON_BLEND_MS;render();return;}
 const wait=lastStepRender+THROTTLE_MS-Date.now();
 if(wait<=0){stepTransition=THROTTLED_BLEND_MS;render();return;}
 if(throttledRender===null)throttledRender=setTimeout(()=>{throttledRender=null;stepTransition=THROTTLED_BLEND_MS;render();},wait);
}
/**
 * Issue #29 S2/S3: the civilization-wide status bar under the scene and the one-metric history graph.
 * Both read only confirmed years (observeCivilizationMetrics); the graph's window is separate from the observed year.
 */
let graphMetric:CivilizationMetricKey|null=null,graphRange:GraphRange=200;
/** null: the window ends at the last confirmed year and follows it; a number: the window is held there. */
let graphEnd:number|null=null;
/** A touch or keyboard choice not yet observed (never written to the observed year or the history). */
let graphCandidate:number|null=null;
const SVG='http://www.w3.org/2000/svg',narrowGraph=matchMedia('(max-width:680px)');
/** Plot geometry in viewBox units; the viewBox keeps the CSS aspect ratio so text and points are not stretched. */
let PLOT={left:52,right:632,top:14,bottom:164,width:640,height:200};
const graphGeometry=()=>narrowGraph.matches?{left:60,right:628,top:18,bottom:268,width:640,height:320}:{left:52,right:632,top:14,bottom:164,width:640,height:200};
const svg=(name:string,attrs:Record<string,string|number>,text?:string)=>{const e=document.createElementNS(SVG,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;};
function renderStatus(y:number,scenePopulation:number,viewingPast:boolean,awaitingChoice:boolean){
 const view=civilizationStatusView(state,y,scenePopulation);
 const baseline=view.rows.find(r=>r.change.kind==='change')?.change as {fromYear:number}|undefined;
 el('civ-status-year').textContent=`世界暦 ${format(y)}年の確定値${viewingPast?'（当時）':awaitingChoice?'（分かれ道の前の年）':''}${baseline?` · 増減は${format(baseline.fromYear)}年との差`:''}`;
 for(const row of view.rows){
  el(row.key).textContent=row.valueText;
  const change=el(row.key+'-change');change.textContent=row.change.text;
  change.dataset.direction=row.change.kind==='change'?row.change.direction:'none';
 }
 for(const b of document.querySelectorAll<HTMLButtonElement>('.civ-metric'))b.setAttribute('aria-pressed',String(b.dataset.metric===graphMetric));
}
function graphWindowNow(confirmedYear:number){return graphWindow(confirmedYear,graphRange,graphEnd??confirmedYear);}
function renderGraph(y:number,confirmedYear:number){
 const panel=el('civ-graph');panel.hidden=graphMetric===null;if(graphMetric===null)return;
 const key=graphMetric,win=graphWindowNow(confirmedYear),points=metricSeries(state,key,win.from,win.to),scale=metricScale(key,points);
 for(const b of document.querySelectorAll<HTMLButtonElement>('.civ-graph-ranges button'))b.setAttribute('aria-pressed',String(b.dataset.range===String(graphRange)));
 el('civ-graph-title').textContent=`${metricLabels[key]}の推移（文明全体・${scale.unit}）`;
 const plot=el('civ-graph-plot');plot.replaceChildren();PLOT=graphGeometry();plot.setAttribute('viewBox',`0 0 ${PLOT.width} ${PLOT.height}`);
 const span=Math.max(1,win.to-win.from),x=(year:number)=>PLOT.left+(year-win.from)/span*(PLOT.right-PLOT.left),yv=(v:number)=>PLOT.bottom-(v-scale.min)/(scale.max-scale.min)*(PLOT.bottom-PLOT.top);
 for(const t of scale.ticks){plot.append(svg('line',{x1:PLOT.left,x2:PLOT.right,y1:yv(t),y2:yv(t),class:'grid'}),svg('text',{x:PLOT.left-6,y:yv(t)+4,class:'tick','text-anchor':'end'},key==='population'?new Intl.NumberFormat('ja-JP',{notation:'compact'}).format(t):String(t)));}
 plot.append(svg('text',{x:PLOT.left,y:PLOT.height-8,class:'tick'},`${format(win.from)}年`),svg('text',{x:PLOT.right,y:PLOT.height-8,class:'tick','text-anchor':'end'},`${format(win.to)}年`));
 const columns=Math.round(PLOT.right-PLOT.left);
 for(const run of seriesRuns(points)){const drawn=reduceSeries(run,columns);
  if(drawn.length===1)plot.append(svg('circle',{cx:x(drawn[0]!.year),cy:yv(drawn[0]!.value),r:2,class:'line-point'}));
  else plot.append(svg('path',{d:drawn.map((p,i)=>`${i?'L':'M'}${x(p.year).toFixed(1)} ${yv(p.value).toFixed(1)}`).join(''),class:'line'}));}
 // Chronicle records marked important, grouped per 4px column so every marker stays visible.
 const groups=new Map<number,{year:number;count:number;titles:string[]}>();
 for(const m of recordMarkers(state,win.from,win.to)){const col=Math.round(x(m.year)/4);const g=groups.get(col);if(g){g.count+=m.count;g.titles.push(...m.records.map(r=>`${m.year}年 ${r.title}`));}else groups.set(col,{year:m.year,count:m.count,titles:m.records.map(r=>`${m.year}年 ${r.title}`)});}
 for(const g of groups.values()){const mark=svg('line',{x1:x(g.year),x2:x(g.year),y1:PLOT.bottom+3,y2:PLOT.bottom+11,class:'marker','data-year':g.year});mark.append(svg('title',{},`記録 ${g.count}件：${g.titles.slice(0,3).join('、')}${g.titles.length>3?' ほか':''}`));plot.append(mark);}
 const pin=(year:number,cls:string)=>{if(year<win.from||year>win.to)return;const o=observeCivilizationMetrics(state,year);plot.append(svg('line',{x1:x(year),x2:x(year),y1:PLOT.top,y2:PLOT.bottom,class:cls}));if(o)plot.append(svg('circle',{cx:x(year),cy:yv(o[key]),r:3.5,class:cls+'-point'}));};
 pin(y,'observed');if(graphCandidate!==null&&graphCandidate!==y)pin(graphCandidate,'candidate');
 let lo=points[0],hi=points[0];for(const p of points){if(p.value<lo!.value)lo=p;if(p.value>hi!.value)hi=p;}
 const now=observeCivilizationMetrics(state,y);
 el('civ-graph-summary').textContent=!points.length?'この範囲には指標の記録がありません（記録が始まる前の文明です）。':
  `世界暦 ${format(win.from)}〜${format(win.to)}年 · 最小 ${formatMetricValue(key,lo!.value)}（${format(lo!.year)}年） · 最大 ${formatMetricValue(key,hi!.value)}（${format(hi!.year)}年）${now?` · 観測中の${format(y)}年 ${formatMetricValue(key,now[key])}`:''}${points.length<win.to-win.from+1?' · 記録のない年は線を結んでいません':''}`;
 const input=el('civ-graph-year') as HTMLInputElement;input.max=String(confirmedYear);if(document.activeElement!==input)input.value=String(graphCandidate??y);
 const c=graphCandidate,candidateLine=el('civ-graph-candidate');
 if(c===null)candidateLine.textContent='マウスではグラフを押した年へ移動します。タッチや年の入力では、候補を選んでから「この年を観測」で移動します。';
 else {const o=observeCivilizationMetrics(state,c),records=state.history.filter(r=>r.year===c&&r.important);candidateLine.textContent=`候補：世界暦 ${format(c)}年 · ${o?formatMetricValue(key,o[key]):'記録なし'}${records.length?` · この年の記録 ${records.length}件：${records.slice(0,2).map(r=>r.title).join('、')}`:''}`;}
}
/** The common entry of graph observation: a confirmed year only; stops automatic progress; does not scroll. */
function observeYear(year:number){
 const confirmed=lastObservedYear(state);if(!Number.isSafeInteger(year)||year<0||year>confirmed)return;
 stop();const win=graphWindowNow(confirmed);
 // Hold the window where it is; move it only as far as needed when the year lies outside it.
 graphEnd=year<win.from?Math.min(confirmed,year+(win.to-win.from)):year>win.to?year:win.to;
 graphCandidate=null;
 // The last confirmed year is the live view (as on the slider): a pending choice stays visible.
 viewedYear=year===confirmed?null:year;if(viewedYear===null)graphEnd=null;
 active=[...state.history].reverse().find(e=>e.year<=year)??state.history[0]!;render();
}
function returnLive(){viewedYear=null;graphEnd=null;graphCandidate=null;render();}
function setCandidate(year:number){const confirmed=lastObservedYear(state);if(!Number.isFinite(year))return;graphCandidate=Math.max(0,Math.min(confirmed,Math.round(year)));render();}
for(const b of document.querySelectorAll<HTMLButtonElement>('.civ-metric'))b.addEventListener('click',()=>{const key=b.dataset.metric as CivilizationMetricKey;graphMetric=graphMetric===key?null:key;render();});
for(const b of document.querySelectorAll<HTMLButtonElement>('.civ-graph-ranges button'))b.addEventListener('click',()=>{const r=b.dataset.range;graphRange=r==='all'?'all':Number(r) as GraphRange;render();});
el('civ-graph-close').addEventListener('click',()=>{graphMetric=null;graphCandidate=null;render();});
const graphPlot=el('civ-graph-plot');
let plotPress:number|null=null;
graphPlot.addEventListener('pointerdown',event=>{plotPress=event.isPrimary&&event.button===0?event.pointerId:null;});
graphPlot.addEventListener('pointercancel',()=>{plotPress=null;});
graphPlot.addEventListener('pointerup',event=>{
 const pressed=plotPress===event.pointerId;plotPress=null;
 if(busy||!event.isPrimary||event.button!==0||!pressed)return;const rect=graphPlot.getBoundingClientRect();if(!rect.width)return;
 const vx=(event.clientX-rect.left)/rect.width*PLOT.width,year=yearAtFraction(graphWindowNow(lastObservedYear(state)),(vx-PLOT.left)/(PLOT.right-PLOT.left));
 // Human decision C: a mouse (or pen) observes the year at once; a touch only proposes it until confirmed.
 if(event.pointerType==='touch')setCandidate(year);else observeYear(year);
});
const typedYear=()=>{const v=(el('civ-graph-year') as HTMLInputElement).value.trim();return v===''?NaN:Number(v);};
el('civ-graph-year').addEventListener('change',()=>{const y=typedYear();if(Number.isFinite(y))setCandidate(y);});
el('civ-graph-minus').addEventListener('click',()=>setCandidate((graphCandidate??viewedYear??lastObservedYear(state))-1));
el('civ-graph-plus').addEventListener('click',()=>setCandidate((graphCandidate??viewedYear??lastObservedYear(state))+1));
const recordYears=()=>recordMarkers(state,0,lastObservedYear(state)).map(m=>m.year);
el('civ-graph-prev-record').addEventListener('click',()=>{const from=graphCandidate??viewedYear??lastObservedYear(state),year=recordYears().filter(y=>y<from).at(-1);if(year!==undefined)setCandidate(year);});
el('civ-graph-next-record').addEventListener('click',()=>{const from=graphCandidate??viewedYear??lastObservedYear(state),year=recordYears().find(y=>y>from);if(year!==undefined)setCandidate(year);});
el('civ-graph-observe').addEventListener('click',()=>{if(busy)return;const year=graphCandidate??typedYear();if(Number.isFinite(year))observeYear(Math.max(0,Math.min(lastObservedYear(state),Math.round(year))));});
/**
 * Issue #39 D2: "調べる" — read-only investigation of the observed still scene. The scene canvas is never drawn on; the
 * outline goes to a separate annotation canvas and the records to the panel outside the scene. Investigating does not
 * stop or change progress; an explicit year move (D3) will.
 */
const inspectToggle=el('inspect-toggle') as HTMLButtonElement,pickLayer=el('scene-pick') as HTMLCanvasElement,sceneBox=el('scene-canvas');
let inspecting=false,selected:HistoricalTargetRef|null=null,hovered:number|null=null,candidates:readonly HistoricalTargetRef[]=[],pickNote='';
let pickCache:{world:WorldSession;year:number;site:number;mask:PickMask}|null=null;
const isArchitecture=(w:WorldSession):w is ArchitectureGeneratedSession=>'architecture' in w&&Boolean(w.architecture);
const observedNow=()=>({year:viewedYear??lastObservedYear(state),site:Number(siteSelect.value)});
function pickMaskAt(year:number,site:number):PickMask|null{
 if(!inspecting||!isArchitecture(world))return null;
 if(pickCache&&pickCache.world===world&&pickCache.year===year&&pickCache.site===site)return pickCache.mask;
 const mask=buildPickMask(world,year,site);pickCache={world,year,site,mask};return mask;
}
const pickMaskNow=()=>{const o=observedNow();return pickMaskAt(o.year,o.site);};
function outlineTarget(c:CanvasRenderingContext2D,mask:PickMask,index:number,color:string){
 const own=new Uint8Array(320*180),ring=new Set<number>();for(const i of targetPixels(mask,index))own[i]=1;
 for(let i=0;i<own.length;i++){if(!own[i])continue;const x=i%320,y=(i-x)/320;
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<320&&ny>=0&&ny<180&&!own[ny*320+nx])ring.add(ny*320+nx);}}
 c.fillStyle=color;for(const i of ring)c.fillRect(i%320,Math.floor(i/320),1,1);
}
function drawPickLayer(){
 const c=pickLayer.getContext('2d')!;c.clearRect(0,0,320,180);
 const mask=inspecting?pickMaskNow():null;if(!mask)return;
 const chosen=selected?mask.targets.findIndex(t=>sameHistoricalTarget(t,selected!)):-1;
 if(hovered!==null&&hovered!==chosen)outlineTarget(c,mask,hovered,'rgba(255,248,214,.55)');
 if(chosen>=0)outlineTarget(c,mask,chosen,'rgba(255,248,214,.95)');
}
function setInspecting(on:boolean){
 inspecting=on;selected=null;candidates=[];hovered=null;pickNote='';if(!on)pickCache=null;
 sceneBox.classList.remove('over-target');motion.setStill(on);render();
}
function selectTarget(ref:HistoricalTargetRef,near:readonly HistoricalTargetRef[]=[]){selected=ref;candidates=near;pickNote='';render();}
const textButton=(label:string,pressed:boolean,onclick:()=>void)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',String(pressed));b.onclick=onclick;return b;};
const presenceText=(s:HistoricalSubject,visible:boolean)=>
 s.presence==='recorded'?(visible?`世界暦 ${format(s.observedYear)}年の状態：${s.currentCondition}`:`記録はありますが、世界暦 ${format(s.observedYear)}年の風景では見えていません。状態：${s.currentCondition}`)
 :s.presence==='not-yet-built'?'この年にはまだ建てられていません。'
 :s.presence==='unsupported'?'記録はありますが、この対象と確実に結び付けられないため、履歴を表示できません。'
 :'この年についての記録はありません（不明）。';
function renderInspector(y:number,siteIndex:number){
 const supported=isArchitecture(world);inspectToggle.hidden=!supported;
 if(!supported&&inspecting){inspecting=false;selected=null;candidates=[];pickCache=null;motion.setStill(false);}
 inspectToggle.setAttribute('aria-pressed',String(inspecting));inspectToggle.textContent=inspecting?'調べる ✓':'調べる';
 el('inspector').hidden=!inspecting;sceneBox.classList.toggle('inspecting',inspecting);
 if(!inspecting||!supported){drawPickLayer();return;}
 const mask=pickMaskAt(y,siteIndex)!,source=historicalSourceOf(world as ArchitectureGeneratedSession),siteId=historicalSiteIds[siteIndex]!;
 const visible=(ref:HistoricalTargetRef)=>{const i=mask.targets.findIndex(t=>sameHistoricalTarget(t,ref));return i>=0&&mask.visiblePixels[i]!>0;};
 // a choice belongs to its site; it is checked again in every observed year
 if(selected&&historicalSubjectAt(source,selected,y).siteId!==siteId){selected=null;candidates=[];}
 candidates=candidates.filter(r=>historicalSubjectAt(source,r,y).siteId===siteId);
 if(hovered!==null&&hovered>=mask.targets.length)hovered=null;
 el('inspector-hint').textContent=pickNote||`世界暦 ${format(y)}年の${['川辺','丘陵','入り江'][siteIndex]}。風景の建物・住宅街区・橋・水路を選ぶと、確定した記録を読めます。見えないものは「この土地の記録」から選べます。`;
 const near=el('inspector-candidates');near.replaceChildren();near.hidden=candidates.length<2;
 if(candidates.length>1){const label=document.createElement('span');label.textContent='近くの候補：';near.append(label);
  for(const r of candidates)near.append(textButton(historicalSubjectAt(source,r,y).name,Boolean(selected&&sameHistoricalTarget(r,selected)),()=>selectTarget(r,candidates)));}
 const article=el('inspector-subject');article.hidden=!selected;
 if(selected){
  const s=historicalSubjectAt(source,selected,y),shown=s.presence==='recorded'||s.presence==='unsupported';
  el('inspector-name').textContent=shown?s.title:s.name;
  el('inspector-state').textContent=presenceText(s,visible(s.ref));
  const g=s.generations.at(-1),generation=el('inspector-generation');generation.hidden=!g;
  generation.textContent=!g?'':g.generation===1?'建てられたときの建物（第1世代）':`第${g.generation}世代（世界暦 ${format(g.year)}年に建て直し）`;
  const titles=new Map(state.history.map(r=>[r.id,r.title])),ol=el('inspector-history');ol.replaceChildren();
  for(const c of s.history){const li=document.createElement('li'),time=document.createElement('time');time.textContent=`世界暦 ${format(c.year)}年`;
   li.append(time,document.createTextNode(`${c.label} · ${c.condition}`));
   const title=c.linkedChronicleId?titles.get(c.linkedChronicleId):undefined;
   if(title){const note=document.createElement('span');note.className='chronicle';note.textContent=`年代記：${title}`;li.append(note);}
   ol.append(li);}
 }
 const records=historicalTargetsAt(source,siteId,y),shownList=el('inspector-visible'),hiddenList=el('inspector-hidden');shownList.replaceChildren();hiddenList.replaceChildren();
 for(const s of records){const b=textButton(s.title+(s.presence==='unsupported'?'（結び付け不可）':''),Boolean(selected&&sameHistoricalTarget(s.ref,selected)),()=>selectTarget(s.ref));(visible(s.ref)?shownList:hiddenList).append(b);}
 for(const list of [shownList,hiddenList])if(!list.childElementCount){const p=document.createElement('p');p.textContent='ありません。';list.append(p);}
 el('inspector-records-summary').textContent=`この土地の記録から調べる（${records.length}件）`;
 drawPickLayer();
}
inspectToggle.addEventListener('click',()=>setInspecting(!inspecting));
el('inspector-close').addEventListener('click',()=>{setInspecting(false);inspectToggle.focus();});
el('inspector').addEventListener('keydown',event=>{if(event.key==='Escape'&&selected){selected=null;candidates=[];render();}});
/** The scene pixel under a pointer (the canvas is scaled by CSS; its border is outside the 320×180 image). */
function scenePoint(event:PointerEvent){
 const r=canvas.getBoundingClientRect(),w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return null;
 const x=Math.floor((event.clientX-r.left-canvas.clientLeft)/w*320),y=Math.floor((event.clientY-r.top-canvas.clientTop)/h*180);
 return x>=0&&x<320&&y>=0&&y<180?{x,y,scale:w/320}:null;
}
canvas.addEventListener('pointermove',event=>{
 if(!inspecting||event.pointerType==='touch')return;const p=scenePoint(event),mask=p?pickMaskNow():null;
 const next=p&&mask?pickAt(mask,p.x,p.y)[0]??null:null;
 if(next!==hovered){hovered=next;sceneBox.classList.toggle('over-target',next!==null);drawPickLayer();}
});
canvas.addEventListener('pointerleave',()=>{if(hovered!==null){hovered=null;sceneBox.classList.remove('over-target');drawPickLayer();}});
let pickPress:number|null=null;
canvas.addEventListener('pointerdown',event=>{pickPress=inspecting&&event.isPrimary&&event.button===0?event.pointerId:null;});
canvas.addEventListener('pointercancel',()=>{pickPress=null;});
canvas.addEventListener('pointerup',event=>{
 const pressed=pickPress===event.pointerId;pickPress=null;if(!inspecting||!pressed)return;
 const p=scenePoint(event),mask=pickMaskNow();if(!p||!mask)return;
 // a touch reaches a few pixels around the finger (about 12 CSS px); a mouse or pen picks the exact pixel
 const radius=event.pointerType==='touch'?Math.max(1,Math.min(8,Math.round(12/p.scale))):0;
 const found=pickAt(mask,p.x,p.y,radius).map(i=>mask.targets[i]!);
 if(!found.length){selected=null;candidates=[];pickNote='ここには調べられる記録がありません。見えないものは「この土地の記録」から選べます。';render();return;}
 selectTarget(found[0]!,found.length>1?found:[]);
});
function render(){
 if(throttledRender!==null){clearTimeout(throttledRender);throttledRender=null;}
 const seasonTransition=stepTransition;stepTransition=0;lastStepRender=Date.now();
 const economicButton=el('enable-economic') as HTMLButtonElement,economicNote=el('economic-note');
 const economicEligible=world.mode==='generated'&&world.review.format==='generated-bridge-review'&&Boolean(world.review.irrigation)&&world.review.review.growthPattern==='organic-v3';
 economicButton.hidden=!economicEligible;economicButton.disabled=busy||Boolean(state.pending)||lastObservedYear(state)>=10000;
 economicNote.hidden=!economicEligible||(!state.pending&&lastObservedYear(state)<10000);economicNote.textContent=lastObservedYear(state)>=10000?'この文明は観測上限に達しています。':'現在の選択を終えると導入できます。';
 const terrainButton=el('enable-terrain') as HTMLButtonElement,terrainNote=el('terrain-note');
 const terrainEligible=world.mode==='generated'&&world.review.format==='irrigation-economic-production-world-v1';terrainButton.hidden=!terrainEligible;terrainButton.disabled=busy||Boolean(state.pending)||lastObservedYear(state)>=10000;
 terrainNote.hidden=!terrainEligible;terrainNote.textContent=lastObservedYear(state)>=10000?'この文明は観測上限に達しています。':state.pending?'現在の選択を終えると、丘陵の整地を始められます。':'過去の地形と暮らしを保ち、これからの丘陵で小さな平場を作ります。工事の直接収穫効果と追加負担は加えません。';
 const irrigationButton=el('enable-irrigation') as HTMLButtonElement;irrigationButton.hidden=world.mode!=='generated'||!world.review.environment||world.review.review.growthPattern!=='organic-v3'||Boolean(world.review.irrigation);irrigationButton.disabled=busy;
 const environmentButton=el('improve-environment') as HTMLButtonElement;environmentButton.hidden=world.mode!=='generated'||!world.review.environment||world.review.environmentAppearance==='landscape-v3';environmentButton.disabled=busy;
 const climateButton=el('slow-climate') as HTMLButtonElement;climateButton.hidden=world.mode!=='generated'||!world.review.environment||(world.review.environment.ruleId==='environment-coupled-v2'||world.review.environment.climateRule==='environment-coupled-v2');climateButton.disabled=busy||lastObservedYear(state)>=10000;
 const growthButton=el('improve-growth') as HTMLButtonElement;growthButton.hidden=world.mode!=='generated'||world.review.review.growthPattern==='organic-v3';growthButton.disabled=busy;
 const confirmedYear=lastObservedYear(state);
 const viewingPast=viewedYear!==null;
 const y=viewingPast?viewedYear!:confirmedYear;
 const legacy=state.observation?.legacy;
 const estimating=legacy!==null&&legacy!==undefined&&y<=legacy.year;
 const history=estimating?state.history.slice(0,legacy.historyCount):state.history;
 const confirmedRecords=history.filter(e=>e.year<=confirmedYear);
 const observedRecords=confirmedRecords.filter(e=>e.year<=y);
 if(viewedYear===null||!observedRecords.includes(active))active=observedRecords.at(-1)??state.history[0]!;
 const awaitingChoice=!viewingPast&&Boolean(state.pending);
 const siteIndex=Number(siteSelect.value);
 const scene=motion.show(world,y,siteIndex,viewingPast?0:seasonTransition);
 const environment=motion.environment;el('site-environment').hidden=!environment;el('site-environment').textContent=environment?environmentLabel(environment):'';
 const channel=motion.channelView,waterline=el('site-waterway');waterline.hidden=!channel||siteIndex!==0;waterline.textContent=!channel?'':!channel.introduced?'水路の記録はまだありません':channel.channel?({active:'水路に水が流れています',idle:'水路は休止しています',damaged:'水路は傷み、水が止まっています',abandoned:'放棄された水路の跡があります',retired:'水路は埋め戻されています'}[channel.channel.status]):'記録された水路はありません';
 const terrainLine=el('site-terrain'),terrainInfo=siteIndex===1?worldTerrainDevelopmentAtYear(world,y):null;terrainLine.hidden=!terrainInfo;
 if(terrainInfo){const counts={prepared:0,cultivated:0,abandoned:0,'built-over':0};for(const use of terrainInfo.uses)counts[use.status]++;
  const parts=[`丘陵の整地 ${terrainInfo.activeCount}件`,...(terrainInfo.pendingCount?[`翌年から使える平場 ${terrainInfo.pendingCount}件`]:[])];
  for(const [status,text]of [['prepared','未耕作の平場'],['cultivated','耕作に利用'],['abandoned','耕作終了'],['built-over','建築に利用']] as const)if(counts[status])parts.push(`${text} ${counts[status]}件`);
  terrainLine.textContent=y<terrainInfo.introducedYear?'この年は丘陵の整地を始める前です。':parts.join(' · ');
 }
 canvas.setAttribute('aria-label',`${['川辺','丘陵','入り江'][siteIndex]}の観測地点。時代によって家々や暮らしの様子が変化します`);
 const site=siteAt(state.observation?.sites,siteIndex,y);
 el('scene-place').hidden=!site;
 if(site&&scene.local){
  const population=`${format(scene.local.population)}人`;
  const affiliation=site.communityId==='founding-community'?'共同の寄り合い':'独自の寄り合い';
  el('site-residents').textContent=site.inhabited?`${population} · ${affiliation}`:population;
  el('site-practices').textContent=site.practices.map(p=>`${practiceNames[p.kind]}${p.active?'':'（途絶）'}`).join(' · ');
  // D5: the layout of the observed district in that year (v9 worlds only)
  const streetscape=worldStreetscapeAt(world,y,siteIndex);el('site-streetscape').hidden=!streetscape;el('site-streetscape').textContent=streetscape?`街並み：${streetscape}`:'';
 }
 // H2-C: 同じ観測年・地点の確定住宅履歴だけを描画へ投影する。
 // unknown / partial は建設履歴を推測で補完しない（H1のhousingAtに委譲）。

 el('scene-year').textContent=`世界暦 ${format(y)}年${!scene.local?' · 推定情景':''}`;
 el('scene-phase').textContent=scene.phase;
 el('scene-atmosphere').textContent=scene.atmosphere;
 el('past-notice').hidden=!viewingPast;
 el('past-note').textContent=`世界暦 ${format(y)}年の風景を観測中 · 現在は${format(confirmedYear)}年`;
 document.querySelector('.paper')!.classList.toggle('past-view',viewingPast);
 scrubber.max=String(confirmedYear);scrubber.value=String(y);
 el('rewind-label').textContent=`${format(y)}年 / 現在 ${format(confirmedYear)}年`;
 el('chapter').textContent=chapter(observedRecords);el('year').textContent=`世界暦 ${format(viewingPast?y:state.year)}年${!viewingPast&&state.pending?'（未確定）':''}`;
 el('kind').textContent=!viewingPast&&state.pending?'分かれ道':active.tag;
 el('headline').textContent=!viewingPast&&state.pending?'歴史に、ひとつの選択が訪れる。':active.title;
 el('story').textContent=!viewingPast&&state.pending?'この時代に暮らす人々には、それぞれ違う考えがある。どの選択にも、確かな未来は約束されていない。':active.body;
 el('event-number').textContent=`記録 ${String(state.history.indexOf(active)+1).padStart(2,'0')}`;
 el('causes').replaceChildren();if(viewingPast||!state.pending)for(const c of active.causes){const s=document.createElement('span');s.textContent=c;el('causes').append(s);}
 if(viewingPast||!state.pending){
  for(const id of active.relatedIds??[]){
   const related=observedRecords.find(record=>record.id===id);
   if(!related)continue;
   const link=document.createElement('button');
   link.type='button';
   link.className='textbutton';
   link.textContent=`${format(related.year)}年 · ${related.title}`;
   link.onclick=()=>inspect(related.year,related);
   el('causes').append(link);
  }
 }
 slot.hidden=viewingPast||!state.pending;
 el('step').toggleAttribute('disabled',busy||Boolean(state.pending)&&!viewingPast);
 el('play').toggleAttribute('disabled',busy);
 el('step').innerHTML=viewingPast?'現在に戻る <span>→</span>':'時を進める <span>→</span>';
 if(state.pending){el('question').textContent=state.pending.question;el('context').textContent=state.pending.context;el('options').replaceChildren();state.pending.options.forEach((o,i)=>{const b=document.createElement('button');b.className='option';const strong=document.createElement('strong');strong.textContent=o.label;const small=document.createElement('span');small.textContent=o.description;b.append(strong,small);b.disabled=busy;b.onclick=()=>void resolvePending(i);el('options').append(b);});}
 const memory=ensureMemory(state);
 const list=el('legacies-list');list.replaceChildren();
 const visibleKinds=new Map<string,{strength:number;established:number}>();
 for(const m of (estimating?memory.log.slice(0,legacy.memoryCount):memory.log).filter(x=>x.year<=y)){
  if(m.action==='lost')visibleKinds.delete(m.kind);
  else visibleKinds.set(m.kind,{strength:m.strength??0,established:m.established??m.year});
 }
 for(const [k,v] of visibleKinds){const row=document.createElement('div');row.className='legacy-row';const name=document.createElement('strong');name.textContent=legacyNames[k as keyof typeof legacyNames];const detail=document.createElement('span');detail.textContent=`${format(v.established)}年から · ${Math.round(v.strength)} / 100 ${viewingPast?'（当時）':''}`;row.append(name,detail);list.append(row);}
 if(!visibleKinds.size){const empty=document.createElement('p');empty.textContent='まだ記録された制度や習慣はありません。';list.append(empty);}
 el('name').textContent=state.name;el('origin').textContent=`${state.homeland} / ${state.trait}`;
 renderStatus(y,scene.population,viewingPast,awaitingChoice);
 renderGraph(y,confirmedYear);
 const records=expanded?confirmedRecords:confirmedRecords.slice(-5);const ol=el('timeline');ol.replaceChildren();
 // D4-c: v9 rebuild lines follow the v8 record they rebuilt at (newest first, so they come just above it)
 const rebuilds=new Map<string,string[]>();for(const n of worldArchitectureChronicle(world))rebuilds.set(n.afterRecordId,[...(rebuilds.get(n.afterRecordId)??[]),n.title]);
 for(const e of [...records].reverse()){
  for(const title of rebuilds.get(e.id)??[]){const li=document.createElement('li');li.tabIndex=0;li.className='architecture-note';const time=document.createElement('time');time.textContent=`世界暦 ${format(e.year)}年  ·  建築`;li.append(time,document.createTextNode(title));li.title='この年代の情景を見る';li.onclick=()=>inspect(e.year,e);li.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();inspect(e.year,e);}};ol.append(li);}
  const li=document.createElement('li');li.tabIndex=0;li.classList.toggle('active',viewingPast&&active.id===e.id);const time=document.createElement('time');time.textContent=`世界暦 ${format(e.year)}年  ·  ${e.tag}`;li.append(time,document.createTextNode(e.title));li.title='この年代の情景を見る';li.onclick=()=>inspect(e.year,e);li.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();inspect(e.year,e);}};ol.append(li);}
 el('toggle-all').textContent=expanded?'最近の5件だけ見る −':`過去の記録をすべて見る ＋（${confirmedRecords.length}件）`;
 renderInspector(y,siteIndex);
}
async function forward(){
 if(busy)return;if(viewedYear!==null){returnLive();return;}if(state.pending){render();scheduleChoice();return;}
 if(world.mode==='generated'&&world.review.format==='terrain-production-world-v1'&&lastObservedYear(state)>=10000){stop();render();return;}
 const source=world,ticket=++operation;setBusy(true);
 try{if(source.mode==='generated'&&source.review.format==='terrain-production-world-v1')await paintFeedback();const candidate=await advanceWorldSessionAsync(source);if(ticket!==operation||world!==source)return;adopt(candidate,true,true,true);stepped=true;}
 catch{if(ticket===operation&&world===source){stop();el('feedback').textContent='時を進められませんでした。現在の歴史は保持しています。';}}
 finally{if(ticket===operation){setBusy(false);if(stepped){stepped=false;renderStep();}else render();scheduleChoice();}}
}
siteSelect.addEventListener('change',render);
el('step').addEventListener('click',forward);
speedInput.addEventListener('change',()=>{if(timer!==null)start();});
autoChoiceInput.addEventListener('change',()=>{if(autoChoiceInput.checked)scheduleChoice();else clearChoiceTimer();});
autoDelayInput.addEventListener('change',()=>{clearChoiceTimer();scheduleChoice();});
el('play').addEventListener('click',()=>{if(busy)return;if(viewedYear!==null){returnLive();return;}if(timer!==null){stop();return;}start();});
el('return-now').addEventListener('click',returnLive);
scrubber.addEventListener('input',()=>{stop();graphCandidate=null;const y=Number(scrubber.value);viewedYear=y===lastObservedYear(state)?null:y;graphEnd=viewedYear===null?null:graphEnd;active=[...state.history].reverse().find(e=>e.year<=y)??state.history[0]!;render();});
el('toggle-all').addEventListener('click',()=>{expanded=!expanded;render();});
function setBusy(value:boolean){busy=value;document.querySelectorAll<HTMLButtonElement>('#options button').forEach(b=>b.disabled=value);for(const id of ['save','load','export','import','restart','random','step','play','improve-growth','improve-environment','slow-climate','enable-irrigation','enable-economic','enable-terrain'])(el(id) as HTMLButtonElement).disabled=value;}
function adopt(candidate:WorldSession,keepObservation=false,keepArchive=false,deferRender=false){
 verifyWorldCandidate(candidate);graphCandidate=null;if(!keepObservation)graphEnd=null;const previous={world,state,viewedYear,expanded,active,input:input.value};
 if(!keepObservation){selected=null;candidates=[];hovered=null;pickNote='';pickCache=null;}
 try{world=candidate;state=world.state;viewedYear=keepObservation?previous.viewedYear:null;expanded=keepArchive?previous.expanded:false;active=keepObservation?(state.history.find(r=>r.id===previous.active.id)??state.history[0]!):state.history[0]!;input.value=String(state.seed);if(!deferRender)render();}
 catch(error){world=previous.world;state=previous.state;viewedYear=previous.viewedYear;expanded=previous.expanded;active=previous.active;input.value=previous.input;try{render();}catch{}throw error;}
}
async function restart(seed:number){
 if(busy)return;stop();setBusy(true);const source=world,ticket=++operation;el('feedback').textContent='新しい土地を探しています。';
 try{await paintFeedback();const {createNewArchitectureWorld:createNewWorld}=await import('./story/new-world.js');const candidate=await createNewWorld(seed);if(ticket!==operation||world!==source)return;adopt(candidate);el('feedback').textContent='新しい文明が生まれました。';}
 catch{if(ticket===operation)el('feedback').textContent='新しい文明を作れませんでした。現在の歴史はそのままです。';}
 finally{if(ticket===operation){setBusy(false);render();}}
}
el('enable-irrigation').addEventListener('click',async()=>{
 if(busy||world.mode!=='generated')return;stop();setBusy(true);const source=world,ticket=++operation;el('feedback').textContent='水路の記録を準備しています。';try{await paintFeedback();const candidate=enableWorldIrrigation(source);if(ticket!==operation||world!==source)return;adopt(candidate,true);el('feedback').textContent='これまでの風景を保ち、これからの水路を記録します。「この歴史を保存」で変更を残せます。';}catch{if(ticket===operation)el('feedback').textContent='水路の記録を始められませんでした。現在の歴史と保存はそのままです。';}finally{if(ticket===operation){setBusy(false);render();}}
});
el('enable-economic').addEventListener('click',async()=>{
 if(busy||world.mode!=='generated'||state.pending)return;stop();setBusy(true);const source=world,ticket=++operation;el('feedback').textContent='水路と暮らしの記録を準備しています。';
 try{await paintFeedback();const candidate=await enableWorldEconomicCoupling(source);if(ticket!==operation||world!==source)return;adopt(candidate,true);el('feedback').textContent='これからの収穫と維持の負担に、水路の状態を反映します。過去の歴史は変わりません。「この歴史を保存」で変更を残せます。';}
 catch{if(ticket===operation)el('feedback').textContent='水路を暮らしに反映できませんでした。現在の歴史と保存はそのままです。';}
 finally{if(ticket===operation){setBusy(false);render();}}
});
el('enable-terrain').addEventListener('click',async()=>{
 if(busy||world.mode!=='generated'||world.review.format!=='irrigation-economic-production-world-v1'||state.pending||lastObservedYear(state)>=10000)return;stop();setBusy(true);const source=world,ticket=++operation;el('feedback').textContent='丘陵の整地の記録を準備しています。';
 try{await paintFeedback();const candidate=await enableWorldTerrainDevelopment(source);if(ticket!==operation||world!==source)return;adopt(candidate,true);el('feedback').textContent='過去の地形と暮らしを保ち、これからの丘陵に整地を反映します。「この歴史を保存」で変更を残せます。';}
 catch{if(ticket===operation)el('feedback').textContent='丘陵の整地を始められませんでした。現在の歴史と保存はそのままです。';}
 finally{if(ticket===operation){setBusy(false);render();}}
});
el('slow-climate').addEventListener('click',()=>{
 if(busy||world.mode!=='generated'||!world.review.environment)return;stop();adopt(slowWorldClimate(world),true);el('feedback').textContent='これからの気候をゆったりした巡りにしました。過去の歴史と景観はそのままです。「この歴史を保存」で設定を残せます。';
});
el('improve-environment').addEventListener('click',()=>{
 if(busy||world.mode!=='generated'||!world.review.environment)return;stop();adopt(improveWorldEnvironment(world),true);el('feedback').textContent='環境の景観を詳しくしました。歴史と建物はそのままです。「この歴史を保存」で景観設定を残せます。';
});
el('improve-growth').addEventListener('click',()=>{
 if(busy||world.mode!=='generated')return;stop();adopt(improveWorldGrowth(world));el('feedback').textContent='今後の建設では橋の対岸にも広がります。過去の建物は移動しません。「この歴史を保存」で変更を保存できます。';
});
el('restart').addEventListener('click',()=>void restart(Number(input.value)||1));
el('random').addEventListener('click',()=>{if(!busy)void restart(randomSeed());});
function download(json:string){const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`namonaki-${state.seed}-${state.year}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
el('save').addEventListener('click',async()=>{
 if(busy)return;stop();setBusy(true);const source=world,ticket=++operation;el('feedback').textContent='歴史を保存しています。';
 try{await paintFeedback();const packet=await prepareWorldSessionSave(source);if(ticket!==operation||world!==source)return;
  const result=await storeWorldSave({setItem:(key,value)=>{if(ticket!==operation||world!==source)throw Error('Stale save');localStorage.setItem(key,value);}},packet);if(ticket!==operation||world!==source)return;
  if(result.status==='saved'){
   try{for(const key of higherPriorityWorldSaveKeys(packet)){if(ticket!==operation||world!==source)throw Error('Stale save');localStorage.removeItem(key);}el('feedback').textContent='この文明の歴史をブラウザに保存しました。';}
   catch{el('feedback').textContent='記録は書き込めましたが、優先する保存を切り替えられませんでした。現在の歴史は保持しています。JSONを書き出して保存できます。';}
  }else el('feedback').textContent='ブラウザに保存できませんでした。現在の歴史と以前の保存は保持しています。JSONを書き出して保存できます。';
 }catch{if(ticket===operation)el('feedback').textContent='保存できませんでした。現在の歴史と以前の保存はそのままです。';}
 finally{if(ticket===operation){setBusy(false);render();}}
});
el('load').addEventListener('click',async()=>{
 if(busy)return;stop();setBusy(true);const source=world,ticket=++operation;el('feedback').textContent='歴史を開いています。';
 try{await paintFeedback();const saved=await findWorldSave(key=>localStorage.getItem(key));if(ticket!==operation||world!==source)return;if(!saved){el('feedback').textContent='保存された記録がありません。';return;}
  const candidate=restoreWorldSession(saved);adopt(candidate);el('feedback').textContent='保存された歴史を開きました。';
 }catch(error){if(ticket===operation)el('feedback').textContent=unopenableNote(error)??'この保存データを読み込めませんでした。現在の歴史と保存値はそのままです。';}
 finally{if(ticket===operation){setBusy(false);render();}}
});
el('export').addEventListener('click',async()=>{
 if(busy)return;stop();setBusy(true);const source=world,ticket=++operation;
 try{await paintFeedback();const packet=await prepareWorldSessionSave(source);if(ticket!==operation||world!==source)return;download(serializeWorldSave(packet));el('feedback').textContent='歴史のJSONを書き出しました。';}
 catch{if(ticket===operation)el('feedback').textContent='歴史を書き出せませんでした。現在の歴史はそのままです。';}finally{if(ticket===operation){setBusy(false);render();}}
});
const file=el('import-file') as HTMLInputElement;
el('import').addEventListener('click',()=>{if(!busy)file.click();});
file.addEventListener('change',async()=>{
 const selected=file.files?.[0];if(!selected||busy)return;stop();setBusy(true);const source=world,ticket=++operation;
 el('feedback').textContent='記録ファイルを開いています。';
 try{await paintFeedback();if(selected.size>16*1024*1024)throw Error('File too large');const candidate=restoreWorldSession(await decodeWorldSave(await selected.text()));if(ticket!==operation||world!==source)return;adopt(candidate);el('feedback').textContent='記録ファイルを開きました。';}
 catch(error){if(ticket===operation)el('feedback').textContent=unopenableNote(error)??'この記録ファイルを開けませんでした。現在の歴史と保存値はそのままです。';}
 finally{if(ticket===operation){file.value='';setBusy(false);render();}}
});
input.value=String(state.seed);render();
}
const bootControls=['scene-motion','step','play','save','load','export','import','restart','random','improve-growth','improve-environment','slow-climate','enable-irrigation','enable-economic','enable-terrain'];
let bootBusy=false;
function startWorld(world:WorldSession){
 verifyWorldCandidate(world);
 for(const id of bootControls){(el(id) as HTMLButtonElement).disabled=false;el(id).onclick=null;}
 (el('import-file') as HTMLInputElement).onchange=null;mount(world);
}
async function boot(){
 if(bootBusy)return;bootBusy=true;
 for(const id of bootControls)(el(id) as HTMLButtonElement).disabled=true;
 el('feedback').textContent='文明の記録を準備しています。';
 try{
  await paintFeedback();const saved=await findWorldSave(key=>localStorage.getItem(key));
  const world=saved?restoreWorldSession(saved):await (await import('./story/new-world.js')).createNewArchitectureWorld(randomSeed());
  startWorld(world);el('feedback').textContent=saved?'保存された歴史を開きました。':'';
 }catch(error){
  el('feedback').textContent=unopenableNote(error)??'記録を準備できませんでした。保存値は保持しています。記録ファイルを開くか、新しい文明を作れます。';
  const recovery=['load','restart','random','import'];for(const id of recovery)(el(id) as HTMLButtonElement).disabled=false;
  el('load').onclick=()=>void boot();
  const recover=async(make:()=>Promise<WorldSession>)=>{
   if(bootBusy)return;bootBusy=true;for(const id of recovery)(el(id) as HTMLButtonElement).disabled=true;
   try{await paintFeedback();startWorld(await make());el('feedback').textContent='文明の記録を開きました。';}
   catch{el('feedback').textContent='文明を開けませんでした。保存値は保持しています。';for(const id of recovery)(el(id) as HTMLButtonElement).disabled=false;}
   finally{bootBusy=false;}
  };
  const fresh=(seed:number)=>recover(async()=>(await import('./story/new-world.js')).createNewArchitectureWorld(seed));
  el('restart').onclick=()=>void fresh(Number((el('seed') as HTMLInputElement).value)||randomSeed());el('random').onclick=()=>void fresh(randomSeed());
  const file=el('import-file') as HTMLInputElement;el('import').onclick=()=>file.click();file.onchange=()=>{const f=file.files?.[0];if(!f)return;void recover(async()=>{if(f.size>16*1024*1024)throw Error('File too large');return restoreWorldSession(await decodeWorldSave(await f.text()));});file.value='';};
 }finally{bootBusy=false;}
}
await boot();
