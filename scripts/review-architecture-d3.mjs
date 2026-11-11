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
// optional: the audit summary (scripts/audit-architecture-d3.mjs summary) shown at the top
const audit=process.env.AUDIT_SUMMARY?JSON.parse(await readFile(process.env.AUDIT_SUMMARY,'utf8')):null;
const auditHtml=!audit?'':(()=>{
 const cp=Object.entries(audit.byCheckpoint),ch=audit.changes,cap=audit.capability;
 const row=(label,f)=>`<tr><th scope="row">${label}</th>${cp.map(([,v])=>`<td>${f(v)}%</td>`).join('')}</tr>`;
 return `<section class="panel"><h2>監査：${audit.worlds}世界（seed ${audit.seeds.join('〜')}）、${audit.years}年、自動の選択</h2>
<div class="scroll"><table><caption>世界の割合。「記録」は伝統そのもの、「建物」は実際に建った建物に現れた軸（年0との違い）</caption>
<tr><th></th>${cp.map(([y])=>`<th>${y}年</th>`).join('')}</tr>
${row('記録：全地区で変わった軸が2以下',v=>v.record.worldsAllSitesAtMost2)}
${row('記録：どこかの地区で2軸以上',v=>v.record.worldsSomeSiteAtLeast2)}
${row('建物：どこかの地区で1軸以上',v=>v.visible.worldsSomeSiteAtLeast1)}
${row('建物：どこかの地区で2軸以上',v=>v.visible.worldsSomeSiteAtLeast2)}</table></div>
<ul class="facts"><li>最後の建設の年（世界ごと）：${audit.lastBuilt.min}〜${audit.lastBuilt.max}年、中央値 ${audit.lastBuilt.median}年</li>
<li>伝統の変化：計 ${ch.total}件（1世界あたり ${ch.perWorld}）。伝わる ${ch.byCause.transmission??0}・生まれる ${ch.byCause.invention??0}・戻る ${ch.byCause.revival??0}。川辺 ${ch.bySite['river-bank']??0}・丘陵 ${ch.bySite['hill-side']??0}・入り江 ${ch.bySite['coast-inlet']??0}</li>
<li>行ったり来たり（以前持っていた値への、戻る以外の変化）：${ch.reverts}件。建設・修繕0件の「生まれる」：${ch.inventionsWithoutWork}件</li>
<li>変わった伝統で建った建物：${ch.changedBirths}／${ch.births}件</li>
<li>技術：${cap.worldsWithAny}%の世界で何か起きた。成立 ${cap.byOp.establish??0}・習得 ${cap.byOp.acquire??0}・喪失 ${cap.byOp.lose??0}・再発見 ${cap.byOp.rediscover??0}。最後まで持っていたのは ${cap.heldAtEnd}件。高度な建物 ${cap.advancedBirths}棟</li></ul></section>`;})();
const html=`<title>建築の変遷レビュー</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* layout: one reading column; each district = facts table, change log, then street frames side by side */
:root{--bg:#e9eae3;--surface:#f6f6f1;--fg:#262b24;--muted:#5b6356;--line:#cdd0c3;--accent:#2f6fd6;--changed:#d5e3f6;
 --font-body:"Noto Sans JP",system-ui,sans-serif;--font-data:"IBM Plex Mono",ui-monospace,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1b1e1a;--surface:#242822;--fg:#e4e6dc;--muted:#a3aa9c;--line:#3c4238;--accent:#7aa7f0;--changed:#25374f;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#1b1e1a;--surface:#242822;--fg:#e4e6dc;--muted:#a3aa9c;--line:#3c4238;--accent:#7aa7f0;--changed:#25374f;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:15px/1.7 var(--font-body);padding-block:24px 48px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
main{max-width:1320px;margin:0 auto;display:grid;gap:28px}
h1{font-size:1.6rem;line-height:1.3;margin:0;text-wrap:balance}h2{font-size:1.25rem;margin:0 0 8px;text-wrap:balance}h3{font-size:1.05rem;margin:0;text-wrap:balance}
p{margin:0;max-width:72ch}.lead{color:var(--muted)}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:16px;display:grid;gap:10px;min-width:0}
.world{display:grid;gap:20px}.district{display:grid;gap:10px;min-width:0;border-top:1px solid var(--line);padding-top:16px}
.scroll{overflow-x:auto;max-width:100%}
table{border-collapse:collapse;font:12px/1.5 var(--font-data);font-variant-numeric:tabular-nums}caption{text-align:left;font:12px/1.5 var(--font-body);color:var(--muted);padding-bottom:4px}
td,th{border:1px solid var(--line);padding:3px 7px;text-align:left;white-space:nowrap}th{font-weight:600}
td.diff{background:var(--changed)}tr.early td{font-weight:600}
.note{font-size:12px;color:var(--muted)}.facts{margin:0;padding-left:1.2em;display:grid;gap:4px}
.frames{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;display:grid;gap:4px;min-width:0;max-width:640px;flex:1 1 300px}
figure img{width:100%;height:auto;image-rendering:pixelated;border:1px solid var(--line)}figcaption{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.key{display:inline-block;width:12px;height:12px;border:2px solid var(--accent);vertical-align:-2px}
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600&family=IBM+Plex+Mono:wght@400;600&display=swap">
<main>
<header class="panel"><h1>Issue #35 D3-d 建築の変遷レビュー（REVIEW ONLY）</h1>
<p class="lead">本番の描画コードで描いた実際の世界の地区。確率はD3-b・D3-cの仮の値のまま。通常画面は変えていない。</p>
<p class="note"><span class="key"></span> 建った年の伝統が年0と違っていた建物の範囲（記録の上の範囲。廃墟・撤去で今は見えない建物の枠も含む）。画像は320×180の2倍表示。</p></header>
${auditHtml}
${results.map(r=>`<section class="panel world"><h2>seed ${r.seed}｜${esc(r.why)}</h2>${r.sites.map(s=>`<div class="district"><h3>${siteJa[s.site]}：建物 ${s.births}件のうち、変わった伝統で建ったもの ${s.changed}件／最後の建設 ${s.lastBuilt}年</h3>
<div class="scroll"><table><tr><th>軸</th>${Object.keys(s.initial).map(k=>`<th>${k}</th>`).join('')}</tr><tr><th>年0</th>${Object.values(s.initial).map(v=>`<td>${esc(v)}</td>`).join('')}</tr><tr><th>${r.reached}年</th>${Object.entries(s.final).map(([k,v])=>`<td${v!==s.initial[k]?' class="diff"':''}>${esc(v)}</td>`).join('')}</tr></table></div>
${s.changes.length?`<div class="scroll"><table><caption>伝統の変化（太字＝最後の建設より前。建物に現れ得る）</caption><tr><th>年</th><th>軸</th><th>変化</th><th>原因</th><th>出典</th></tr>${s.changes.map(c=>`<tr${c.year<s.lastBuilt?' class="early"':''}><td>${c.year}</td><td>${c.axis}</td><td>${esc(c.from)}→${esc(c.to)}</td><td>${causeJa[c.cause]}</td><td>${esc(src(c.sources))}</td></tr>`).join('')}</table></div>`:'<p>伝統の変化なし</p>'}
${s.capability.length?`<p class="note">技術：${s.capability.map(e=>`${e.year}年 ${e.technology} ${opJa[e.op]}`).join('、')}</p>`:''}
<div class="frames">${s.frames.map(f=>`<figure><img src="${f.img}" width="640" height="360" alt="${siteJa[s.site]} ${f.year}年"><figcaption>${f.year}年｜${f.label}</figcaption></figure>`).join('')}</div></div>`).join('')}</section>`).join('')}
</main>`;
await writeFile(join(out,'gallery.html'),html);
await writeFile(join(out,'report.json'),JSON.stringify({status:'D3D_REVIEW_NOT_ACCEPTANCE',sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',
 worlds:results.map(r=>({seed:r.seed,why:r.why,reached:r.reached,sites:r.sites.map(({frames,...s})=>({...s,frames:frames.map(f=>({year:f.year,label:f.label}))}))})),seconds:Math.round((Date.now()-started)/1000)},null,2));
console.log(JSON.stringify({worlds:results.length,bytes:Buffer.byteLength(html)}));
