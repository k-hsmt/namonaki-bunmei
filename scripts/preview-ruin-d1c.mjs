/**
 * Issue #37 D1c: D1a weathering and D1b reclamation together on real worlds' confirmed ruins (PROTOTYPE, development
 * painter only). Each world is generated and advanced as the game does; the painter reads the confirmed housing events
 * and building changes of the observed year and writes nothing.
 *
 *   npm run build && node scripts/preview-ruin-d1c.mjs  →  artifacts/ruin37-d1c/{gallery.html,report.json,*.png}
 *
 * Per world: the longest facility ruin and the first housing ruin, each from just before the ruin to 300 years after
 * (until a repair or reuse), live drawing next to D1c; the four season phases of one ruin; and checks: the live
 * drawing is unchanged, the development painter with both parts off equals it, D1c redraws identically, draw timings.
 * Env: RUIN_D1C_WORLDS='[{"seed":6},…]', RUIN_D1C_END (default 3000).
 */
import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {extname,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const worlds=JSON.parse(process.env.RUIN_D1C_WORLDS??'[{"seed":6},{"seed":1},{"seed":3},{"seed":18}]');
const END=Number(process.env.RUIN_D1C_END??3000);
const types={'.js':'text/javascript','.mjs':'text/javascript'};
const server=http.createServer(async(req,res)=>{try{const p=decodeURIComponent(req.url.split('?')[0]);const body=p==='/'?'<!doctype html><meta charset="utf-8"><title>d1c</title>':await readFile(join(root,p));res.writeHead(200,{'content-type':types[extname(p)]??'text/html'});res.end(body);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,r));
const launch=async()=>{try{return await chromium.launch();}catch{return chromium.launch({executablePath:'/opt/pw-browsers/chromium'});}};
const browser=await launch(),page=await browser.newPage();page.setDefaultTimeout(1800000);
await page.goto(`http://localhost:${server.address().port}/`);
const out=join(root,'artifacts/ruin37-d1c');await mkdir(out,{recursive:true});
const results=[],started=Date.now();
try{
 for(const w of worlds){
  results.push(await page.evaluate(async({seed,END})=>{
   const {createNewArchitectureWorld}=await import('/dist/story/new-world.js');
   const {advanceArchitectureWorld}=await import('/dist/architecture/production-v1.js');
   const S=await import('/dist/story/world-session.js'),D=await import('/dist/scene/draw-generated-review.js');
   const {seasonalViewOf}=await import('/dist/season/season-presentation-v1.js');
   const {ruinDevPainter,ruinTimelines}=await import('/scripts/lib/ruin-d1c-painter.mjs');
   const session=S.architectureProductionSession(await advanceArchitectureWorld((await createNewArchitectureWorld(seed)).architecture,END,'automatic'));
   const base=S.worldStructurePainter(session),dev=ruinDevPainter(session,base),off=ruinDevPainter(session,base,{weathering:false,reclamation:false});
   const SITES=['river-bank','hill-side','coast-inlet'],T=ruinTimelines(session.state);
   const canvas=()=>{const c=document.createElement('canvas');c.width=320;c.height=180;return c;};
   const timings={live:[],d1c:[]};
   const frame=(year,si,painter=dev.painter)=>{const o=S.observeGeneratedWorldSession(session,year,si);
    let t=performance.now();const live=canvas();S.drawWorldSession(live,session,year,si);timings.live.push(performance.now()-t);
    t=performance.now();const d=canvas();D.drawGeneratedSceneReview(d,o,undefined,undefined,painter);timings.d1c.push(performance.now()-t);
    return {o,live:live.toDataURL('image/png'),d1c:d.toDataURL('image/png')};};
   // ruins: housing ruin events and facility ruin periods (not fields), with the year they end (repair, reuse) or END
   const periods=[];
   for(const [id,l] of T.facilities)for(let i=0;i<l.length;i++)if(l[i].condition==='ruined'&&l[i-1]?.condition!=='ruined')periods.push({kind:'facility',id,site:l[i].site,from:l[i].year,to:l.slice(i+1).find(c=>c.condition!=='ruined')?.year??END+1});
   for(const e of session.state.housing?.events??[])if(e.kind==='ruined'){const l=T.housing.get(e.blockId),after=l.find(c=>c.year>e.year&&c.condition!=='ruined');
    const vac=[...l].reverse().find(c=>c.year<=e.year&&c.use==='vacant'&&!l.some(x=>x.year>c.year&&x.year<=e.year&&x.use!=='vacant'));
    periods.push({kind:'housing',id:e.blockId,site:e.after.siteId,from:e.year,vacated:vac?.year??e.year,to:after?.year??END+1});}
   const pick=[...periods.filter(p=>p.kind==='facility').sort((a,b)=>(b.to-b.from)-(a.to-a.from)).slice(0,1),...periods.filter(p=>p.kind==='housing').sort((a,b)=>(b.to-b.from)-(a.to-a.from)).slice(0,1)];
   const lives=[];
   for(const p of pick){
    const si=SITES.indexOf(p.site),years=[...new Set([p.kind==='housing'?Math.max(p.vacated-1,p.from-40):p.from-1,p.kind==='housing'?Math.min(p.from-1,p.vacated+10):null,p.from,p.from+30,p.from+100,p.from+300].filter(y=>y!==null&&y>=0&&y<p.to&&y<=END))].sort((a,b)=>a-b);
    const frames=years.map(y=>{const f=frame(y,si);return {year:y,live:f.live,d1c:f.d1c,stats:dev.stats(f.o)};});
    lives.push({...p,frames});
   }
   // seasons on the facility ruin 100 years in (or the first ruin frame available)
   const sp=lives[0],sy=sp?.frames.find(f=>f.year===sp.from+100)?.year??sp?.frames.at(-1)?.year;
   const seasons=sp?[0,1,2,3].map(phase=>{const P=ruinDevPainter(session,base,{season:seasonalViewOf(phase,session.climate)});const c=canvas();D.drawGeneratedSceneReview(c,S.observeGeneratedWorldSession(session,sy,SITES.indexOf(sp.site)),undefined,undefined,P.painter);return {phase,img:c.toDataURL('image/png')};}):[];
   // checks on one frame per ruin
   const checks=lives.map(l=>{const f=l.frames.find(x=>x.year>=l.from)??l.frames[0],si=SITES.indexOf(l.site),o=S.observeGeneratedWorldSession(session,f.year,si);
    const a=canvas(),b=canvas(),c=canvas(),live=canvas();S.drawWorldSession(live,session,f.year,si);
    D.drawGeneratedSceneReview(a,o,undefined,undefined,base);D.drawGeneratedSceneReview(b,o,undefined,undefined,off.painter);
    const again=ruinDevPainter(session,base);D.drawGeneratedSceneReview(c,S.observeGeneratedWorldSession(session,f.year,si),undefined,undefined,again.painter);
    return {id:l.id,year:f.year,livePainterUnchanged:a.toDataURL()===live.toDataURL(),devOffEqualsLive:b.toDataURL()===live.toDataURL(),d1cRepeatable:c.toDataURL()===f.d1c};});
   const avg=l=>l.length?Math.round(l.reduce((s,v)=>s+v,0)/l.length*10)/10:null;
   return {seed,biome:session.climate.dominantBiome,end:END,ruins:{facility:periods.filter(p=>p.kind==='facility').length,housing:periods.filter(p=>p.kind==='housing').length},lives,season:sp?{id:sp.id,year:sy,frames:seasons}:null,checks,timingsMs:{live:avg(timings.live),d1c:avg(timings.d1c),frames:timings.live.length}};
  },{seed:w.seed,END}));
  console.error('seed',w.seed,'done',Math.round((Date.now()-started)/1000)+'s');
 }
}finally{await browser.close();server.close();}

const files=[];
const save=async(name,url)=>{const raw=Buffer.from(url.slice(url.indexOf(',')+1),'base64');await writeFile(join(out,name+'.png'),raw);files.push({name,sha256:createHash('sha256').update(raw).digest('hex')});return name;};
for(const r of results){
 for(const l of r.lives)for(const f of l.frames){f.liveName=await save(`s${r.seed}_${l.id}_${f.year}_live`,f.live);f.d1cName=await save(`s${r.seed}_${l.id}_${f.year}_d1c`,f.d1c);delete f.live;delete f.d1c;}
 if(r.season)for(const f of r.season.frames){f.name=await save(`s${r.seed}_season_${f.phase}`,f.img);delete f.img;}
}
const failed=results.flatMap(r=>r.checks.filter(c=>!c.livePainterUnchanged||!c.devOffEqualsLive||!c.d1cRepeatable).map(c=>({seed:r.seed,...c})));
const report={issue:37,stage:'D1c',status:'PROTOTYPE — development painter on real worlds; nothing saved or recorded',end:END,results,failed,files};
await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
const LABEL={desert:'砂漠',steppe:'ステップ',grassland:'草原・サバンナ',temperate_forest:'温帯林',tropical_rainforest:'熱帯雨林',boreal_forest:'亜寒帯林',tundra:'ツンドラ'};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const img=(n,w=640)=>`<img src="${n}.png" width="${w}" height="${w*180/320}" loading="lazy" alt="${esc(n)}">`;
const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Issue 37 D1c 統合比較</title>
<style>body{font:14px/1.6 system-ui,sans-serif;background:#eceee8;color:#263028;margin:0;padding:20px}main{max-width:1500px;margin:auto}img{display:block;image-rendering:pixelated}.scroll{overflow-x:auto}table{border-spacing:6px}th{font-size:12px;text-align:left;white-space:nowrap}</style>
<main><h1>Issue #37 D1c｜実際の世界の廃墟（本編／D1c）</h1><p>PROTOTYPE。各世界を${END}年まで進め、確定した廃墟を、廃墟化の直前から300年後（修繕・再利用まで）描いた。</p>
${results.map(r=>`<h2>${LABEL[r.biome]??r.biome} seed ${r.seed}</h2>${r.lives.map(l=>`<h3>${esc(l.kind)} ${esc(l.id)}（${esc(l.site)}、廃墟化${l.from}年${l.to<=END?`、${l.to}年まで`:''}）</h3><div class="scroll"><table><tr><th></th>${l.frames.map(f=>`<th>${f.year}年（${f.year-l.from>=0?'廃墟'+(f.year-l.from)+'年':'廃墟化前'}）</th>`).join('')}</tr><tr><th>本編</th>${l.frames.map(f=>`<td>${img(f.liveName)}</td>`).join('')}</tr><tr><th>D1c</th>${l.frames.map(f=>`<td>${img(f.d1cName)}</td>`).join('')}</tr></table></div>`).join('')}
${r.season?`<h3>季節（${esc(r.season.id)}、${r.season.year}年）</h3><div class="scroll"><table><tr>${r.season.frames.map(f=>`<td>${img(f.name)}<small>位相${f.phase}</small></td>`).join('')}</tr></table></div>`:''}`).join('')}
<h2>検査</h2><pre>${esc(JSON.stringify({failed,timings:results.map(r=>({seed:r.seed,...r.timingsMs}))},null,1))}</pre></main></html>`;
await writeFile(join(out,'gallery.html'),html);
console.log(JSON.stringify({type:'issue37-d1c',images:files.length,failed:failed.length,out}));
if(failed.length)process.exitCode=1;
