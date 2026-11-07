/** D5 single-family comparison. Prototype geometry, never civilization history. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {riverPrototypeExamples} from '../dist/terrain/river-prototype.js';
import {hillVariants,generateHillPrototype} from '../dist/terrain/hill-prototype.js';
import {coastVariants,generateCoastPrototype} from '../dist/terrain/coast-prototype.js';
import {mountainVariants,generateMountainPrototype,projectMountainPrototype} from '../dist/terrain/mountain-prototype.js';
const out='artifacts/terrain31-families',sourceSHA=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
await mkdir(out,{recursive:true});
const cases=[
 ...riverPrototypeExamples().map(payload=>({kind:'river',variant:payload.variant,seed:payload.seed,selection:'first naturally selected representative',payload})),
 ...hillVariants.map(variant=>({kind:'hills',variant,seed:42,selection:'explicit catalog override',payload:generateHillPrototype(42,variant)})),
 ...coastVariants.map(variant=>({kind:'coast',variant,seed:42,selection:'explicit catalog override',payload:generateCoastPrototype(42,variant)})),
 ...mountainVariants.flatMap(variant=>['river-bank','hill-side','coast-inlet'].map(site=>({kind:'mountains',variant,site,seed:42,selection:'explicit catalog override',payload:projectMountainPrototype(generateMountainPrototype(42,variant),site)}))),
];
assert.equal(new Set(cases.map(c=>c.variant)).size,32);
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'5312'},stdio:['ignore','pipe','inherit']});let browser;
try{
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});const page=await browser.newPage();
 await page.route('**/family-review',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Prototype family review</title>'}));await page.goto('http://127.0.0.1:5312/family-review');
 for(const row of cases){
  row.id=`${row.kind}_${row.variant}_${row.site??'ground'}_seed${row.seed}`;
  const images=await page.evaluate(async ({kind,payload})=>{
   const {drawRiverPrototype}=await import('/terrain/draw-river-prototype.js');const {prototypeWaterAt}=await import('/terrain/river-prototype.js');
   const {drawHillPrototype}=await import('/terrain/draw-hill-prototype.js');const {drawCoastPrototype}=await import('/terrain/draw-coast-prototype.js');
   const {drawMountainProjection}=await import('/terrain/mountain-prototype.js');
   const paint=(canvas,physics=false)=>{
    if(kind==='river'){
     drawRiverPrototype(canvas,payload);if(physics){const c=canvas.getContext('2d');for(let y=96;y<180;y++)for(let x=0;x<320;x++){c.fillStyle=prototypeWaterAt(payload,x+.5,y+.5)?'#6c999e':'#8eaa83';c.fillRect(x,y,1,1);}}
    }else if(kind==='hills')drawHillPrototype(canvas,payload,physics?'physics':'landscape');
    else if(kind==='coast')drawCoastPrototype(canvas,payload,physics);
    else {canvas.width=320;canvas.height=180;const c=canvas.getContext('2d');c.fillStyle='#bdc9bb';c.fillRect(0,0,320,180);c.fillStyle='#d8cfad';c.fillRect(0,53,320,43);drawMountainProjection(c,payload);c.fillStyle='#a2a17a';c.fillRect(0,96,320,84);}
   };
   const canvas=document.createElement('canvas');paint(canvas);const raw=canvas.toDataURL(),copy=document.createElement('canvas');paint(copy);if(copy.toDataURL()!==raw)throw Error('Family PNG is nondeterministic');
   const large=document.createElement('canvas');large.width=1280;large.height=720;const c=large.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(canvas,0,0,1280,720);
   paint(copy,true);return {raw,large:large.toDataURL(),physics:copy.toDataURL()};
  },row);
  for(const [kind,data] of Object.entries(images))await writeFile(`${out}/${row.id}_${kind}.png`,Buffer.from(data.split(',')[1],'base64'));
  row.pngSha256=createHash('sha256').update(Buffer.from(images.raw.split(',')[1],'base64')).digest('hex');
 }
}finally{await browser?.close();server.kill();}
await writeFile(out+'/report.json',JSON.stringify({sourceSHA,status:'PROTOTYPE_GEOMETRY_NOT_HISTORY',rendererId:'prototype-catalog-v1',familyCount:32,cases},null,2)+'\n');
await writeFile(out+'/index.html',`<!doctype html><meta charset="utf-8"><title>Issue31 32 terrain families</title><style>body{font:15px sans-serif;background:#eee8da;color:#354333}.row{display:flex;flex-wrap:wrap;gap:16px}article{width:330px}img{image-rendering:pixelated}</style><h1>R10 / H8 / C8 / M6 — single-family geometry</h1><p>sourceSHA ${sourceSHA}; renderer prototype-catalog-v1. Prototype geometry without construction history. Explicit overrides are labeled; natural integrated worlds are reviewed separately.</p><div class="row">`+cases.map(c=>`<article><h2>${c.variant} ${c.site??''}</h2><p>seed ${c.seed}: ${c.selection}</p><img width="320" height="180" src="${c.id}_raw.png"><details><summary>4×</summary><img src="${c.id}_large.png"></details><details><summary>Physics / geometry</summary><img src="${c.id}_physics.png"></details></article>`).join('')+'</div>');
console.log(JSON.stringify({families:32,frames:cases.length,index:out+'/index.html',humanAcceptance:'pending'}));
