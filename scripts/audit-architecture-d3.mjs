/**
 * Issue #35 D3-d calibration audit (design §3.4): many worlds, 10000 years each, automatic choices.
 * Counts tradition changes (D3-b) and capability events (D3-c) on the RECORD and, separately, what
 * buildings actually built show (Human decision A on D3-c). Rates are not changed here.
 *   npm run build
 *   node scripts/audit-architecture-d3.mjs run 1 25 > part1.jsonl      (one line per world)
 *   node scripts/audit-architecture-d3.mjs summary part*.jsonl > summary.json
 */
import {readFile} from 'node:fs/promises';

const AXES=['structure','wall','foundation','roofMaterial','window','entrance','palette','roofFamily','eaves','pitch','ornaments'];
const CHECKPOINTS=[500,1000,2000,5000,10000];
const YEARS=Number(process.env.AUDIT_YEARS??10000);
const SITES=['river-bank','hill-side','coast-inlet'];

async function run(from,to){
 const {createNewTerrainWorld}=await import('../dist/story/new-world.js');
 const P=await import('../dist/architecture/production-v1.js');
 const C=await import('../dist/architecture/change-v1.js');
 const flat=t=>Object.fromEntries(AXES.map(a=>[a,a in t.choices?String(t.choices[a]):a==='ornaments'?[...t.shared.ornaments].sort().join('+'):String(t.shared[a])]));
 for(let seed=from;seed<=to;seed++){
  const started=Date.now();
  const w=await P.advanceArchitectureWorld(P.introduceArchitectureProduction((await createNewTerrainWorld(seed)).review),YEARS,'automatic');
  const a=w.architecture,state=w.terrain.review.state,changes=a.traditionChanges;
  const sites={};
  for(const t of a.traditions){
   const site=t.siteId,at=y=>flat(C.traditionAt(a.grammar,t,changes,y)),initial=at(0);
   const diff=(x,y)=>AXES.filter(k=>x[k]!==y[k]);
   const births=a.births.filter(b=>b.ref.siteId===site);
   const lastBuilt=births.length?Math.max(...births.map(b=>b.source.year)):0;
   // visible: births built under a tradition that already differs from year 0, and on which axes
   const changedBirths=births.filter(b=>diff(at(b.source.year),initial).length>0);
   const visibleAxes=[...new Set(changedBirths.flatMap(b=>diff(at(b.source.year),initial)))];
   sites[site]={
    record:Object.fromEntries(CHECKPOINTS.filter(y=>y<=YEARS).map(y=>[y,diff(at(y),initial).length])),
    recordAxes10000:diff(at(YEARS),initial),
    births:births.length,lastBuilt,changedBirths:changedBirths.length,visibleAxes,
    visibleByCheckpoint:Object.fromEntries(CHECKPOINTS.filter(y=>y<=YEARS).map(y=>[y,[...new Set(changedBirths.filter(b=>b.source.year<=y).flatMap(b=>diff(at(b.source.year),initial)))].length])),
   };
  }
  // back-and-forth: a non-revival change to a value the district held before on that axis
  const held={};let reverts=0;
  for(const c of changes){const k=c.site+'|'+c.axis;held[k]??=new Set();if(c.cause!=='revival'&&held[k].has(c.to))reverts++;held[k].add(c.from);}
  const out={seed,years:state.year,population:state.population,ms:Date.now()-started,sites,
   changes:changes.map(c=>({y:c.year,s:c.site,a:c.axis,c:c.cause,e:c.sources.experience??null})),reverts,
   inventionsWithoutWork:changes.filter(c=>c.cause==='invention'&&!c.sources.experience).length,
   capability:a.capabilityEvents.map(e=>({y:e.year,s:e.site,t:e.technology,o:e.op})),
   advancedBirths:a.births.filter(b=>b.adjustments.some(x=>x.startsWith('technology:'))).length};
  process.stdout.write(JSON.stringify(out)+'\n');
  console.error('seed',seed,Math.round(out.ms/1000)+'s');
 }
}

async function summary(files){
 const worlds=[];for(const f of files)for(const line of (await readFile(f,'utf8')).split('\n'))if(line.trim())worlds.push(JSON.parse(line));
 worlds.sort((x,y)=>x.seed-y.seed);
 const n=worlds.length,pct=k=>Math.round(1000*k/n)/10;
 const maxSite=(w,f)=>Math.max(...SITES.map(s=>f(w.sites[s])));
 const dist=(values)=>{const d={};for(const v of values)d[v]=(d[v]??0)+1;return d;};
 const byCheckpoint=Object.fromEntries(CHECKPOINTS.filter(y=>y<=YEARS).map(y=>[y,{
  record:{
   worldsAllSitesAtMost2:pct(worlds.filter(w=>SITES.every(s=>w.sites[s].record[y]<=2)).length),
   worldsSomeSiteAtLeast2:pct(worlds.filter(w=>maxSite(w,x=>x.record[y])>=2).length),
   siteAxesDistribution:dist(worlds.flatMap(w=>SITES.map(s=>w.sites[s].record[y]))),
  },
  visible:{
   worldsSomeSiteAtLeast2:pct(worlds.filter(w=>maxSite(w,x=>x.visibleByCheckpoint[y])>=2).length),
   worldsSomeSiteAtLeast1:pct(worlds.filter(w=>maxSite(w,x=>x.visibleByCheckpoint[y])>=1).length),
   siteAxesDistribution:dist(worlds.flatMap(w=>SITES.map(s=>w.sites[s].visibleByCheckpoint[y]))),
  },
 }]));
 const all=worlds.flatMap(w=>w.changes);
 const bins={};for(const c of all){const b=Math.floor((c.y-1)/1000)*1000;bins[b]=(bins[b]??0)+1;}
 const cap=worlds.flatMap(w=>w.capability);
 return {
  worlds:n,years:YEARS,seeds:[worlds[0]?.seed,worlds.at(-1)?.seed],
  populatedAtEnd:pct(worlds.filter(w=>w.population>0).length),
  lastBuilt:{min:Math.min(...worlds.map(w=>maxSite(w,x=>x.lastBuilt))),max:Math.max(...worlds.map(w=>maxSite(w,x=>x.lastBuilt))),
   median:worlds.map(w=>maxSite(w,x=>x.lastBuilt)).sort((x,y)=>x-y)[Math.floor(n/2)]},
  byCheckpoint,
  changes:{total:all.length,perWorld:Math.round(10*all.length/n)/10,byCause:dist(all.map(c=>c.c)),bySite:dist(all.map(c=>c.s)),byAxis:dist(all.map(c=>c.a)),by1000y:bins,
   reverts:worlds.reduce((k,w)=>k+w.reverts,0),inventionsWithoutWork:worlds.reduce((k,w)=>k+w.inventionsWithoutWork,0),
   changedBirths:worlds.reduce((k,w)=>k+SITES.reduce((j,s)=>j+w.sites[s].changedBirths,0),0),births:worlds.reduce((k,w)=>k+SITES.reduce((j,s)=>j+w.sites[s].births,0),0)},
  capability:{worldsWithAny:pct(worlds.filter(w=>w.capability.length).length),byOp:dist(cap.map(e=>e.o)),byTechnology:dist(cap.map(e=>e.t)),
   heldAtEnd:worlds.reduce((k,w)=>{const h=new Set();for(const e of w.capability){const key=e.s+e.t;if(e.o==='lose')h.delete(key);else h.add(key);}return k+h.size;},0),
   advancedBirths:worlds.reduce((k,w)=>k+w.advancedBirths,0)},
  msPerWorld:Math.round(worlds.reduce((k,w)=>k+w.ms,0)/n),
 };
}

const [mode,...args]=process.argv.slice(2);
if(mode==='run')await run(Number(args[0]),Number(args[1]));
else if(mode==='summary')console.log(JSON.stringify(await summary(args),null,1));
else{console.error('usage: run <from> <to> | summary <files...>');process.exit(1);}
