import {lastObservedYear,ensureMemory,legacyNames} from './story/engine.js';
import {findWorldSave,storeWorldSave,decodeWorldSave} from './story/world-storage.js';
import {restoreWorldSession,saveWorldSession,improveWorldGrowth,advanceWorldSession,chooseWorldSession,observeWorldSession,drawWorldSession,type WorldSession} from './story/world-session.js';
import {serializeWorldSave} from './story/world-save.js';
import type {RecordEntry} from './story/engine.js';
import {siteAt} from './story/settlement-history.js';
import {practiceNames} from './story/society.js';
const el=(id:string)=>document.getElementById(id)!;
function verifyWorldCandidate(candidate:WorldSession){for(let i=0;i<3;i++){const s=drawWorldSession(document.createElement('canvas'),candidate,lastObservedYear(candidate.state),i);if(!Number.isFinite(s.population)||s.population<0||s.local&&(!Number.isFinite(s.local.population)||s.local.population<0)||s.objects.some(o=>typeof o.id!=='string'||!['house','hall','bridge','field','ruin','memorial','market','workshop','granary'].includes(o.kind)||![o.x,o.y,o.builtYear].every(Number.isSafeInteger)||o.x<0||o.x>320||o.y<0||o.y>180||o.builtYear<0||o.builtYear>s.year||!['intact','damaged','ruined'].includes(o.condition)))throw Error('Invalid observed world');}}
function mount(initial:WorldSession){
const input=el('seed') as HTMLInputElement;
const scrubber=el('rewind-year') as HTMLInputElement;
const siteSelect=el('site-select') as HTMLSelectElement;
const canvas=el('scene') as HTMLCanvasElement;
const slot=el('choice');
const speedInput=el('speed') as HTMLSelectElement;
const autoChoiceInput=el('auto-choice') as HTMLInputElement;
const autoDelayInput=el('auto-delay') as HTMLSelectElement;
const autoStatus=el('auto-choice-status');
const speedDelays:Record<string,number>={slow:2100,normal:850,fast:250,rapid:75};
let world=initial;
let state=world.state;
let busy=false;
let active:RecordEntry=state.history[0]!;
let timer:ReturnType<typeof setInterval>|null=null;
let expanded=false;
let choiceTimeout:ReturnType<typeof setTimeout>|null=null;
let choiceDeadline=0;
let choiceId:string|null=null;
function clearChoiceTimer(){if(choiceTimeout!==null){clearTimeout(choiceTimeout);choiceTimeout=null;}choiceId=null;choiceDeadline=0;autoStatus.textContent='';}
function resolvePending(index:number|'random'){
 if(busy||!state.pending)return;
 clearChoiceTimer();
 world=chooseWorldSession(world,index);state=world.state;
 viewedYear=null;render();
}
function scheduleChoice(){
 if(!state.pending||!autoChoiceInput.checked||timer===null||viewedYear!==null){clearChoiceTimer();return;}
 if(choiceTimeout!==null&&choiceId===state.pending.id)return;
 clearChoiceTimer();choiceId=state.pending.id;
 const delay=Number(autoDelayInput.value)*1000;
 choiceDeadline=Date.now()+delay;
 autoStatus.textContent=`${delay/1000}秒後にランダム選択`;
 choiceTimeout=setTimeout(()=>{
  choiceTimeout=null;
  if(state.pending?.id===choiceId&&autoChoiceInput.checked&&timer!==null&&viewedYear===null)resolvePending('random');
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
 const scene=drawWorldSession(canvas,world,y,siteIndex);
 const site=siteAt(state.observation?.sites,siteIndex,y);
 el('scene-place').hidden=!site;
 if(site&&scene.local){
  const population=`${format(scene.local.population)}人`;
  const affiliation=site.communityId==='founding-community'?'共同の寄り合い':'独自の寄り合い';
  el('site-residents').textContent=site.inhabited?`${population} · ${affiliation}`:population;
  el('site-practices').textContent=site.practices.map(p=>`${practiceNames[p.kind]}${p.active?'':'（途絶）'}`).join(' · ');
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
 if(state.pending){el('question').textContent=state.pending.question;el('context').textContent=state.pending.context;el('options').replaceChildren();state.pending.options.forEach((o,i)=>{const b=document.createElement('button');b.className='option';const strong=document.createElement('strong');strong.textContent=o.label;const small=document.createElement('span');small.textContent=o.description;b.append(strong,small);b.onclick=()=>resolvePending(i);el('options').append(b);});}
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
 for(const e of [...records].reverse()){const li=document.createElement('li');li.tabIndex=0;li.classList.toggle('active',viewingPast&&active.id===e.id);const time=document.createElement('time');time.textContent=`世界暦 ${format(e.year)}年  ·  ${e.tag}`;li.append(time,document.createTextNode(e.title));li.title='この年代の情景を見る';li.onclick=()=>inspect(e.year,e);li.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();inspect(e.year,e);}};ol.append(li);}
 el('toggle-all').textContent=expanded?'最近の5件だけ見る −':`過去の記録をすべて見る ＋（${confirmedRecords.length}件）`;
}
function forward(){if(busy)return;if(viewedYear!==null){viewedYear=null;render();return;}if(state.pending){render();scheduleChoice();return;}world=advanceWorldSession(world);state=world.state;render();scheduleChoice();}
siteSelect.addEventListener('change',render);
el('step').addEventListener('click',forward);
speedInput.addEventListener('change',()=>{if(timer!==null)start();});
autoChoiceInput.addEventListener('change',()=>{if(autoChoiceInput.checked)scheduleChoice();else clearChoiceTimer();});
autoDelayInput.addEventListener('change',()=>{clearChoiceTimer();scheduleChoice();});
el('play').addEventListener('click',()=>{if(busy)return;if(viewedYear!==null){viewedYear=null;render();return;}if(timer!==null){stop();return;}start();});
el('return-now').addEventListener('click',()=>{viewedYear=null;render();});
scrubber.addEventListener('input',()=>{stop();const y=Number(scrubber.value);viewedYear=y===state.year?null:y;active=[...state.history].reverse().find(e=>e.year<=y)??state.history[0]!;render();});
el('toggle-all').addEventListener('click',()=>{expanded=!expanded;render();});
function setBusy(value:boolean){busy=value;for(const id of ['save','load','export','import','restart','random','step','play','improve-growth'])(el(id) as HTMLButtonElement).disabled=value;}
function adopt(candidate:WorldSession){verifyWorldCandidate(candidate);world=candidate;state=world.state;viewedYear=null;expanded=false;input.value=String(state.seed);render();}
async function restart(seed:number){
 if(busy)return;stop();setBusy(true);el('feedback').textContent='新しい土地を探しています。';
 try{const {createNewWorld}=await import('./story/new-world.js');const candidate=createNewWorld(seed);adopt(candidate);el('feedback').textContent='新しい文明が生まれました。';}
 catch{el('feedback').textContent='新しい文明を作れませんでした。現在の歴史はそのままです。';}
 finally{setBusy(false);render();}
}
el('improve-growth').addEventListener('click',()=>{
 if(busy||world.mode!=='generated')return;stop();adopt(improveWorldGrowth(world));el('feedback').textContent='今後の建設では橋の対岸にも広がります。過去の建物は移動しません。「この歴史を保存」で変更を保存できます。';
});
el('restart').addEventListener('click',()=>void restart(Number(input.value)||1));
el('random').addEventListener('click',()=>void restart(Math.floor(Math.random()*4294967295)+1));
function download(json:string){const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`namonaki-${state.seed}-${state.year}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
el('save').addEventListener('click',async()=>{
 if(busy)return;stop();setBusy(true);el('feedback').textContent='歴史を保存しています。';
 try{const result=await storeWorldSave(localStorage,saveWorldSession(world));
  if(result.status==='saved')el('feedback').textContent='この文明の歴史をブラウザに保存しました。';
  else{el('feedback').textContent='ブラウザに保存できませんでした。現在の歴史と以前の保存は保持しています。JSONを書き出して保存できます。';}
 }catch{el('feedback').textContent='保存できませんでした。現在の歴史と以前の保存はそのままです。';}
 finally{setBusy(false);render();}
});
el('load').addEventListener('click',async()=>{
 if(busy)return;stop();setBusy(true);el('feedback').textContent='歴史を開いています。';
 try{const saved=await findWorldSave(key=>localStorage.getItem(key));if(!saved){el('feedback').textContent='保存された記録がありません。';return;}
  const candidate=restoreWorldSession(saved);adopt(candidate);el('feedback').textContent='保存された歴史を開きました。';
 }catch{el('feedback').textContent='この保存データを読み込めませんでした。現在の歴史と保存値はそのままです。';}
 finally{setBusy(false);render();}
});
el('export').addEventListener('click',()=>{
 if(busy)return;stop();setBusy(true);try{download(serializeWorldSave(saveWorldSession(world)));el('feedback').textContent='歴史のJSONを書き出しました。';}
 catch{el('feedback').textContent='歴史を書き出せませんでした。現在の歴史はそのままです。';}finally{setBusy(false);render();}
});
const file=el('import-file') as HTMLInputElement;
el('import').addEventListener('click',()=>{if(!busy)file.click();});
file.addEventListener('change',async()=>{
 const selected=file.files?.[0];if(!selected||busy)return;stop();setBusy(true);
 try{if(selected.size>16*1024*1024)throw Error('File too large');const candidate=restoreWorldSession(await decodeWorldSave(await selected.text()));adopt(candidate);el('feedback').textContent='記録ファイルを開きました。';}
 catch{el('feedback').textContent='この記録ファイルを開けませんでした。現在の歴史と保存値はそのままです。';}
 finally{file.value='';setBusy(false);render();}
});
input.value=String(state.seed);render();
}
const bootControls=['step','play','save','load','export','import','restart','random','improve-growth'];
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
  const saved=await findWorldSave(key=>localStorage.getItem(key));
  const world=saved?restoreWorldSession(saved):(await import('./story/new-world.js')).createNewWorld(42);
  startWorld(world);el('feedback').textContent=saved?'保存された歴史を開きました。':'';
 }catch{
  el('feedback').textContent='記録を準備できませんでした。保存値は保持しています。記録ファイルを開くか、新しい文明を作れます。';
  const recovery=['load','restart','random','import'];for(const id of recovery)(el(id) as HTMLButtonElement).disabled=false;
  el('load').onclick=()=>void boot();
  const recover=async(make:()=>Promise<WorldSession>)=>{
   if(bootBusy)return;bootBusy=true;for(const id of recovery)(el(id) as HTMLButtonElement).disabled=true;
   try{startWorld(await make());el('feedback').textContent='文明の記録を開きました。';}
   catch{el('feedback').textContent='文明を開けませんでした。保存値は保持しています。';for(const id of recovery)(el(id) as HTMLButtonElement).disabled=false;}
   finally{bootBusy=false;}
  };
  const fresh=(seed:number)=>recover(async()=>(await import('./story/new-world.js')).createNewWorld(seed));
  el('restart').onclick=()=>void fresh(Number((el('seed') as HTMLInputElement).value)||1);el('random').onclick=()=>void fresh(Math.floor(Math.random()*4294967295)+1);
  const file=el('import-file') as HTMLInputElement;el('import').onclick=()=>file.click();file.onchange=()=>{const f=file.files?.[0];if(!f)return;void recover(async()=>{if(f.size>16*1024*1024)throw Error('File too large');return restoreWorldSession(await decodeWorldSave(await f.text()));});file.value='';};
 }finally{bootBusy=false;}
}
await boot();
