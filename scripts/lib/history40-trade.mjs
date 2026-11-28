/**
 * Issue #40 D3b: an independent re-check of the trade episodes against what they cite (review audit and tests).
 *
 * Written apart from story/episode-trade-d3b-review: it reads the chronicle and the economy captured each year
 * (InteractionCaptureInternal: each route's trade and blockage, each district's coverage and shortage years) and checks
 * every transition's claim. Returns the list of problems (empty when all hold).
 */
const PLACES=['川辺','丘陵','入り江'],P='(川辺|丘陵|入り江)';
const CLOSURE=new RegExp(`^${P}と${P}を結ぶ往来が途絶える$`),AGREEMENT=new RegExp(`^${P}と${P}が交易路を共同で維持する$`),PAUSE=new RegExp(`^${P}と${P}の共同管理が休止する$`),STORAGE=new RegExp(`^${P}で共同備蓄が根づく$`);
export const TRADE_RECHECK={recent:20,stable:20,failure:15,convert:20,abandon:50,coverage:.9,recovery:5};

export function recheckTradeEpisodes(state,captures,routes){
 const C=TRADE_RECHECK,problems=[],fail=(t,m)=>problems.push(`${t.id} ${t.kind}${t.reason?':'+t.reason:''}@${t.year}: ${m}`);
 const records=new Map(state.history.map(r=>[r.id,r])),byYear=new Map(captures.map(c=>[c.year,c]));
 const routeOf=(re,title)=>{const m=re.exec(title);if(!m)return -1;const a=PLACES.indexOf(m[1]),b=PLACES.indexOf(m[2]);return routes.findIndex(l=>l.from===a&&l.to===b);};
 const traded=(j,y)=>(byYear.get(y)?.traded[j]??0)>0,isBlocked=(j,y)=>byYear.get(y)?.routes[j]?.blocked===true;
 const tradedIn=(j,from,to)=>{for(let y=Math.max(1,from);y<=to;y++)if(traded(j,y))return true;return false;};
 const district=(y,i)=>byYear.get(y)?.economy.districts[i];
 const ends=e=>[...new Set([...e.routes].flatMap(j=>[routes[j].from,routes[j].to]))];
 const episodes=new Map();
 for(const t of state.episodes?.transitions??[]){
  if(t.episodeKind!=='trade')continue;
  const cited=t.evidence.filter(x=>x.type==='record').map(x=>records.get(x.id));
  const sameYear=(re,check,rs=cited)=>{if(!rs.length)fail(t,'no record');const js=[];for(const r of rs){const j=r?routeOf(re,r.title):-1;if(!r||r.year!==t.year||j<0)fail(t,'cites no record of that kind in its year');else{js.push(j);check?.(j);}}return js;};
  if(t.kind==='started'){
   const r=cited[0],kind=r&&CLOSURE.test(r.title)?'closure':r&&PAUSE.test(r.title)?'lapse':r&&AGREEMENT.test(r.title)?'agreement':null;
   if(!kind){fail(t,'starts from neither a closure, a pause nor an agreement');continue;}
   const js=sameYear(kind==='closure'?CLOSURE:kind==='lapse'?PAUSE:AGREEMENT,j=>{if(kind==='closure'&&!tradedIn(j,t.year-C.recent+1,t.year))fail(t,`route ${j} had no trade in 20 years`);});
   const e={routes:new Set(js),phase:null,since:t.year,response:null,responseYear:kind==='agreement'?t.year-1:t.year,failed:null};
   e.phase=kind==='agreement'?'trading':[...e.routes].some(j=>isBlocked(j,t.year))?'closed':'open';
   episodes.set(t.episodeId,e);continue;
  }
  const e=episodes.get(t.episodeId);
  const other=()=>e.response&&e.response.kind!=='joint-upkeep';
  switch(t.reason){
   case 'route-closed':for(const j of sameYear(CLOSURE,j=>{if(!e.routes.has(j)&&!tradedIn(j,t.year-C.recent+1,t.year))fail(t,`route ${j} is neither concerned nor traded in 20 years`);}))e.routes.add(j);e.phase='closed';e.since=t.year;break;
   case 'upkeep-lapsed':
    if(t.kind==='response-failed'){
     // cites the pause, then the record of the upkeep it ends
     const js=sameYear(PAUSE,undefined,cited.slice(0,1));
     if(e.response?.kind!=='joint-upkeep'||!js.includes(e.response.route)||cited[1]?.id!==e.response.record)fail(t,'not the pause of the running joint upkeep');
     e.response=null;e.failed=t.year;e.responseYear=t.year;
    }else for(const j of sameYear(PAUSE))e.routes.add(j);
    e.phase=[...e.routes].some(j=>isBlocked(j,t.year))?'closed':'open';e.since=t.year;break;
   case 'route-reopened':if(e.phase!=='closed'||[...e.routes].some(j=>isBlocked(j,t.year)))fail(t,'not closed before, or still blocked');e.phase='open';e.since=t.year;break;
   case 'trade-resumed':if(e.phase!=='open'||![...e.routes].every(j=>tradedIn(j,e.since,t.year)))fail(t,'a route concerned has not traded since it reopened');e.phase='trading';e.since=t.year;break;
   case 'relation-stable':
    if(e.phase!=='trading'||t.year-e.since<C.stable)fail(t,'resolved before 20 years of trade');
    if(![...e.routes].every(j=>tradedIn(j,t.year-C.recent+1,t.year)&&!isBlocked(j,t.year)))fail(t,'a route concerned did not trade in the last 20 years');
    break;
   case 'supply-still-short':
    if(!other()||t.year-e.response.year<C.failure)fail(t,'failed before 15 years of another means');
    if(!ends(e).some(i=>district(t.year,i)?.shortageYears>=C.failure))fail(t,'no district 15 years in shortage');
    e.response=null;e.failed=t.year;e.responseYear=t.year;break;
   case 'supply-converted':
    if(!other())fail(t,'no other means running');
    if([...e.routes].some(j=>tradedIn(j,t.year-C.convert+1,t.year)))fail(t,'a route concerned traded in the last 20 years');
    for(const i of ends(e))for(let y=t.year-C.recovery+1;y<=t.year;y++)if(!(district(y,i)?.coverage>=C.coverage))fail(t,`coverage of district ${i} in ${y} is ${district(y,i)?.coverage}`);
    break;
   case 'no-response-after-failure':if(e.failed===null||t.year-e.failed<C.abandon||e.response||e.phase==='trading')fail(t,'abandoned before 50 years after a failure, or while trading');break;
   default:{
    if(t.kind!=='response-started'&&t.kind!=='response-changed')return fail(t,'unknown transition'),problems;
    const kind=t.kind==='response-changed'?t.reason.replace(/^to-/,''):t.reason,r=cited[0];let route=null;
    if(!r||r.year<=e.responseYear||r.year>t.year)fail(t,'the response record is not new');
    else if(kind==='joint-upkeep'){route=routeOf(AGREEMENT,r.title);if(!e.routes.has(route))fail(t,'not an agreement on a route concerned');}
    else if(kind==='alternative-route'){route=routeOf(AGREEMENT,r.title);const ds=ends(e);if(route<0||e.routes.has(route)||![routes[route].from,routes[route].to].some(i=>ds.includes(i)))fail(t,'not an agreement on another route touching a district concerned');}
    else if(kind==='local-storage'){const m=STORAGE.exec(r.title);if(!m||!ends(e).includes(PLACES.indexOf(m[1])))fail(t,'not a granary practice in a district concerned');}
    else fail(t,'unknown response '+kind);
    e.response={kind,year:t.year,route,record:r?.id};e.responseYear=t.year;
   }
  }
 }
 return problems;
}
