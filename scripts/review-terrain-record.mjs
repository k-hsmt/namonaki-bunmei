/** D2-A: save real generated results, then render with generator imports blocked. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {generateWorldPrototype} from '../dist/terrain/world-prototype.js';
import {captureTerrainRecord} from '../dist/terrain/capture-terrain-record.js';
import {parseTerrainRecord,serializeTerrainRecord,terrainRecordMaxBytes} from '../dist/terrain/terrain-record.js';
import {recordSites} from '../dist/terrain/terrain-record-types.js';
const output='artifacts/terrain31-record',seeds=[1,3,6,29,85,131,7,198,10,12,21,24],cases=[];
await mkdir(output,{recursive:true});
for(const seed of seeds){
 const generated=generateWorldPrototype(seed);assert.equal(generated.status,'ok');
 const record=captureTerrainRecord(generated.world,process.env.REVIEW_SOURCE_SHA??'local-unidentified'),json=serializeTerrainRecord(record);
 assert.ok(Buffer.byteLength(json)<=200*1024);assert.ok(Buffer.byteLength(json)<terrainRecordMaxBytes);
 const file=output+'/seed'+seed+'_terrain-record-v1.json';await writeFile(file,json);
 const readback=await readFile(file,'utf8');assert.deepEqual(parseTerrainRecord(readback),record);
 cases.push({seed,world:generated.world,json:readback,bytes:Buffer.byteLength(json)});
}
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'5298'},stdio:['ignore','pipe','inherit']});let browser;
try{
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 const source=await browser.newPage(),reader=await browser.newPage(),errors=[],blocked=[];
 for(const p of [source,reader]){
  p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/record-review',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Terrain record validation</title>'}));
 }
 await reader.route(/prototype|capture-terrain-record|\/engine\/|\/story\//,r=>{blocked.push(r.request().url());return r.abort();});
 await Promise.all([source.goto('http://127.0.0.1:5298/record-review'),reader.goto('http://127.0.0.1:5298/record-review')]);
 const frames=[],report=[];
 for(const item of cases){
  const before=await source.evaluate(async w=>{
   const {drawWorldPrototype}=await import('/terrain/draw-world-prototype.js');
   return Object.fromEntries(['hill-side','river-bank','coast-inlet'].map(site=>{
    const c=document.createElement('canvas');drawWorldPrototype(c,w,site);return [site,c.toDataURL('image/png')];
   }));
  },item.world);
  const after=await reader.evaluate(async json=>{
   const {parseTerrainRecord,terrainRecordAt}=await import('/terrain/terrain-record.js');
   const {drawTerrainRecord}=await import('/terrain/draw-terrain-record-v1.js');
   const r=parseTerrainRecord(json),results={};
   for(const site of ['hill-side','river-bank','coast-inlet']){
    let first;const c=document.createElement('canvas');
    for(const year of [0,100,1000,10000]){
     if(terrainRecordAt(r,year)!==r)throw Error('initial result changed by observation year');
     drawTerrainRecord(c,r,site);const image=c.toDataURL('image/png');
     if(first&&first!==image)throw Error('past terrain PNG differs');first=image;
    }
    const big=document.createElement('canvas');big.width=1280;big.height=720;
    const z=big.getContext('2d');z.imageSmoothingEnabled=false;z.drawImage(c,0,0,1280,720);
    results[site]={raw:first,large:big.toDataURL('image/png')};
   }return results;
  },item.json);
  for(const site of recordSites){
   assert.equal(after[site].raw,before[site],'prototype/result PNG '+item.seed+' '+site);
   for(const [key,suffix] of [['raw','320x180'],['large','4x']])await writeFile(output+'/seed'+item.seed+'_'+site+'_'+suffix+'.png',Buffer.from(after[site][key].split(',')[1],'base64'));
   frames.push({label:'seed '+item.seed+' '+site,raw:after[site].raw});
  }
  report.push({seed:item.seed,bytes:item.bytes,variants:{river:item.world.river.variant,hills:item.world.hill.variant,coast:item.world.coast.variant,mountains:item.world.mountains.variant},pngEqual:true,pastYears:[0,100,1000,10000]});
 }
 assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
 const sheet=await reader.evaluate(async frames=>{
  const c=document.createElement('canvas');c.width=1024;c.height=106+Math.ceil(frames.length/3)*216;
  const z=c.getContext('2d');z.imageSmoothingEnabled=false;z.fillStyle='#f4f0e6';z.fillRect(0,0,c.width,c.height);
  z.fillStyle='#354333';z.font='24px sans-serif';z.fillText('D2-A | restored terrain records / 12 worlds',16,35);z.font='14px sans-serif';
  z.fillText('Saved results only. Generator imports blocked. PNG equals D1-C. Original 320 x 180.',16,66);
  for(let i=0;i<frames.length;i++){
   const px=16+(i%3)*336,py=86+Math.floor(i/3)*216;z.fillStyle='#354333';z.font='15px sans-serif';z.fillText(frames[i].label,px,py+18);
   const image=new Image();image.src=frames[i].raw;await image.decode();z.drawImage(image,px,py+27);
  }return c.toDataURL('image/png');
 },frames);
 await writeFile(output+'/terrain31_restored_comparison.png',Buffer.from(sheet.split(',')[1],'base64'));
 await writeFile(output+'/report.json',JSON.stringify({status:'REVIEW_ONLY_NOT_GAME_V5',sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',schemaVersion:1,
  generatorImportsDuringRead:blocked,rendererId:'terrain-result-render-v1',worlds:12,scenes:36,
  targetBytes:200*1024,rejectBytes:terrainRecordMaxBytes,minBytes:Math.min(...cases.map(x=>x.bytes)),maxBytes:Math.max(...cases.map(x=>x.bytes)),cases:report,
  limitations:['No v5 game save integration','No legacy migration','No D3 placement policy','No 10000-year construction simulation of generated terrain']},null,2));
 console.log(JSON.stringify({type:'terrain31-record',worlds:12,scenes:36,pngEqual:true,generatorImports:0,maxBytes:Math.max(...cases.map(x=>x.bytes))}));
}finally{await browser?.close();server.kill();}
