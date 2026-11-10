/** D4 native cold read and 46 separate observation/motion conditions; CPU4x is emulation. */
import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {coupledReviewServer} from './coupled-review-server.mjs';
const out='artifacts/environment34-terrain-production',audit=JSON.parse(await readFile(out+'/audit.json','utf8')),sourceSHA=process.env.REVIEW_SOURCE_SHA??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.equal(audit.sourceSHA,sourceSHA);
const report={sourceSHA,scope:'D4 recorded ecology and terrain. Native gzip proof, first observation, 1 warmup plus 5 observations/preparations and 120 frames per sample measured separately. CPU4x is emulation, not a physical handset. Long tasks include synchronous sampling loops.',devices:[],performance:[]},server=await coupledReviewServer();let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});const wire=await readFile(out+'/seed42-v8.json','utf8');
 for(const device of ['desktop','mobile-4x']){
  const page=await browser.newPage(device==='desktop'?{viewport:{width:1280,height:800}}:{viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:2});
  if(device==='mobile-4x'){const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});}
  await page.goto(server.url+'/capture');
  const restoreMs=await page.evaluate(async wire=>{
   const{decodeWorldSave}=await import('/dist/story/world-storage.js'),{restoreTerrainProductionSave}=await import('/dist/terrain/terrain-production-history-v1.js');window.longTasks=[];window.longTaskObserver=new PerformanceObserver(list=>window.longTasks.push(...list.getEntries().map(e=>({startMs:e.startTime,durationMs:e.duration}))));if(PerformanceObserver.supportedEntryTypes.includes('longtask'))window.longTaskObserver.observe({type:'longtask',buffered:false});
   const t=performance.now();window.world=restoreTerrainProductionSave(await decodeWorldSave(wire));return performance.now()-t;
  },wire);report.devices.push({device,restoreMs});
  const cases=[...[0,99,100,101,116,1000,10000].flatMap(year=>[0,1,2].map(site=>({year,site}))),...[600,601].map(year=>({year,site:1}))];
  for(const entry of cases){
   const row=await page.evaluate(async({year,site})=>{
    const{observeTerrainProductionScene}=await import('/dist/scene/terrain-production-scene-v1.js'),{prepareSceneMotion,drawSceneMotion}=await import('/dist/scene/motion-frame.js'),canvas=document.getElementById('scene'),reads=[],preparations=[],frames=[],t=performance.now();observeTerrainProductionScene(window.world,year,site);const firstReadMs=performance.now()-t;
    for(let n=0;n<6;n++){
     let t=performance.now();const observation=observeTerrainProductionScene(window.world,year,site);if(n)reads.push(performance.now()-t);t=performance.now();const prepared=prepareSceneMotion(observation);if(n)preparations.push(performance.now()-t);
     for(let frame=0;frame<120;frame++){const t=performance.now();drawSceneMotion(canvas,prepared,frame/12);if(n)frames.push(performance.now()-t);}
    }
    const median=a=>[...a].sort((a,b)=>a-b)[2],sorted=[...frames].sort((a,b)=>a-b);return {year,site,firstReadMs,readMedianMs:median(reads),preparationMedianMs:median(preparations),frameP95Ms:sorted[Math.ceil(sorted.length*.95)-1],reads,preparations,frames};
   },entry);report.performance.push({device,...row});console.log(JSON.stringify({device,...row,frames:undefined,reads:undefined,preparations:undefined}));
  }
  const tasks=await page.evaluate(()=>{window.longTaskObserver.disconnect();return window.longTasks;});Object.assign(report.devices.at(-1),{longTasks:tasks,longestTaskMs:Math.max(0,...tasks.map(t=>t.durationMs))});await page.close();
 }
}finally{await browser?.close();await server.close();}
await writeFile(out+'/observation-performance.json',JSON.stringify(report,null,2)+'\n');assert.equal(report.performance.length,46);assert.ok(report.performance.every(r=>r.frameP95Ms<=83.3),'Terrain draw frame p95 exceeds 83.3ms');console.log(JSON.stringify({conditions:46,maxFrameP95Ms:Math.max(...report.performance.map(r=>r.frameP95Ms))}));
