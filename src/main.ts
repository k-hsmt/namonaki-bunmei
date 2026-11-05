import {advance,choose,chooseAutomatically,lastObservedYear,ensureMemory,legacyNames} from './story/engine.js';
import {createHousingCivilization,findSavedHousing,parseHousingSave,serializeHousingSave,CURRENT_SAVE_KEY} from './story/housing-persistence.js';
import type {RecordEntry} from './story/engine.js';
import {snapshotAt} from './scene/model.js';
import {siteAt} from './story/settlement-history.js';
import {practiceNames} from './story/society.js';
import {drawScene} from './scene/draw.js';
const el=(id:string)=>document.getElementById(id)!;
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
let state=createHousingCivilization(42);
let active:RecordEntry=state.history[0]!;
let timer:ReturnType<typeof setInterval>|null=null;
let expanded=false;
let choiceTimeout:ReturnType<typeof setTimeout>|null=null;
let choiceDeadline=0;
let choiceId:string|null=null;
function clearChoiceTimer(){if(choiceTimeout!==null){clearTimeout(choiceTimeout);choiceTimeout=null;}choiceId=null;choiceDeadline=0;autoStatus.textContent='';}
function resolvePending(index:number|'random'){
 if(!state.pending)return;
 clearChoiceTimer();
 if(index==='random')chooseAutomatically(state);else choose(state,index);
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
const STORAGE=CURRENT_SAVE_KEY;
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
 const scene=snapshotAt(state,y,siteIndex);
 const site=siteAt(state.observation?.sites,siteIndex,y);
 el('scene-place').hidden=!site;
 if(site&&scene.local){
  const population=`${format(scene.local.population)}人`;
  const affiliation=site.communityId==='founding-community'?'共同の寄り合い':'独自の寄り合い';
  el('site-residents').textContent=site.inhabited?`${population} · ${affiliation}`:population;
  el('site-practices').textContent=site.practices.map(p=>`${practiceNames[p.kind]}${p.active?'':'（途絶）'}`).join(' · ');
 }
 drawScene(canvas,scene,state.seed);
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
 el('step').toggleAttribute('disabled',Boolean(state.pending)&&!viewingPast);
 el('play').toggleAttribute('disabled',false);
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
function forward(){if(viewedYear!==null){viewedYear=null;render();return;}if(state.pending){render();scheduleChoice();return;}const start=state.history.length;let passes=0;while(passes<36&&!state.pending){advance(state,1);passes++;if(state.history.length>start)break;}render();scheduleChoice();}
siteSelect.addEventListener('change',render);
el('step').addEventListener('click',forward);
speedInput.addEventListener('change',()=>{if(timer!==null)start();});
autoChoiceInput.addEventListener('change',()=>{if(autoChoiceInput.checked)scheduleChoice();else clearChoiceTimer();});
autoDelayInput.addEventListener('change',()=>{clearChoiceTimer();scheduleChoice();});
el('play').addEventListener('click',()=>{if(viewedYear!==null){viewedYear=null;render();return;}if(timer!==null){stop();return;}start();});
el('return-now').addEventListener('click',()=>{viewedYear=null;render();});
scrubber.addEventListener('input',()=>{stop();const y=Number(scrubber.value);viewedYear=y===state.year?null:y;active=[...state.history].reverse().find(e=>e.year<=y)??state.history[0]!;render();});
el('toggle-all').addEventListener('click',()=>{expanded=!expanded;render();});
function restart(seed:number){stop();state=createHousingCivilization(seed);viewedYear=null;expanded=false;input.value=String(seed);render();}
el('restart').addEventListener('click',()=>restart(Number(input.value)||1));
el('random').addEventListener('click',()=>restart(Math.floor(Math.random()*4294967295)+1));
el('save').addEventListener('click',()=>{
 try{
  // 先に候補全体を検証する。失敗した場合、既存の保存値を変更しない。
  const serialized=serializeHousingSave(state);
  localStorage.setItem(STORAGE,serialized);
  el('feedback').textContent='この文明の歴史をブラウザに保存しました。';
 }catch{
  el('feedback').textContent='保存できませんでした。ブラウザの設定をご確認ください。';
 }
});
el('load').addEventListener('click',()=>{
 try{
  const saved=findSavedHousing(key=>localStorage.getItem(key));
  if(!saved){el('feedback').textContent='保存された記録がありません。';return;}
  // 候補だけを移行・検証し、成功するまで表示中の文明を変更しない。
  const loaded=parseHousingSave(saved.raw);
  ensureMemory(loaded);
  snapshotAt(loaded,lastObservedYear(loaded));
  stop();
  state=loaded;
  viewedYear=null;input.value=String(state.seed);expanded=false;
  render();
  el('feedback').textContent='保存された歴史を開きました。';
 }catch{
  // 現行キーの破損を旧キーへ黙ってフォールバックしない。
  el('feedback').textContent='この保存データを読み込めませんでした。';
 }
});
render();
