/**
 * Issue #35 D4-b review gallery: rebuilding and culture-specific ruins in real worlds (REVIEW ONLY).
 *  - the life of a building: standing, ruined (in its own style), rebuilt (old / current / mixed)
 *  - the same ruin drawn as before (v8 live drawing) and in its own style (architecture-ruin-v1)
 *  - each district at 1000 / 3000 / 6000 / 10000 years
 *   npm run build && node scripts/review-architecture-d4.mjs '[{"seed":88,"why":"..."}]'
 *   → artifacts/architecture35-d4b/{gallery.html,report.json}
 */
import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {extname,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const worlds=JSON.parse(process.argv[2]??'[{"seed":88,"why":"高度な建物が多い世界"}]');
const types={'.js':'text/javascript','.mjs':'text/javascript'};
const server=http.createServer(async(req,res)=>{try{const p=decodeURIComponent(req.url.split('?')[0]);const body=p==='/'?'<!doctype html><title>d4b</title>':await readFile(join(root,p));res.writeHead(200,{'content-type':types[extname(p)]??'text/html'});res.end(body);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,r));
const launch=async()=>{try{return await chromium.launch();}catch{return chromium.launch({executablePath:'/opt/pw-browsers/chromium'});}};
const browser=await launch(),page=await browser.newPage();
await page.goto(`http://localhost:${server.address().port}/`);
const started=Date.now(),results=[];
for(const w of worlds){
 results.push(await page.evaluate(async({seed,why})=>{
  const {createNewArchitectureWorld}=await import('/dist/story/new-world.js');
  const P=await import('/dist/architecture/production-v1.js');
  const {observeTerrainProductionScene}=await import('/dist/scene/terrain-production-scene-v1.js');
  const {drawGeneratedSceneReview}=await import('/dist/scene/draw-generated-review.js');
  const {createArchitecturePainter}=await import('/dist/architecture/scene-v1.js');
  const world=await P.advanceArchitectureWorld((await createNewArchitectureWorld(seed)).architecture,10000,'automatic');
  const a=world.architecture,births=a.births,painter=createArchitecturePainter(births),history=world.terrain.review.state.history,records=new Map(history.map(h=>[h.id,h]));
  const siteIds=['river-bank','hill-side','coast-inlet'];
  const draw=(year,site,arch=true)=>{const c=document.createElement('canvas');c.width=320;c.height=180;drawGeneratedSceneReview(c,observeTerrainProductionScene(world.terrain,year,site),undefined,undefined,arch?painter:undefined);return c.toDataURL();};
  const modeOf=b=>b.adjustments.find(x=>/^rebuild:(old|current|mixed)$/.test(x))?.slice(8);
  // buildings whose rebuilt generation looks different: prefer advanced technology, then current/mixed
  const rebuilt=births.filter(b=>b.rebuild&&b.ref.kind==='facility');
  const prevOf=b=>births.filter(x=>x.ref.kind==='facility'&&x.ref.id===b.ref.id&&x.source.year<b.source.year).at(-1);
  const differs=b=>JSON.stringify(prevOf(b)?.features)!==JSON.stringify(b.features);
  const pick=[...rebuilt.filter(b=>/^X/.test(b.features.structure)&&differs(b)).slice(0,2),...rebuilt.filter(b=>!/^X/.test(b.features.structure)&&modeOf(b)!=='old'&&differs(b)).slice(0,2),...rebuilt.filter(b=>modeOf(b)==='old').slice(0,1)];
  const lives=pick.map(b=>{
   const si=siteIds.indexOf(b.ref.siteId),ruin=records.get(b.rebuild.ruinRecordId),prev=prevOf(b);
   const frames=[{year:ruin.year-1,label:'廃墟になる前（前の世代）',img:draw(ruin.year-1,si)},{year:b.source.year-1,label:'廃墟（前の世代の様式）',img:draw(b.source.year-1,si)},
    {year:b.source.year-1,label:'同じ廃墟の、これまでの描き方',img:draw(b.source.year-1,si,false)},{year:b.source.year,label:'建て直し（'+modeOf(b)+'）',img:draw(b.source.year,si)}];
   return {site:b.ref.siteId,id:b.ref.id,use:b.use,generation:b.rebuild.generation,mode:modeOf(b),changedAxes:b.rebuild.changedAxes,
    before:prev?.features,after:b.features,adjustments:b.adjustments.filter(x=>x.startsWith('rebuild:')||x.startsWith('technology:')),frames};
  });
  const streets=[];for(const site of [0,1,2])for(const year of [1000,3000,6000,10000])streets.push({site,year,img:draw(year,site)});
  const counts={rebuilds:births.filter(b=>b.rebuild).length,modes:births.filter(b=>b.rebuild).reduce((m,b)=>{const k=modeOf(b);m[k]=(m[k]??0)+1;return m;},{}),
   advanced:births.filter(b=>/^X/.test(b.features.structure)).map(b=>({site:b.ref.siteId,use:b.use,year:b.source.year,structure:b.features.structure}))};
  return {seed,why,lives,streets,counts};
 },w));
 console.error('seed',w.seed,'done',Math.round((Date.now()-started)/1000)+'s');
}
await browser.close();server.close();

const out=join(root,'artifacts/architecture35-d4b');await mkdir(out,{recursive:true});
const siteJa={'river-bank':'川辺','hill-side':'丘陵','coast-inlet':'入り江'},siteByIndex=['川辺','丘陵','入り江'];
const modeJa={old:'古い様式',current:'その時の様式',mixed:'混合'};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const axes=['structure','wall','foundation','roofMaterial','roofFamily','pitch','window','entrance','palette'];
const html=`<title>建て直しと廃墟レビュー</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* layout: one reading column; a building's life as a row of frames, then the district streets as a grid */
:root{--bg:#e9eae3;--surface:#f6f6f1;--fg:#262b24;--muted:#5b6356;--line:#cdd0c3;--changed:#d5e3f6;
 --font-body:"Noto Sans JP",system-ui,sans-serif;--font-data:"IBM Plex Mono",ui-monospace,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1b1e1a;--surface:#242822;--fg:#e4e6dc;--muted:#a3aa9c;--line:#3c4238;--changed:#25374f;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#1b1e1a;--surface:#242822;--fg:#e4e6dc;--muted:#a3aa9c;--line:#3c4238;--changed:#25374f;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:15px/1.7 var(--font-body);padding-block:24px 48px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
main{max-width:1320px;margin:0 auto;display:grid;gap:28px}
h1{font-size:1.6rem;line-height:1.3;margin:0;text-wrap:balance}h2{font-size:1.25rem;margin:0;text-wrap:balance}h3{font-size:1.05rem;margin:0;text-wrap:balance}
p{margin:0;max-width:72ch}.lead,.note{color:var(--muted)}.note{font-size:12px}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:16px;display:grid;gap:12px;min-width:0}
.life{display:grid;gap:8px;border-top:1px solid var(--line);padding-top:14px;min-width:0}
.scroll{overflow-x:auto;max-width:100%}
table{border-collapse:collapse;font:12px/1.5 var(--font-data);font-variant-numeric:tabular-nums}td,th{border:1px solid var(--line);padding:3px 7px;text-align:left;white-space:nowrap}
td.diff{background:var(--changed)}
.frames{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px}
figure{margin:0;display:grid;gap:4px;min-width:0}figure img{width:100%;height:auto;image-rendering:pixelated;border:1px solid var(--line)}figcaption{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600&family=IBM+Plex+Mono:wght@400;600&display=swap">
<main>
<header class="panel"><h1>Issue #35 D4-b 建て直しと廃墟（REVIEW ONLY）</h1>
<p class="lead">本番の描画コードで描いた実際の世界（各1万年、自動の選択）。廃墟は、その時に建っていた世代の様式のまま、屋根と上の壁が崩れた姿で描く。比べるために、同じ廃墟のこれまでの描き方（文化によらない廃墟の形）も並べた。建て直しの確率・重みは仮の値。</p></header>
${results.map(r=>`<section class="panel"><h2>seed ${r.seed}｜${esc(r.why)}</h2>
<p>建て直し ${r.counts.rebuilds}件（${Object.entries(r.counts.modes).map(([k,v])=>`${modeJa[k]} ${v}`).join('・')}）／高度な建物 ${r.counts.advanced.length}棟${r.counts.advanced.length?`（${r.counts.advanced.slice(0,8).map(x=>`${siteJa[x.site]} ${x.year}年 ${x.use} ${x.structure}`).join('、')}${r.counts.advanced.length>8?' ほか':''}）`:''}</p>
${r.lives.map(l=>`<div class="life"><h3>${siteJa[l.site]}の${esc(l.use)}（${esc(l.id)}）：第${l.generation}世代、${modeJa[l.mode]}、前の世代から伝統が変わった軸 ${l.changedAxes}</h3>
<div class="scroll"><table><tr><th></th>${axes.map(a=>`<th>${a}</th>`).join('')}</tr><tr><th>前の世代</th>${axes.map(a=>`<td>${esc(l.before?.[a]??'')}</td>`).join('')}</tr><tr><th>建て直し</th>${axes.map(a=>`<td${l.before?.[a]!==l.after[a]?' class="diff"':''}>${esc(l.after[a])}</td>`).join('')}</tr></table></div>
<p class="note">${esc(l.adjustments.join('、'))}</p>
<div class="frames">${l.frames.map(f=>`<figure><img src="${f.img}" width="640" height="360" alt="${siteJa[l.site]} ${f.year}年"><figcaption>${f.year}年｜${f.label}</figcaption></figure>`).join('')}</div></div>`).join('')}
<div class="life"><h3>地区の街並み（1000・3000・6000・10000年）</h3><div class="frames">${r.streets.map(s=>`<figure><img src="${s.img}" width="640" height="360" alt="${siteByIndex[s.site]} ${s.year}年"><figcaption>${siteByIndex[s.site]}・${s.year}年</figcaption></figure>`).join('')}</div></div>
</section>`).join('')}
</main>`;
await writeFile(join(out,'gallery.html'),html);
await writeFile(join(out,'report.json'),JSON.stringify({status:'D4B_REVIEW_NOT_ACCEPTANCE',sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',
 worlds:results.map(r=>({seed:r.seed,why:r.why,counts:r.counts,lives:r.lives.map(({frames,...l})=>({...l,frames:frames.map(f=>({year:f.year,label:f.label}))}))})),seconds:Math.round((Date.now()-started)/1000)},null,2));
console.log(JSON.stringify({worlds:results.length,bytes:Buffer.byteLength(html)}));
