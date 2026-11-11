/**
 * Issue #35 D3-d review gallery: real worlds after 10000 years, drawn by the live scene with the recorded
 * birth styles. For each district: the street just before the first building of a changed tradition,
 * after the last construction, and at the end, with births of a changed tradition outlined (blue) and the
 * tradition changes listed with their causes. REVIEW ONLY — the normal UI is unchanged.
 *   npm run build && node scripts/review-architecture-d3.mjs '[{"seed":7,"why":"..."}]'
 *   → artifacts/architecture35-d3d/{gallery.html,report.json}
 */
import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {extname,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const worlds=JSON.parse(process.argv[2]??'[{"seed":7,"why":"baseline"}]');
const YEARS=Number(process.env.REVIEW_YEARS_TOTAL??10000);
const types={'.js':'text/javascript','.mjs':'text/javascript'};
const server=http.createServer(async(req,res)=>{try{const p=decodeURIComponent(req.url.split('?')[0]);const body=p==='/'?'<!doctype html><title>d3d</title>':await readFile(join(root,p));res.writeHead(200,{'content-type':types[extname(p)]??'text/html'});res.end(body);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,r));
const launch=async()=>{try{return await chromium.launch();}catch{return chromium.launch({executablePath:'/opt/pw-browsers/chromium'});}};
const browser=await launch(),page=await browser.newPage();
await page.goto(`http://localhost:${server.address().port}/`);
const started=Date.now(),results=[];
for(const w of worlds){
 results.push(await page.evaluate(async({seed,why,YEARS})=>{
  const {createNewTerrainWorld}=await import('/dist/story/new-world.js');
  const P=await import('/dist/architecture/production-v1.js');
  const C=await import('/dist/architecture/change-v1.js');
  const {observeTerrainProductionScene}=await import('/dist/scene/terrain-production-scene-v1.js');
  const {drawGeneratedSceneReview}=await import('/dist/scene/draw-generated-review.js');
  const {createArchitecturePainter}=await import('/dist/architecture/scene-v1.js');
  let world=P.introduceArchitectureProduction((await createNewTerrainWorld(seed)).review);
  world=await P.advanceArchitectureWorld(world,YEARS,'automatic');
  const a=world.architecture,painter=createArchitecturePainter(a.births),reached=world.terrain.review.state.year;
  const AXES=['structure','wall','foundation','roofMaterial','window','entrance','palette','roofFamily','eaves','pitch','ornaments'];
  const flat=t=>Object.fromEntries(AXES.map(k=>[k,k in t.choices?String(t.choices[k]):k==='ornaments'?[...t.shared.ornaments].sort().join('+'):String(t.shared[k])]));
  const siteIds=['river-bank','hill-side','coast-inlet'],sites=[];
  for(const [si,site] of siteIds.entries()){
   const t=a.traditions[si],at=y=>flat(C.traditionAt(a.grammar,t,a.traditionChanges,y)),initial=at(0);
   const changedAxes=y=>AXES.filter(k=>at(y)[k]!==initial[k]);
   const births=a.births.filter(b=>b.ref.siteId===site),changed=births.filter(b=>changedAxes(b.source.year).length);
   const lastBuilt=births.length?Math.max(...births.map(b=>b.source.year)):0;
   const draw=(year,marks)=>{const c=document.createElement('canvas');c.width=320;c.height=180;const o=observeTerrainProductionScene(world.terrain,year,si);
    drawGeneratedSceneReview(c,o,undefined,undefined,painter);
    if(marks){const x=c.getContext('2d'),mirror=o.ground.terrain.sites[o.ground.site].render.mirrorX;x.fillStyle='#2f6fd6';
     for(const b of changed){if(b.source.year>year)continue;const e=b.envelope,x0=mirror?320-e.x1:e.x0,w=e.x1-e.x0,h=Math.max(1,e.y1-e.y0);
      x.fillRect(x0,e.y0,w,1);x.fillRect(x0,e.y0+h-1,w,1);x.fillRect(x0,e.y0,1,h);x.fillRect(x0+w-1,e.y0,1,h);}}
    return c.toDataURL();};
   const frames=[];
   if(changed.length){const first=Math.min(...changed.map(b=>b.source.year));frames.push({year:first-1,label:'変わった伝統の最初の建物の前年',img:draw(first-1,false)});}
   frames.push({year:lastBuilt,label:'最後の建設の年',img:draw(lastBuilt,true)});
   if(reached!==lastBuilt)frames.push({year:reached,label:'到達年',img:draw(reached,true)});
   sites.push({site,initial,final:at(reached),births:births.length,changed:changed.length,lastBuilt,
    changedBirths:changed.map(b=>({year:b.source.year,use:b.use,axes:changedAxes(b.source.year)})),
    changes:a.traditionChanges.filter(c=>c.site===site).map(c=>({year:c.year,axis:c.axis,from:c.from,to:c.to,cause:c.cause,sources:c.sources})),
    capability:a.capabilityEvents.filter(e=>e.site===site),frames});
  }
  return {seed,why,reached,sites};
 },{...w,YEARS}));
 console.error('seed',w.seed,'done',Math.round((Date.now()-started)/1000)+'s');
}
await browser.close();server.close();

const out=join(root,'artifacts/architecture35-d3d');await mkdir(out,{recursive:true});
const siteJa={'river-bank':'川辺','hill-side':'丘陵','coast-inlet':'入り江'},causeJa={invention:'生まれる',transmission:'伝わる',revival:'戻る'};
const opJa={establish:'成立',acquire:'習得',lose:'喪失',rediscover:'再発見'};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const src=s=>s.fromSite?`${siteJa[s.fromSite]}から（交易${s.tradeYears}年・移住${s.migrations}人）`:s.revivedFrom!==undefined?`${s.revivedFrom}年まで持っていた値`:`建設・修繕${s.experience??0}件`;
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>D3-d 実世界の変遷</title>
<style>body{margin:0;padding:16px;background:#eceae0;color:#2e3328;font:14px/1.6 system-ui,sans-serif}h2{margin:32px 0 6px}h3{margin:20px 0 4px}
.row{display:flex;gap:10px;flex-wrap:wrap}figure{margin:0}figcaption{font-size:12px;color:#5d6657}.scroll{overflow-x:auto}table{border-collapse:collapse;font-size:12px;margin:4px 0}td,th{border:1px solid #cfccbd;padding:2px 6px}img{max-width:100%;height:auto}</style>
<h1>Issue #35 D3-d 実世界の変遷（REVIEW ONLY）</h1>
<p>本番の描画コードで描いた、実際の世界の地区。青い枠＝建った年の伝統が年0と違っていた建物。画像は2倍表示。確率はD3-b・D3-cの仮の値のまま。</p>
${results.map(r=>`<h2>seed ${r.seed}｜${esc(r.why)}</h2><p>到達年 ${r.reached}</p>${r.sites.map(s=>`<h3>${siteJa[s.site]}：建物 ${s.births}件のうち、変わった伝統で建ったもの ${s.changed}件／最後の建設 ${s.lastBuilt}年</h3>
<div class="scroll"><table><tr><th>軸</th>${Object.keys(s.initial).map(k=>`<th>${k}</th>`).join('')}</tr><tr><td>年0</td>${Object.values(s.initial).map(v=>`<td>${esc(v)}</td>`).join('')}</tr><tr><td>${r.reached}年</td>${Object.entries(s.final).map(([k,v])=>`<td${v!==s.initial[k]?' style="background:#d6e4f7"':''}>${esc(v)}</td>`).join('')}</tr></table></div>
${s.changes.length?`<div class="scroll"><table><tr><th>年</th><th>軸</th><th>変化</th><th>原因</th><th>出典</th></tr>${s.changes.map(c=>`<tr${c.year<s.lastBuilt?' style="font-weight:600"':''}><td>${c.year}</td><td>${c.axis}</td><td>${esc(c.from)}→${esc(c.to)}</td><td>${causeJa[c.cause]}</td><td>${esc(src(c.sources))}</td></tr>`).join('')}</table></div><p style="font-size:12px">太字＝最後の建設より前の変化（建物に現れ得る）</p>`:'<p>伝統の変化なし</p>'}
${s.capability.length?`<p>技術：${s.capability.map(e=>`${e.year}年 ${e.technology} ${opJa[e.op]}`).join('、')}</p>`:''}
${s.changedBirths.length?`<p>変わった伝統で建った建物：${s.changedBirths.map(b=>`${b.year}年 ${b.use}（${b.axes.join('・')}）`).join('、')}</p>`:''}
<div class="row">${s.frames.map(f=>`<figure><img src="${f.img}" width="640" height="360" style="image-rendering:pixelated" alt=""><figcaption>${f.year}年｜${f.label}</figcaption></figure>`).join('')}</div>`).join('')}`).join('')}`;
await writeFile(join(out,'gallery.html'),html);
await writeFile(join(out,'report.json'),JSON.stringify({status:'D3D_REVIEW_NOT_ACCEPTANCE',sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',
 worlds:results.map(r=>({seed:r.seed,why:r.why,reached:r.reached,sites:r.sites.map(({frames,...s})=>({...s,frames:frames.map(f=>({year:f.year,label:f.label}))}))})),seconds:Math.round((Date.now()-started)/1000)},null,2));
console.log(JSON.stringify({worlds:results.length,bytes:Buffer.byteLength(html)}));
