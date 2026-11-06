/** D1-B prototype images and physical audit, never a natural building history. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {hillVariants,hillLabels,generateHillPrototype,rasterizeHill,probeHillInitialPlots,hillVariantForSeed} from '../dist/terrain/hill-prototype.js';
const output='artifacts/terrain31-hills',port=5296;
await mkdir(output,{recursive:true});
const audit=[],frequency=Object.fromEntries(hillVariants.map(v=>[v,0]));
// Do not substitute another family or silently retry after a failed shape.
for(let seed=1;seed<=1000;seed++){
 const t=generateHillPrototype(seed),r=rasterizeHill(t),plan=probeHillInitialPlots(r);
 frequency[t.variant]++;audit.push({seed,variant:t.variant,attempt:t.attempt,initialPlots:plan});
}
const failed=audit.filter(x=>!x.initialPlots);
await writeFile(output+'/audit.json',JSON.stringify({testedSeeds:1000,frequency,failed,audit},null,2));
assert.equal(failed.length,0,'initial plot probe failed; see audit.json');
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','inherit']});
let browser;
try{
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+port);
 const frames=[],cases=[];
 for(const variant of hillVariants)for(const seed of [7,42,82]){
  const terrain=generateHillPrototype(seed,variant),r=rasterizeHill(terrain),plan=probeHillInitialPlots(r);
  const result=await page.evaluate(async terrain=>{
   const {drawHillPrototype,hillGroundColor}=await import('/terrain/draw-hill-prototype.js');
   const {rasterizeHill}=await import('/terrain/hill-prototype.js');
   const canvas=document.createElement('canvas');drawHillPrototype(canvas,terrain);
   const raw=canvas.toDataURL('image/png'),copy=document.createElement('canvas');
   drawHillPrototype(copy,JSON.parse(JSON.stringify(terrain)));
   if(copy.toDataURL('image/png')!==raw)throw Error('JSON roundtrip PNG mismatch');
   drawHillPrototype(copy,terrain,'physics');const mask=copy.toDataURL('image/png');
   const bytes=copy.getContext('2d').getImageData(0,0,320,180).data,r=rasterizeHill(terrain);
   for(let y=96;y<180;y++)for(let x=0;x<320;x++){
    const i=y*320+x,rgb=(bytes[i*4]<<16)|(bytes[i*4+1]<<8)|bytes[i*4+2];
    const expected=r.bearing[i]===2?'68606d':r.grade[i]===2?'ab7058':r.grade[i]===1?'b3aa69':'8eaa83';
    if(rgb!==parseInt(expected,16))throw Error('physics mismatch '+x+','+y);
   }
   const scale=src=>{const c=document.createElement('canvas');c.width=1280;c.height=720;
    const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(src,0,0,1280,720);return c.toDataURL('image/png');};
   return {raw,large:scale(canvas),mask,mask4:scale(copy)};
  },terrain);
  const prefix=variant+'_seed'+seed+'_PROTOTYPE';
  for(const [key,suffix] of [['raw','320x180'],['large','4x'],['mask','physics_320x180'],['mask4','physics_4x']]){
   await writeFile(output+'/'+prefix+'_'+suffix+'.png',Buffer.from(result[key].split(',')[1],'base64'));
  }
  frames.push({variant,seed,label:hillLabels[variant],raw:result.raw});
  cases.push({variant,seed,selection:'explicit-catalog-override',naturallySelected:hillVariantForSeed(seed),terrain,initialPlots:plan,
   pngSha256:createHash('sha256').update(Buffer.from(result.raw.split(',')[1],'base64')).digest('hex')});
 }
 const sheet=await page.evaluate(async frames=>{
  const c=document.createElement('canvas');c.width=1328;c.height=1768;
  const x=c.getContext('2d');x.imageSmoothingEnabled=false;
  x.fillStyle='#f4f0e6';x.fillRect(0,0,c.width,c.height);x.fillStyle='#354333';x.font='28px sans-serif';
  x.fillText('Issue #31 / D1-B | 8 hill families',24,39);x.font='16px sans-serif';
  x.fillText('PROTOTYPE ONLY | same seed 42 | 320 x 180 enlarged 2x | far mountains are a fixed reference',24,69);
  for(let i=0;i<8;i++){
   const f=frames.find(f=>f.seed===42&&f.variant==='H0'+(i+1)),px=16+(i%2)*656,py=88+Math.floor(i/2)*410;
   x.fillStyle='#354333';x.font='20px sans-serif';x.fillText(f.variant+' / '+f.label,px+4,py+25);
   const im=new Image();im.src=f.raw;await im.decode();x.drawImage(im,px,py+36,640,360);
  }return c.toDataURL('image/png');
 },frames);
 await writeFile(output+'/terrain31_hills_comparison.png',Buffer.from(sheet.split(',')[1],'base64'));
 const seedsSheet=await page.evaluate(async frames=>{
  const c=document.createElement('canvas');c.width=1000;c.height=1735;const x=c.getContext('2d');x.imageSmoothingEnabled=false;
  x.fillStyle='#f4f0e6';x.fillRect(0,0,c.width,c.height);x.fillStyle='#354333';x.font='20px sans-serif';
  x.fillText('D1-B | catalog seed variation: 7 / 42 / 82 | original size',12,28);
  for(let i=0;i<frames.length;i++){
   const f=frames[i],px=12+(i%3)*328,py=43+Math.floor(i/3)*210;
   x.fillStyle='#354333';x.font='14px sans-serif';x.fillText(f.variant+' seed '+f.seed,px,py+16);
   const im=new Image();im.src=f.raw;await im.decode();x.drawImage(im,px,py+23);
  }return c.toDataURL('image/png');
 },frames);
 await writeFile(output+'/terrain31_hills_seeds.png',Buffer.from(seedsSheet.split(',')[1],'base64'));
 await writeFile(output+'/provenance.json',JSON.stringify({status:'PROTOTYPE_NOT_HISTORY',generatorId:'hill-prototype-v1',
  sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',liveIntegration:false,saveSchemaChange:false,
  fixedFarMountains:true,variantOverrideUsed:true,physicsAgreement:true,jsonRoundtripPngAgreement:true,cases},null,2));
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({type:'terrain31-hills',frames:cases.length,seedsAudited:1000,failures:failed.length,frequency}));
}finally{await browser?.close();server.kill();}
