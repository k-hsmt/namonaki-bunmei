/**
 * Issue #40 D3a: an independent re-check of the food episodes against what they cite (review audit and tests).
 *
 * Written apart from story/episode-food-d3a-review: it reads the chronicle, the decisions and the economy captured each
 * year (InteractionCaptureInternal.economy: that year's coverage and shortage years per district) and checks every
 * transition's claim. Returns the list of problems (empty when all hold).
 */
const SHORTAGE=/^(川辺|丘陵|入り江)の食糧不足が続く$/,RELOCATION=/へ住まいを移す人々$/,STORAGE=/^(川辺|丘陵|入り江)で共同備蓄が根づく$/,AGREEMENT=/^(川辺|丘陵|入り江)と(川辺|丘陵|入り江)が交易路を共同で維持する$/;
const PLACES=['川辺','丘陵','入り江'];
export const FOOD_RECHECK={coverage:.9,recovery:5,stable:20,failure:15,abandon:50};

export function recheckFoodEpisodes(state,captures){
 const C=FOOD_RECHECK,problems=[],fail=(t,m)=>problems.push(`${t.id} ${t.kind}${t.reason?':'+t.reason:''}@${t.year}: ${m}`);
 const records=new Map(state.history.map(r=>[r.id,r])),byYear=new Map(captures.map(c=>[c.year,c.economy.districts]));
 const cov=(y,i)=>byYear.get(y)?.[i]?.coverage,short=(y,i)=>byYear.get(y)?.[i]?.shortageYears;
 const episodes=new Map();
 for(const t of state.episodes?.transitions??[]){
  if(t.episodeKind!=='food')continue;
  if(t.kind==='started')episodes.set(t.episodeId,{districts:new Set(),shortages:new Set(),phase:null,responseYear:t.year,response:null,failed:null});
  const e=episodes.get(t.episodeId),cited=t.evidence.filter(x=>x.type==='record').map(x=>records.get(x.id));
  const concerned=()=>e.districts.size?[...e.districts]:[0,1,2];
  const takeShortages=()=>{for(const r of cited){if(!r||r.year!==t.year)return fail(t,'cites a record not of its year');
   const m=SHORTAGE.exec(r.title);if(m){e.districts.add(PLACES.indexOf(m[1]));e.shortages.add(r.id);}else if(r.kind!=='famine')fail(t,'cites neither a shortage nor a famine: '+r.title);}
   if(!cited.length)fail(t,'no record');};
  if(t.kind==='started'){takeShortages();e.phase={kind:'short',year:t.year};continue;}
  switch(t.reason){
   case 'shortage-spread':case 'famine':takeShortages();if(e.phase.kind==='recovering')e.phase={kind:'short',year:t.year};break;
   case 'supply-recovering':
    for(const i of concerned())for(let y=t.year-C.recovery+1;y<=t.year;y++)if(!(cov(y,i)>=C.coverage))fail(t,`coverage of district ${i} in ${y} is ${cov(y,i)}`);
    e.phase={kind:'recovering',year:t.year};break;
   case 'supply-relapsed':
    if(e.phase.kind!=='recovering')fail(t,'relapse without recovery');
    if(!concerned().some(i=>cov(t.year,i)<C.coverage))fail(t,'no district under the coverage');
    e.phase={kind:'short',year:t.year};break;
   case 'supply-stable':
    if(e.phase.kind!=='recovering'||t.year-e.phase.year<C.stable)fail(t,'resolved before 20 years of recovery');
    for(const i of concerned())for(let y=e.phase.year-C.recovery+1;y<=t.year;y++)if(!(cov(y,i)>=C.coverage))fail(t,`coverage of district ${i} in ${y} is ${cov(y,i)}`);
    break;
   case 'shortage-persisted':
    if(!e.response||t.year-e.response.year<C.failure)fail(t,'failed before 15 years of response');
    if(!concerned().some(i=>short(t.year,i)>=C.failure))fail(t,'no district 15 years in shortage');
    e.failed=t.year;e.responseYear=t.year;e.response=null;break;
   case 'no-response-after-failure':
    if(e.failed===null||t.year-e.failed<C.abandon||e.response)fail(t,'abandoned before 50 years after a failure');
    if(!concerned().some(i=>short(t.year,i)>0))fail(t,'abandoned while no district is short');
    break;
   default:{// responses
    if(t.kind!=='response-started'&&t.kind!=='response-changed')return fail(t,'unknown transition'),problems;
    const kind=t.kind==='response-changed'?t.reason.replace(/^to-/,''):t.reason,r=cited[0];
    if(!r||r.year<=e.responseYear||r.year>t.year)fail(t,'the response record is not new');
    else if(kind.startsWith('decision:')){
     const d=state.decisions.find(d=>d.year===r.year&&d.templateId==='scarce-stores');
     if(r.tag!=='選択'||!d||'decision:'+d.actionId!==kind||!r.relatedIds?.some(id=>e.shortages.has(id)))fail(t,'not this episode\'s scarce-stores choice');
    }else if(kind==='relocation'){if(!RELOCATION.test(r.title)||!r.relatedIds?.some(id=>e.shortages.has(id)))fail(t,'not a move citing this shortage');}
    else if(kind==='communal-storage'){const m=STORAGE.exec(r.title);if(!m||!concerned().includes(PLACES.indexOf(m[1])))fail(t,'not a granary practice in a district concerned');}
    else if(kind==='trade-supplement'){const m=AGREEMENT.exec(r.title);if(!m||![m[1],m[2]].some(p=>concerned().includes(PLACES.indexOf(p))))fail(t,'not an agreement touching a district concerned');}
    else fail(t,'unknown response '+kind);
    e.response={kind,year:t.year};e.responseYear=t.year;
   }
  }
 }
 return problems;
}
