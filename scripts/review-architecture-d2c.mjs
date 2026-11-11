/**
 * Issue #35 D2-c review gallery: real generated worlds drawn by the live scene, side by side with the
 * recorded birth styles painted in (facilities at D1 size, civic halls widened, housing as the H1 small
 * parts). REVIEW ONLY — the normal UI is unchanged. Everything is drawn in Chromium with built modules.
 *   npm run build && node scripts/review-architecture-d2c.mjs '[{"seed":7,"why":"baseline"}]'
 *   → artifacts/architecture35-d2c/{gallery.html,report.json}
 */
import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {extname,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const worlds=JSON.parse(process.argv[2]??'[{"seed":7,"why":"baseline"}]');
const years=JSON.parse(process.env.REVIEW_YEARS??'[0,500,2000,5000,10000]');
const types={'.js':'text/javascript','.mjs':'text/javascript'};
const server=http.createServer(async(req,res)=>{try{const p=decodeURIComponent(req.url.split('?')[0]);const body=p==='/'?'<!doctype html><title>d2c</title>':await readFile(join(root,p));res.writeHead(200,{'content-type':types[extname(p)]??'text/html'});res.end(body);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,r));
const launch=async()=>{try{return await chromium.launch();}catch{return chromium.launch({executablePath:'/opt/pw-browsers/chromium'});}};
const browser=await launch(),page=await browser.newPage();
await page.goto(`http://localhost:${server.address().port}/`);
const started=Date.now(),results=[];
for(const w of worlds){
 results.push(await page.evaluate(async({seed,why,years})=>{
  const {createNewTerrainWorld}=await import('/dist/story/new-world.js');
  const P=await import('/dist/architecture/production-v1.js');
  const {observeTerrainProductionScene}=await import('/dist/scene/terrain-production-scene-v1.js');
  const {drawGeneratedSceneReview}=await import('/dist/scene/draw-generated-review.js');
  const {createArchitecturePainter}=await import('/dist/architecture/scene-v1.js');
  let world=P.introduceArchitectureProduction((await createNewTerrainWorld(seed)).review);
  world=await P.advanceArchitectureWorld(world,10000,'automatic');
  const painter=createArchitecturePainter(world.architecture.births),reached=world.terrain.review.state.year;
  const siteIds=['river-bank','hill-side','coast-inlet'];
  // D2-c': a third image outlines the air space of births that needed a fallback (amber: stage 2-4, red: stage 5)
  const draw=(year,site,arch,marks=false)=>{const c=document.createElement('canvas');c.width=320;c.height=180;const o=observeTerrainProductionScene(world.terrain,year,site);
   drawGeneratedSceneReview(c,o,undefined,undefined,arch?painter:undefined);
   if(marks){const x=c.getContext('2d'),mirror=o.ground.terrain.sites[o.ground.site].render.mirrorX;
    for(const b of world.architecture.births){if(b.ref.siteId!==siteIds[site]||b.source.year>year||!(b.envelopeStage>1))continue;
     const e=b.envelope,x0=mirror?320-e.x1:e.x0,w=e.x1-e.x0,h=Math.max(1,e.y1-e.y0);x.fillStyle=b.envelopeStage===5?'#d23c2c':'#e08a1e';
     x.fillRect(x0,e.y0,w,1);x.fillRect(x0,e.y0+h-1,w,1);x.fillRect(x0,e.y0,1,h);x.fillRect(x0+w-1,e.y0,1,h);}}
   return c.toDataURL();};
  const frames=[];
  for(const year of years.filter(y=>y<=reached))for(const site of [0,1,2])frames.push({year,site,live:draw(year,site,false),arch:draw(year,site,true),marked:draw(year,site,true,true)});
  const fallbacks=world.architecture.births.filter(b=>b.envelopeStage>1).map(b=>({site:b.ref.siteId,id:b.ref.kind==='facility'?b.ref.id:b.ref.blockId,use:b.use,year:b.source.year,stage:b.envelopeStage,
   changes:b.substitutions.filter(x=>x.reason==='envelope').map(x=>x.axis+' '+x.from+'→'+x.to)}));
  const t=world.architecture.traditions.map(x=>({site:x.siteId,...x.choices}));
  const b=world.architecture.births;
  return {seed,why,reached,frames,fallbacks,traditions:t,shared:world.architecture.grammar.shared,
   counts:{births:b.length,civic:b.filter(x=>x.ref.kind==='facility'&&x.ref.civic).length,expanded:b.filter(x=>x.source.kind==='expanded').length}};
 },{...w,years}));
 console.error('seed',w.seed,'done',Math.round((Date.now()-started)/1000)+'s');
}
// miniature catalogue: every roof family at the three part sizes, two roof materials
const catalogue=await page.evaluate(async()=>{
 const {drawMiniature}=await import('/dist/architecture/miniature-v1.js');
 const fams=['R01','R02','R03','R04','R05','R06','R08'],mats=[['shingle','P01','plank'],['tile','P02','earth']];
 const c=document.createElement('canvas');c.width=16*fams.length*2+8;c.height=3*16+8;const x=c.getContext('2d');
 x.fillStyle='#c9cdb8';x.fillRect(0,0,c.width,c.height);x.fillStyle='#9a9a70';for(const r of [0,1,2])x.fillRect(0,r*16+16,c.width,2);
 const g={rect:(a,b,w,h,col)=>{x.fillStyle=col;x.fillRect(a,b,w,h);}};
 mats.forEach(([roofMaterial,palette,wall],m)=>fams.forEach((roofFamily,i)=>['far','middle','near'].forEach((depth,r)=>{
  const structure=wall==='earth'?'S03':'S02',spec={use:'house',roofFamily,roofMaterial:roofMaterial==='tile'||roofFamily!=='R05'?roofMaterial:'tile',palette,wall,structure,foundation:'F2'};
  drawMiniature(g,spec,8+(m*fams.length+i)*16,r*16+16,depth);})));
 return {png:c.toDataURL(),columns:mats.flatMap(([m])=>fams.map(f=>f+'/'+m)),rows:['far','middle','near']};
});
await browser.close();server.close();

const out=join(root,'artifacts/architecture35-d2c');await mkdir(out,{recursive:true});
const siteJa=['川辺','丘陵','入り江'],esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const img=(src,k=2)=>`<img src="${src}" width="${320*k}" height="${180*k}" style="image-rendering:pixelated" alt="">`;
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>D2-c 実世界比較</title>
<style>body{margin:0;padding:16px;background:#eceae0;color:#2e3328;font:14px/1.6 system-ui,sans-serif}h2{margin:32px 0 6px}h3{margin:16px 0 4px;font-size:14px}
.pair{display:flex;gap:10px;flex-wrap:wrap}.pair figure{margin:0}figcaption{font-size:12px;color:#5d6657}.scroll{overflow-x:auto}table{border-collapse:collapse;font-size:12px}td,th{border:1px solid #cfccbd;padding:2px 6px}</style>
<h1>Issue #35 D2-c 実世界比較（REVIEW ONLY）</h1><p>左＝今の本番の描画、右＝記録された建設時様式（施設はD1の大きさ、共同建築は敷地の幅、住宅はH1の小さい版）。どちらも本番の描画コードで、同じ世界・同じ年・同じ地区。画像は2倍表示。</p>
<h2>住宅の小さい版（H1）の一覧</h2><p>行：奥／中／手前。列：${catalogue.columns.map(esc).join('、')}</p><div class="scroll"><img src="${catalogue.png}" style="image-rendering:pixelated;width:${(16*14+8)*4}px" alt=""></div>
${results.map(r=>`<h2>seed ${r.seed}｜${esc(r.why)}</h2><p>到達年 ${r.reached}／記録 ${r.counts.births}件（共同建築 ${r.counts.civic}、増築 ${r.counts.expanded}）／世界共通：屋根 ${r.shared.roofFamily}・軒 ${r.shared.eaves}・勾配 ${r.shared.pitch}</p>
<table><tr><th>地区</th><th>構造</th><th>壁</th><th>基礎</th><th>屋根材</th><th>窓</th><th>入口</th><th>配色</th></tr>${r.traditions.map(t=>`<tr><td>${esc(t.site)}</td><td>${t.structure}</td><td>${t.wall}</td><td>${t.foundation}</td><td>${t.roofMaterial}</td><td>${t.window}</td><td>${t.entrance}</td><td>${t.palette}</td></tr>`).join('')}</table>
${r.fallbacks.length?`<p>上空に収まらず形を小さくした建物：${r.fallbacks.length}件</p><table><tr><th>地区</th><th>建物</th><th>用途</th><th>建設年</th><th>段階</th><th>変えたもの</th></tr>${r.fallbacks.map(f=>`<tr><td>${esc(f.site)}</td><td>${esc(f.id)}</td><td>${f.use}</td><td>${f.year}</td><td>${f.stage}</td><td>${esc(f.changes.join('、'))}</td></tr>`).join('')}</table>`:'<p>形を小さくした建物はない。</p>'}
${r.frames.map(f=>`<h3>${f.year}年・${siteJa[f.site]}</h3><div class="pair"><figure>${img(f.live)}<figcaption>今の本番</figcaption></figure><figure>${img(f.arch)}<figcaption>建築文化</figcaption></figure><figure>${img(f.marked)}<figcaption>代替した建物の上空の範囲（橙：段階2〜4、赤：段階5）</figcaption></figure></div>`).join('')}`).join('')}`;
await writeFile(join(out,'gallery.html'),html);
await writeFile(join(out,'report.json'),JSON.stringify({status:'D2C_REVIEW_NOT_ACCEPTANCE',sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',
 worlds:results.map(({frames,...r})=>({...r,frames:frames.length})),seconds:Math.round((Date.now()-started)/1000)},null,2));
console.log(JSON.stringify({worlds:results.length,frames:results.reduce((a,r)=>a+r.frames.length,0),bytes:Buffer.byteLength(html)}));
