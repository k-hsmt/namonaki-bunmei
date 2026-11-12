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
function stop(){clearChoiceTimer();if(timer!==null){clearInterval(timer);timer=null;}el('play').textContent='自動で見守る ▷';}
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
function label(v:number,good:string,bad:string){return v>=55?good:v>=30?'揺らいでいる':bad;}
function inspect(year:number,record?:RecordEntry){stop();viewedYear=year;active=record??[...state.history].reverse().find(e=>e.year<=year)??state.history[0]!;render();document.querySelector('.paper')!.scrollIntoView({behavior:'smooth',block:'start'});}
function render(){
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
 const historicalStats=viewingPast||awaitingChoice||estimating;
 const siteIndex=Number(siteSelect.value);
 const scene=motion.show(world,y,siteIndex);
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
 el('past-note').textContent=`世界暦 ${format(y)}年の風景を観測中 · 現在は${format(state.year)}年`;
 document.querySelector('.paper')!.classList.toggle('past-view',viewingPast);
 scrubber.max=String(confirmedYear);scrubber.value=String(y);
 el('rewind-label').textContent=`${format(y)}年 / 現在 ${format(state.year)}年`;
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
 el('population').textContent=`約 ${format(scene.population)} 人${awaitingChoice?`（${format(y)}年の観測）`:viewingPast?'（当時）':''}`;
 el('food').textContent=historicalStats?'観測年の記録なし':label(state.food,'比較的豊か','不足している');
 el('cohesion').textContent=historicalStats?'観測年の記録なし':label(state.cohesion,'比較的安定','分かれつつある');
 el('knowledge').textContent=historicalStats?'観測年の記録なし':label(state.knowledge,'蓄積されている','伝承の途中');
 const records=expanded?confirmedRecords:confirmedRecords.slice(-5);const ol=el('timeline');ol.replaceChildren();
 // D4-c: v9 rebuild lines follow the v8 record they rebuilt at (newest first, so they come just above it)
 const rebuilds=new Map<string,string[]>();for(const n of worldArchitectureChronicle(world))rebuilds.set(n.afterRecordId,[...(rebuilds.get(n.afterRecordId)??[]),n.title]);
 for(const e of [...records].reverse()){
  for(const title of rebuilds.get(e.id)??[]){const li=document.createElement('li');li.tabIndex=0;li.className='architecture-note';const time=document.createElement('time');time.textContent=`世界暦 ${format(e.year)}年  ·  建築`;li.append(time,document.createTextNode(title));li.title='この年代の情景を見る';li.onclick=()=>inspect(e.year,e);li.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();inspect(e.year,e);}};ol.append(li);}
  const li=document.createElement('li');li.tabIndex=0;li.classList.toggle('active',viewingPast&&active.id===e.id);const time=document.createElement('time');time.textContent=`世界暦 ${format(e.year)}年  ·  ${e.tag}`;li.append(time,document.createTextNode(e.title));li.title='この年代の情景を見る';li.onclick=()=>inspect(e.year,e);li.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();inspect(e.year,e);}};ol.append(li);}
 el('toggle-all').textContent=expanded?'最近の5件だけ見る −':`過去の記録をすべて見る ＋（${confirmedRecords.length}件）`;
}
async function forward(){
 if(busy)return;if(viewedYear!==null){viewedYear=null;render();return;}if(state.pending){render();scheduleChoice();return;}
 if(world.mode==='generated'&&world.review.format==='terrain-production-world-v1'&&lastObservedYear(state)>=10000){stop();render();return;}
 const source=world,ticket=++operation;setBusy(true);
 try{if(source.mode==='generated'&&source.review.format==='terrain-production-world-v1')await paintFeedback();const candidate=await advanceWorldSessionAsync(source);if(ticket!==operation||world!==source)return;adopt(candidate,true,true);}
 catch{if(ticket===operation&&world===source){stop();el('feedback').textContent='時を進められませんでした。現在の歴史は保持しています。';}}
 finally{if(ticket===operation){setBusy(false);render();scheduleChoice();}}
}
siteSelect.addEventListener('change',render);
el('step').addEventListener('click',forward);
speedInput.addEventListener('change',()=>{if(timer!==null)start();});
autoChoiceInput.addEventListener('change',()=>{if(autoChoiceInput.checked)scheduleChoice();else clearChoiceTimer();});
autoDelayInput.addEventListener('change',()=>{clearChoiceTimer();scheduleChoice();});
el('play').addEventListener('click',()=>{if(busy)return;if(viewedYear!==null){viewedYear=null;render();return;}if(timer!==null){stop();return;}start();});
el('return-now').addEventListener('click',()=>{viewedYear=null;render();});
scrubber.addEventListener('input',()=>{stop();const y=Number(scrubber.value);viewedYear=y===state.year?null:y;active=[...state.history].reverse().find(e=>e.year<=y)??state.history[0]!;render();});
el('toggle-all').addEventListener('click',()=>{expanded=!expanded;render();});
function setBusy(value:boolean){busy=value;document.querySelectorAll<HTMLButtonElement>('#options button').forEach(b=>b.disabled=value);for(const id of ['save','load','export','import','restart','random','step','play','improve-growth','improve-environment','slow-climate','enable-irrigation','enable-economic','enable-terrain'])(el(id) as HTMLButtonElement).disabled=value;}
function adopt(candidate:WorldSession,keepObservation=false,keepArchive=false){
 verifyWorldCandidate(candidate);const previous={world,state,viewedYear,expanded,active,input:input.value};
 try{world=candidate;state=world.state;viewedYear=keepObservation?previous.viewedYear:null;expanded=keepArchive?previous.expanded:false;active=keepObservation?(state.history.find(r=>r.id===previous.active.id)??state.history[0]!):state.history[0]!;input.value=String(state.seed);render();}
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
