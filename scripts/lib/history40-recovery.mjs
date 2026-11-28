/**
 * Issue #40 D3c: an independent re-check of the disaster-recovery episodes against the chronicle (review audit, tests).
 *
 * Written apart from story/episode-recovery-d3c-review: it reads only the chronicle. From each object's own records
 * (damage, repair, abandonment or ruin, reuse; `buildingId` names the object) it checks every transition's claim, and
 * that nothing is missed: every damage a disaster caused is cited by exactly one recovery episode, and every later
 * record of a damaged object concerned (its repair, or its abandonment and then its restoration) is cited before the
 * episode ends. Returns the list of problems (empty when all hold).
 */
const DISASTERS=new Set(['flood','earthquake','fire','storm']);
const KIND={'building-damaged':'damage','housing-damaged':'damage','building-abandoned':'abandon','housing-ruined':'abandon','building-repaired':'repair','housing-repaired':'repair','building-reused':'reuse'};

export function recheckRecoveryEpisodes(state){
 const problems=[],fail=(t,m)=>problems.push(`${t.id} ${t.kind}${t.reason?':'+t.reason:''}@${t.year}: ${m}`);
 const records=new Map(state.history.map(r=>[r.id,r])),horizon=state.episodes?.committedThrough??state.year;
 const objectOf=r=>r.kind&&r.buildingId?r.kind.split('-')[0]+':'+r.buildingId:null;
 const isDisasterDamage=r=>KIND[r.kind]==='damage'&&(r.relatedIds??[]).some(id=>{const d=records.get(id);return d&&d.year===r.year&&DISASTERS.has(d.kind);});
 // each object's records of the four kinds, in order
 const seq=new Map();for(const r of state.history){const o=objectOf(r);if(o&&KIND[r.kind])(seq.get(o)??seq.set(o,[]).get(o)).push(r);}
 /** What must follow a damage record: its repair; or its abandonment and then the restoration of the ruin. */
 function after(d){
  const rs=seq.get(objectOf(d)),i=rs.indexOf(d),a=rs[i+1];if(!a)return [];
  if(KIND[a.kind]==='repair')return [a];
  if(KIND[a.kind]!=='abandon')return [];
  const b=rs[i+2];return b&&(KIND[b.kind]==='reuse'||b.kind==='housing-repaired')?[a,b]:[a];
 }
 const cites=new Map(),episodes=new Map();
 for(const t of state.episodes?.transitions??[]){
  if(t.episodeKind!=='recovery')continue;
  const cited=t.evidence.filter(x=>x.type==='record').map(x=>records.get(x.id));
  if(cited.some(r=>!r||r.year>t.year)){fail(t,'cites an unknown or later record');continue;}
  let e=episodes.get(t.episodeId);
  const damages=()=>{
   const ds=cited.filter(r=>KIND[r.kind]==='damage'),hs=cited.filter(r=>DISASTERS.has(r.kind));
   if(!ds.length||ds.length+hs.length!==cited.length)fail(t,'cites records other than damage and disasters');
   for(const d of ds){
    if(!isDisasterDamage(d)||!(d.relatedIds??[]).some(id=>hs.some(h=>h.id===id)))fail(t,`damage ${d.id} does not cite a disaster it names`);
    const o=objectOf(d),s=e.objects.get(o);if(s&&s.status!=='restored')fail(t,`object ${o} is already ${s.status}`);
    e.objects.set(o,{status:'damaged',damage:d.id,expected:after(d)});
    cites.set(d.id,(cites.get(d.id)??0)+1);
   }
  };
  if(t.kind==='started'){
   e={objects:new Map(),running:null,ended:null};episodes.set(t.episodeId,e);
   if(cited.some(r=>r.year!==t.year))fail(t,'starts from records of another year');
   damages();continue;
  }
  if(!e){fail(t,'no episode');continue;}
  // records restoring or abandoning an object are cited with the damage they follow
  const acted=cited.filter(r=>KIND[r.kind]&&KIND[r.kind]!=='damage'),cause=cited.filter(r=>KIND[r.kind]==='damage');
  const take=(kind,ok)=>{
   if(!acted.length||cause.length!==acted.length)fail(t,'each record is not cited with the damage it follows');
   for(const r of acted){const o=objectOf(r),s=e.objects.get(o);
    if(KIND[r.kind]!==kind&&!(kind==='repair'&&r.kind==='housing-repaired'))fail(t,`${r.id} is not a ${kind} record`);
    if(!s||!ok(s,r))fail(t,`${r.id} does not follow the state of ${o} (${s?.status})`);
    else{if(!cause.some(d=>d.id===s.damage))fail(t,`the damage of ${o} is not cited`);if(!s.expected.includes(r))fail(t,`${r.id} is not the next record of ${o}`);
     s.status=KIND[r.kind]==='abandon'?'ruined':'restored';s.cited=(s.cited??0)+1;}
    cites.set(r.id,(cites.get(r.id)??0)+1);}
  };
  const status=()=>[...e.objects.values()].map(o=>o.status);
  switch(t.reason){
   case 'further-damage':damages();break;
   case 'object-abandoned':
    if(t.kind==='response-failed'?!e.running:e.running)fail(t,'a failure needs a running response, a reassessment none');
    take('abandon',s=>s.status==='damaged');if(t.kind==='response-failed')e.running=null;break;
   case 'object-repaired':case 'object-reused':{const k=t.reason==='object-repaired'?'repair':'reuse';if(e.running!==k)fail(t,'not the running response');take(k,(s,r)=>k==='repair'?s.status==='damaged'||s.status==='ruined'&&r.kind==='housing-repaired':s.status==='ruined');break;}
   case 'repair':case 'reuse':case 'to-repair':case 'to-reuse':{const k=t.reason.replace(/^to-/,'');
    if(t.kind==='response-changed'?!e.running||e.running===k:e.running)fail(t,'response bookkeeping');
    take(k,(s,r)=>k==='repair'?s.status==='damaged'||s.status==='ruined'&&r.kind==='housing-repaired':s.status==='ruined');e.running=k;break;}
   case 'restored':if(!status().every(x=>x==='restored'))fail(t,'not every object is restored');e.ended=t.year;break;
   case 'left-in-ruin':if(status().includes('damaged')||!status().includes('ruined'))fail(t,'an object is still damaged, or none is in ruin');e.ended=t.year;break;
   default:fail(t,'unknown transition');
  }
 }
 // nothing missed: every disaster damage is cited once; every record that follows a damage concerned, before the end
 for(const r of state.history)if(r.year<=horizon&&isDisasterDamage(r)&&cites.get(r.id)!==1)problems.push(`damage ${r.id}@${r.year} is cited ${cites.get(r.id)??0} times`);
 const pending=new Set();for(const a of Object.values(state.episodes?.active??{}))if(a.kind==='recovery')for(const id of a.state.pending??[])pending.add(id);
 for(const [id,e] of episodes)for(const [o,s] of e.objects)for(const r of s.expected){
  const before=e.ended===null?r.year<=horizon:r.year<e.ended;
  if(before&&cites.get(r.id)!==1&&!(e.ended===null&&pending.has(r.id)))problems.push(`${id}: ${r.id}@${r.year} (${r.kind} of ${o}) is not cited`);
 }
 return problems;
}
