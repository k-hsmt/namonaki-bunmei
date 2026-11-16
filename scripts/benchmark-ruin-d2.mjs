/**
 * Issue #37 D2: time of the live scene drawing (drawWorldSession) on real worlds' ruined districts.
 * Run it on two builds to compare (for example the main branch in another worktree and this one):
 *
 *   npm run build && node scripts/benchmark-ruin-d2.mjs [repository root, default this one]
 *
 * For each world, the years with the most ruined buildings in a district, drawn twice (the second draw shows the
 * steady cost); reports the mean of the second draws. Env: RUIN_D2_WORLDS='[6,1,3,18]', RUIN_D2_END (default 3000).
 */
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=resolve(process.argv[2]??join(dirname(fileURLToPath(import.meta.url)),'..'));
const seeds=JSON.parse(process.env.RUIN_D2_WORLDS??'[6,1,3,18]'),END=Number(process.env.RUIN_D2_END??3000);
const server=http.createServer(async(req,res)=>{try{const p=decodeURIComponent(req.url.split('?')[0]);const body=p==='/'?'<!doctype html><meta charset="utf-8"><title>bench</title>':await readFile(join(root,p));res.writeHead(200,{'content-type':extname(p)==='.js'?'text/javascript':'text/html'});res.end(body);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,r));
const browser=await chromium.launch().catch(()=>chromium.launch({executablePath:'/opt/pw-browsers/chromium'})),page=await browser.newPage();page.setDefaultTimeout(1800000);
await page.goto(`http://localhost:${server.address().port}/`);
const out=[];
try{
 for(const seed of seeds)out.push(await page.evaluate(async({seed,END})=>{
  const {createNewArchitectureWorld}=await import('/dist/story/new-world.js'),{advanceArchitectureWorld}=await import('/dist/architecture/production-v1.js'),S=await import('/dist/story/world-session.js');
  const session=S.architectureProductionSession(await advanceArchitectureWorld((await createNewArchitectureWorld(seed)).architecture,END,'automatic'));
  // years and sites with the most ruined buildings (from the snapshot, the same in both builds)
  const picks=[];for(let y=100;y<=END;y+=100)for(let si=0;si<3;si++){const s=S.observeWorldSession(session,y,si);picks.push({y,si,ruins:s.objects.filter(o=>o.condition==='ruined').length});}
  picks.sort((a,b)=>b.ruins-a.ruins||a.y-b.y||a.si-b.si);
  const chosen=picks.slice(0,6),c=document.createElement('canvas');c.width=320;c.height=180;const first=[],second=[];
  for(const p of chosen){let t=performance.now();S.drawWorldSession(c,session,p.y,p.si);first.push(performance.now()-t);t=performance.now();S.drawWorldSession(c,session,p.y,p.si);second.push(performance.now()-t);}
  const mean=l=>Math.round(l.reduce((s,v)=>s+v,0)/l.length*10)/10;
  return {seed,frames:chosen.map(p=>[p.y,p.si,p.ruins]),firstMs:mean(first),secondMs:mean(second)};
 },{seed,END}));
}finally{await browser.close();server.close();}
console.log(JSON.stringify({type:'issue37-d2-benchmark',root,results:out}));
