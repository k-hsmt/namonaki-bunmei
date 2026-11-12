/**
 * Issue #35 D5-b review gallery: towns and cities with height by scale and the layout of each district
 * (REVIEW ONLY). Each district at 2000 / 5000 / 10000 years with its layout label; buildings raised to
 * two storeys by the town's scale are outlined in blue.
 *   npm run build && node scripts/review-architecture-d5.mjs '[{"seed":11,"why":"..."}]'
 *   → artifacts/architecture35-d5b/{gallery.html,report.json}
 */
import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {extname,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const worlds=JSON.parse(process.argv[2]??'[{"seed":88,"why":"高度な建物が多い世界"}]');
const types={'.js':'text/javascript','.mjs':'text/javascript'};
const server=http.createServer(async(req,res)=>{try{const p=decodeURIComponent(req.url.split('?')[0]);const body=p==='/'?'<!doctype html><title>d5b</title>':await readFile(join(root,p));res.writeHead(200,{'content-type':types[extname(p)]??'text/html'});res.end(body);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,r));
const launch=async()=>{try{return await chromium.launch();}catch{return chromium.launch({executablePath:'/opt/pw-browsers/chromium'});}};
const browser=await launch(),page=await browser.newPage();
await page.goto(`http://localhost:${server.address().port}/`);
const started=Date.now(),results=[];
for(const w of worlds){
 results.push(await page.evaluate(async({seed,why})=>{
  const {createNewArchitectureWorld}=await import('/dist/story/new-world.js');
  const P=await import('/dist/architecture/production-v1.js');
  const S=await import('/dist/story/world-session.js');
  const {observeTerrainProductionScene}=await import('/dist/scene/terrain-production-scene-v1.js');
  const {drawGeneratedSceneReview}=await import('/dist/scene/draw-generated-review.js');
  const world=await P.advanceArchitectureWorld((await createNewArchitectureWorld(seed)).architecture,10000,'automatic');
  const session=S.architectureProductionSession(world),painter=S.worldStructurePainter(session),births=world.architecture.births;
  const siteIds=['river-bank','hill-side','coast-inlet'],scaleNames=['集落','村','町','都市'];
  const frames=[];
  for(const [si,site] of siteIds.entries())for(const year of [2000,5000,10000]){
   const c=document.createElement('canvas');c.width=320;c.height=180;const o=observeTerrainProductionScene(world.terrain,year,si);
   drawGeneratedSceneReview(c,o,undefined,undefined,painter);
   const x=c.getContext('2d'),mirror=o.ground.terrain.sites[o.ground.site].render.mirrorX;x.fillStyle='#2f6fd6';
   // the generation standing in that year, raised by the town's scale
   const standing=new Map();for(const b of births)if(b.ref.siteId===site&&b.source.year<=year){const k=b.ref.kind==='facility'?b.ref.id:b.ref.blockId+':'+b.ref.parts.from;standing.set(k,b);}
   const raised=[...standing.values()].filter(b=>b.adjustments.includes('scale:two-storeys')&&b.features.storeys>1);
   for(const b of raised){const e=b.envelope,x0=mirror?320-e.x1:e.x0,w=e.x1-e.x0,h=Math.max(1,e.y1-e.y0);x.fillRect(x0,e.y0,w,1);x.fillRect(x0,e.y0+h-1,w,1);x.fillRect(x0,e.y0,1,h);x.fillRect(x0+w-1,e.y0,1,h);}
   frames.push({site,year,scale:scaleNames[P.scaleAt(world.terrain,site,year)],label:S.worldStreetscapeAt(session,year,si),raised:raised.length,img:c.toDataURL()});
  }
  return {seed,why,frames,twoStoreys:births.filter(b=>b.adjustments.includes('scale:two-storeys')).length};
 },w));
 console.error('seed',w.seed,'done',Math.round((Date.now()-started)/1000)+'s');
}
await browser.close();server.close();
const out=join(root,'artifacts/architecture35-d5b');await mkdir(out,{recursive:true});
const siteJa={'river-bank':'川辺','hill-side':'丘陵','coast-inlet':'入り江'};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const html=`<title>街並みと高さレビュー</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* layout: one reading column; per world, a grid of district frames captioned with the layout label */
:root{--bg:#e9eae3;--surface:#f6f6f1;--fg:#262b24;--muted:#5b6356;--line:#cdd0c3;--accent:#2f6fd6;
 --font-body:"Noto Sans JP",system-ui,sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1b1e1a;--surface:#242822;--fg:#e4e6dc;--muted:#a3aa9c;--line:#3c4238;--accent:#7aa7f0;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#1b1e1a;--surface:#242822;--fg:#e4e6dc;--muted:#a3aa9c;--line:#3c4238;--accent:#7aa7f0;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:15px/1.7 var(--font-body);padding-block:24px 48px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
main{max-width:1320px;margin:0 auto;display:grid;gap:28px}
h1{font-size:1.6rem;line-height:1.3;margin:0;text-wrap:balance}h2{font-size:1.25rem;margin:0;text-wrap:balance}
p{margin:0;max-width:72ch}.lead{color:var(--muted)}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:16px;display:grid;gap:12px;min-width:0}
.frames{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:12px}
figure{margin:0;display:grid;gap:4px;min-width:0}figure img{width:100%;height:auto;image-rendering:pixelated;border:1px solid var(--line)}
figcaption{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}figcaption strong{color:var(--fg);font-weight:600}
.key{display:inline-block;width:12px;height:12px;border:2px solid var(--accent);vertical-align:-2px}
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600&display=swap">
<main>
<header class="panel"><h1>Issue #35 D5-b 街並みと高さ（REVIEW ONLY）</h1>
<p class="lead">本番の描画コードで描いた実際の世界（各1万年、自動の選択）。各画像の下に、その年の規模と、通常画面に出す街並みの説明を付けた。<span class="key"></span> 町・都市の規模で2階建てになった建物（その年に建っている世代）。2階建ての確率（町20%・都市40%）と街並みの型の閾値は仮の値。</p></header>
${results.map(r=>`<section class="panel"><h2>seed ${r.seed}｜${esc(r.why)}</h2><p>規模で2階建てになった建物：1万年で ${r.twoStoreys}件</p>
<div class="frames">${r.frames.map(f=>`<figure><img src="${f.img}" width="640" height="360" alt="${siteJa[f.site]} ${f.year}年"><figcaption>${siteJa[f.site]}・${f.year}年・${f.scale}｜<strong>街並み：${esc(f.label)}</strong>｜2階建て ${f.raised}</figcaption></figure>`).join('')}</div></section>`).join('')}
</main>`;
await writeFile(join(out,'gallery.html'),html);
await writeFile(join(out,'report.json'),JSON.stringify({status:'D5B_REVIEW_NOT_ACCEPTANCE',sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',
 worlds:results.map(r=>({seed:r.seed,why:r.why,twoStoreys:r.twoStoreys,frames:r.frames.map(({img,...f})=>f)})),seconds:Math.round((Date.now()-started)/1000)},null,2));
console.log(JSON.stringify({worlds:results.length,bytes:Buffer.byteLength(html)}));
