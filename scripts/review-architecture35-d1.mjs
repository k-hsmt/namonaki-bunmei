/** Issue #35 D1: controlled visual catalog, never a generated/observed civilization. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {allArchitectureD1Cases,auditArchitectureD1Catalog} from '../dist/architecture/visual-prototype.js';
const output='artifacts/architecture35-d1';
const cases=allArchitectureD1Cases();auditArchitectureD1Catalog(cases);
const sourceSHA=process.env.REVIEW_SOURCE_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const port=process.env.ARCHITECTURE_REVIEW_PORT??'5347';
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
let browser;
const hashes=new Map(),report=[];
const png=data=>Buffer.from(data.split(',')[1],'base64');
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
try{
 await once(server.stdout,'data',{signal:AbortSignal.timeout(12000)});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/architecture35-d1-review',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>Architecture D1</title>'}));
 await page.goto('http://127.0.0.1:'+port+'/architecture35-d1-review');
 await mkdir(output,{recursive:true});
 for(const item of cases){
  const images=await page.evaluate(async candidate=>{
   const {drawArchitectureD1Preview}=await import('/architecture/draw-prototype.js');
   const canvas=document.createElement('canvas');
   drawArchitectureD1Preview(canvas,candidate);
   if(canvas.width!==320||canvas.height!==180)throw Error('D1 must render native 320x180');
   const raw=canvas.toDataURL('image/png');
   const copy=document.createElement('canvas');drawArchitectureD1Preview(copy,candidate);
   if(copy.toDataURL('image/png')!==raw)throw Error('D1 drawing is non-deterministic');
   const large=document.createElement('canvas');large.width=1280;large.height=720;
   const c=large.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(canvas,0,0,1280,720);
   return {raw,large:large.toDataURL('image/png')};
  },item);
  const native=png(images.raw),enlarged=png(images.large);
  const sha=createHash('sha256').update(native).digest('hex');
  if(!hashes.has(item.family))hashes.set(item.family,new Set());
  hashes.get(item.family).add(sha);
  await writeFile(output+'/'+item.id+'_native.png',native);
  await writeFile(output+'/'+item.id+'_4x.png',enlarged);
  report.push({id:item.id,family:item.family,label:item.label,use:item.use,condition:item.condition,
   premise:item.premise,sourceSHA,sha256:sha,nativeBytes:native.length,enlargedBytes:enlarged.length,
   native:'320x180',zoom:'1280x720 nearest-neighbor',compareFiveUses:item.compareFiveUses});
 }
 assert.deepEqual(errors,[],'Uncaught page errors');
 for(const [family,shas]of hashes)assert.equal(shas.size,cases.filter(c=>c.family===family).length,'Same pixels for different '+family+' catalog options');
}finally{await browser?.close();server.kill();}
const families=Object.fromEntries([...hashes].map(([k,v])=>[k,{count:cases.filter(c=>c.family===k).length,distinctImages:v.size}]));
await writeFile(output+'/audit.json',JSON.stringify({status:'CONTROLLED_D1_NOT_HISTORICAL',sourceSHA,
 rendererId:'architecture35-prototype-v1',native:'320x180',artifacts:report.length*2,frames:report.length,
 families,cases:report,liveSimulationConnected:false,buildingLedgerMutated:false,
 humanReview:'PENDING',limits:[
 'Explicit overrides: the six culture examples are not the complete generator or production styles',
 'Drawing is not constrained by a saved world terrain, construction footprint, or physical occupancy',
 'Any feature invisible at 320x180 must be rejected, enlarged, or redesigned before D2',
 'Technology examples imply no invented factories, resource flows, or recorded historical buildings'
 ]},null,2)+'\n');
const groups=[...new Set(cases.map(c=>c.family))];
const html='<!doctype html><html lang="ja"><meta charset="utf-8"><title>Issue #35 D1 建築文化比較</title>'+
 '<style>body{background:#e8e7df;color:#283830;font:14px/1.55 system-ui,sans-serif;margin:26px auto;max-width:1300px;padding:0 20px}h1,h2{font-weight:600}section{border-top:1px solid #b6bcb2;padding-top:12px;margin-top:28px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(325px,1fr));gap:14px}article{background:#f5f4ec;padding:10px;border-radius:6px}img{image-rendering:pixelated;max-width:100%;height:auto}code{font-size:12px}details{margin-top:8px}small{color:#647269}</style>'+
 '<h1>Issue #35 D1 — 建築文化・建築部品の原寸比較</h1>'+
 '<p><strong>CONTROLLED PROTOTYPE — 実際の文明史ではありません。</strong> 世界の地形・建設履歴・確定敷地には接続していません。建物を同じ位置で比較しています。</p>'+
 '<p>source '+escape(sourceSHA)+' ／ 320×180 native ／ 4× nearest-neighbor ／ Human合否未判定</p>'+
 groups.map(group=>'<section><h2>'+escape(group)+' — '+cases.filter(c=>c.family===group).length+'例</h2><div class="grid">'+
 cases.filter(c=>c.family===group).map(v=>'<article><strong>'+escape(v.label)+'</strong> <small>'+escape(v.id)+'</small>'+
 '<img alt="'+escape(v.label)+' 320×180" width="320" height="180" src="'+v.id+'_native.png">'+
 '<details><summary>4倍画像（輪郭とピクセルの検査）</summary><img width="1280" height="720" src="'+v.id+'_4x.png"></details>'+
 '<small>同条件の制御比較。ゲームに導入された建築や史実ではありません。</small></article>').join('')+
 '</div></section>').join('')+'</html>';
await writeFile(output+'/index.html',html);
console.log(JSON.stringify({status:'CONTROLLED_D1_NOT_HISTORICAL',frames:report.length,images:report.length*2,families,report:output+'/audit.json',gallery:output+'/index.html',humanReview:'PENDING'}));
