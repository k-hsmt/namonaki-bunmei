/** D1 smoke: pixel comparisons only; never claims that a simulated history was observed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {allArchitectureD1Cases} from '../../dist/architecture/visual-prototype.js';

test('Issue35 D1: native-scale, distinguishable culture and roof silhouettes, read-only',async()=>{
 const port='5346',server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
 let browser;
 try{
  await once(server.stdout,'data',{signal:AbortSignal.timeout(12000)});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  const page=await browser.newPage();
  await page.route('**/architecture35-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>D1</title>'}));
  await page.goto('http://127.0.0.1:'+port+'/architecture35-test');
  const cases=allArchitectureD1Cases();
  const before=JSON.stringify(cases);
  const result=await page.evaluate(async cases=>{
   const {drawArchitectureD1Preview,paintArchitectureBuilding}=await import('/architecture/draw-prototype.js');
   const imageHashes={},alphaMasks={},casesByFamily={};
   for(const sample of cases){
    const canvas=document.createElement('canvas');
    drawArchitectureD1Preview(canvas,sample);
    if(canvas.width!==320||canvas.height!==180)throw Error('not native resolution');
    const raw=canvas.toDataURL();
    drawArchitectureD1Preview(canvas,sample);
    if(raw!==canvas.toDataURL())throw Error('non-deterministic pixels');
    (imageHashes[sample.family]??=[]).push(raw);
    (casesByFamily[sample.family]??=[]).push({id:sample.id,raw});
    if(sample.family==='roof'){
     const transparent=document.createElement('canvas');transparent.width=140;transparent.height=126;
     paintArchitectureBuilding(transparent.getContext('2d'),sample.style,'house',70,105,'intact',1);
     const pixels=transparent.getContext('2d').getImageData(0,0,140,126).data;
     let mask='';for(let i=3;i<pixels.length;i+=4)mask+=pixels[i]>0?'1':'0';
     (alphaMasks.roof??=[]).push(mask);
    }
   }
   const duplicates=Object.fromEntries(Object.entries(casesByFamily).map(([family,records])=>{
    const seen=new Map(),duplicates=[];for(const record of records){const old=seen.get(record.raw);if(old)duplicates.push([old,record.id]);else seen.set(record.raw,record.id);}
    return [family,duplicates];
   }));
   return {distinct:Object.fromEntries(Object.entries(imageHashes).map(([k,v])=>[k,new Set(v).size])),duplicates,roofMasks:new Set(alphaMasks.roof).size};
  },cases);
  assert.equal(JSON.stringify(cases),before,'view-only code mutated comparison input');
  const duplicates=Object.fromEntries(Object.entries(result.duplicates).filter(([,pairs])=>pairs.length>0));
  assert.deepEqual(duplicates,{},'D1 families with duplicate native pixels');
  assert.equal(result.roofMasks,8,'8 roofs must have distinct opaque silhouettes without colors');
 }finally{await browser?.close();server.kill();}
});
