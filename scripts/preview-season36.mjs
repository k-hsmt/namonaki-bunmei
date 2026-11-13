/** Issue #36 D1: 7 natural biomes × 3 sites × 4 controlled phases.
 * npm run build && node scripts/preview-season36.mjs
 * Creates artifacts/season36-d1/{index.html,report.json,84 PNGs}.
 * Read-only appearance experiment; not a year-with-four-seasons simulation or game save.
 */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {BIOME_KINDS,generateClimateBaseline} from '../dist/climate/initial-climate-v1.js';
import {PHASES,coalesceRapidFrames} from './lib/season36-d1.mjs';

const OUTPUT='artifacts/season36-d1';
const YEAR=Number(process.env.SEASON36_D1_YEAR??180);
const PORT=Number(process.env.SEASON36_D1_PORT??5373);
assert.ok(Number.isSafeInteger(YEAR)&&YEAR>=0&&YEAR<=1000,'Invalid trial year');
assert.ok(Number.isSafeInteger(PORT)&&PORT>0&&PORT<65536,'Invalid trial port');
await mkdir(OUTPUT,{recursive:true});
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const labels={desert:'砂漠',steppe:'ステップ',grassland:'草原・サバンナ',temperate_forest:'温帯林',tropical_rainforest:'熱帯雨林',boreal_forest:'亜寒帯林',tundra:'ツンドラ'};
const sites=['川辺','丘陵','入り江'];
const seedPools=Object.fromEntries(BIOME_KINDS.map(b=>[b,[]]));
for(let seed=1;seed<=10000;seed++){
 const biome=generateClimateBaseline(seed).dominantBiome;
 if(seedPools[biome].length<35)seedPools[biome].push(seed);
 if(BIOME_KINDS.every(b=>seedPools[b].length>=35))break;
}
assert.ok(BIOME_KINDS.every(b=>seedPools[b].length>=5),'Insufficient generated biome seeds');
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(PORT)},stdio:['ignore','pipe','pipe']});
let browser;const cases=[],worlds=[],warnings=[],errors=[];
try{
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Review server failed');})]);
 browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
 const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
 page.setDefaultTimeout(1200000);
 page.on('pageerror',err=>errors.push(err.message));
 await page.route('**/__season36_lib__.js',async r=>r.fulfill({contentType:'text/javascript',body:await readFile('scripts/lib/season36-d1.mjs','utf8')}));
 await page.route('**/__season36_browser__.js',async r=>r.fulfill({contentType:'text/javascript',body:await readFile('scripts/lib/season36-browser.mjs','utf8')}));
 await page.route('**/__season36_review__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>Season D1</title>'}));
 await page.goto('http://127.0.0.1:'+PORT+'/__season36_review__');
 for(const biome of BIOME_KINDS){
  let meta=null,selected=null;
  for(const seed of seedPools[biome]){
   try{
    meta=await page.evaluate(async ({seed,year})=>{
     const trial=await import('/__season36_browser__.js');
     window.__season36Trial=await trial.createTrial(seed,year);
     return window.__season36Trial.meta;
    },{seed,year:YEAR});
    selected=seed;break;
   }catch(e){
    // Only real world-generation rejection can be skipped; rendering defects must fail.
    const msg=String(e);
    if(!/No viable world|No viable initial settlement/.test(msg))throw e;
    warnings.push({biome,seed,message:msg.slice(0,250)});
   }
  }
  if(meta===null)throw Error('No valid recorded world for biome '+biome);
  assert.equal(meta.biome,biome);
  assert.equal(meta.sites.length,3);
  worlds.push({biome,label:labels[biome],seed:selected,year:YEAR,sites:meta.sites});
  for(let site=0;site<3;site++)for(let phase=0;phase<4;phase++){
   const rendered=await page.evaluate(({site,phase})=>window.__season36Trial.draw(site,phase),{site,phase});
   assert.equal(rendered.p.phase,phase);
   const file=biome+'_'+site+'_'+phase+'.png',png=Buffer.from(rendered.data.split(',')[1],'base64');
   assert.equal(png.readUInt32BE(16),320);assert.equal(png.readUInt32BE(20),180);
   await writeFile(OUTPUT+'/'+file,png);
   cases.push({biome,seed:selected,year:YEAR,site:sites[site],siteIndex:site,phase,label:PHASES[phase],file,sha256:hash(png),
    seasonal:{temperature:rendered.p.temperature,moisture:rendered.p.moisture,snow:rendered.p.snow,leaf:rendered.p.leaf},
    ground:rendered.ground,roofSnowPixels:rendered.roofPixels});
  }
  assert.equal(await page.evaluate(()=>window.__season36Trial.unchanged()),true,'Trial drawing mutated civilization: '+biome);
 }
 assert.equal(cases.length,84);
 assert.deepEqual(errors,[],'Browser exceptions');
}finally{await browser?.close();server.kill();}

const rapid={stepMs:75,steps:80,minIntervalMs:700};
const rapidEvents=Array.from({length:rapid.steps+1},(_,i)=>({timeMs:i*rapid.stepMs,year:YEAR+i}));
const sampled=coalesceRapidFrames(rapidEvents,rapid.minIntervalMs);
const report={status:'CONTROLLED_PROTOTYPE_NOT_HISTORY',issue:36,stage:'D1',renderer:'season36-d1-trial',
 sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',year:YEAR,images:cases.length,worlds,warnings,
 boundary:{writesWorld:false,writesSave:false,writesGameRng:false,productionFilesChanged:false,controlledPhases:true,
  actualSavedWorldTerrain:true,actualSavedWorldBuildings:true,actualSavedWorldFlora:true,
  exactRoofPaintOnlyForRecordedHousingMiniatures:true,facilityRoofSnow:false,
  rapidDemoIsOnlyASchedulerSimulation:true},
 rapidAudit:{...rapid,actualPaints:sampled.length,final:sampled.at(-1),frames:sampled},cases};
await writeFile(OUTPUT+'/report.json',JSON.stringify(report,null,2)+'\n');

const escape=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const style='*{box-sizing:border-box}body{background:#eceae1;color:#29382d;font:15px/1.6 system-ui,sans-serif;margin:0}header{padding:24px max(16px,calc((100vw - 1200px)/2));background:#f5f3ed;border-bottom:1px solid #d7d6cb}h1{font-size:25px;margin:0}h2{font-size:20px;margin:30px 0 8px}h3{font-size:15px;margin:0 0 8px}p{margin:8px 0}main{max-width:1200px;margin:auto;padding:12px 16px 70px}section{border-bottom:1px solid #d0d0c5;padding:6px 0 20px}.site{margin:16px 0 23px}.phases{display:flex;overflow-x:auto;gap:10px;padding:2px 0 10px}figure{flex:0 0 256px;margin:0}figure img{display:block;width:256px;height:144px;image-rendering:pixelated;border:1px solid #c5c8b9;background:#eef0e8}figcaption{font-size:13px;margin-top:5px}.muted{color:#677569;font-size:13px}button{font:inherit;border:1px solid #a3b2a3;border-radius:7px;background:white;color:#2f4938;padding:7px 12px;cursor:pointer}.preview{background:#f7f6f1;border:1px solid #dddcd2;padding:14px;border-radius:10px;margin-top:28px}.preview img{width:320px;max-width:100%;height:auto;image-rendering:pixelated}code{overflow-wrap:anywhere}';
const first=cases.filter(c=>c.biome===worlds[0].biome&&c.siteIndex===0).map(c=>c.file);
const header='<header><h1>Issue #36｜D1 季節景観の独立比較</h1><p>実際の地形・建物・植生を固定したまま、季節の見た目だけを切り替えた制御試作です。</p><p class="muted">7バイオーム × 3地区 × 4位相 = 84画像。これは年内四季の自然史ではなく、比較用の表示実験です。</p></header>';
const preview='<div class="preview"><h2 style="margin-top:0">年次切り替え・高速間引きの参考</h2><p class="muted">同じ確定年の景観を使った表示タイミングの模式試験。文明進行は実行していません。</p><img id="preview-image" alt="季節の比較" src="'+first[0]+'"><p id="preview-label"></p><button id="normal">通常（850ms/年）</button> <button id="rapid">高速（75ms/年・700ms間引き）</button> <button id="stop">停止</button></div>';
const sections=worlds.map(w=>'<section><h2>'+escape(w.label)+' <span class="muted">seed '+w.seed+'／世界暦 '+w.year+'年</span></h2>'+
 sites.map((s,i)=>'<div class="site"><h3>'+s+' <span class="muted">植物 '+w.sites[i].plants+'・樹木 '+w.sites[i].trees+'・住宅屋根 '+w.sites[i].roofs+'</span></h3><div class="phases">'+
  cases.filter(c=>c.biome===w.biome&&c.siteIndex===i).map(c=>'<figure><img loading="lazy" src="'+c.file+'" alt="'+escape(w.label+' '+s+' '+c.label)+'"><figcaption>'+c.label+' · 地表雪'+c.ground.snowPixels+'px／屋根雪'+c.roofSnowPixels+'px</figcaption></figure>').join('')+'</div></div>').join('')+'</section>').join('');
const footer='<p class="muted">制限：住宅の実スプライトから得られた屋根上端のみ積雪。施設屋根等は推測しないため対象外。D2で必要な形状APIを別途検討。</p><p class="muted">source '+escape(report.sourceHead)+' ／ <a href="report.json">report.json</a></p>';
const js='const frames='+JSON.stringify(first)+';const image=document.getElementById("preview-image"),label=document.getElementById("preview-label");let timer=null,step=0;function paint(){const p=step%4;image.src=frames[p];label.textContent="代表景観 "+["芽吹き","生育期","紅葉","休眠期"][p]+" ／ モデル上の年進行 "+step;}function stop(){if(timer!==null){clearInterval(timer);timer=null;}}document.getElementById("stop").onclick=stop;document.getElementById("normal").onclick=()=>{stop();timer=setInterval(()=>{step++;paint();},850)};document.getElementById("rapid").onclick=()=>{stop();let n=0,last=-Infinity;timer=setInterval(()=>{n++;step++;if(n*75-last>=700){last=n*75;paint();}if(n>=80){stop();paint();}},75)};paint();';
const html='<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Issue #36 D1季節景観比較</title><style>'+style+'</style>'+header+'<main>'+preview+sections+footer+'</main><script>'+js+'</script></html>';
await writeFile(OUTPUT+'/index.html',html);
console.log(JSON.stringify({gallery:OUTPUT+'/index.html',cases:cases.length,worlds:worlds.map(w=>[w.biome,w.seed]),rapidPaints:sampled.length}));
