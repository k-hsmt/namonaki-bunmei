/** D1-C catalog + naturally selected three-view worlds; never construction history. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {coastVariants,coastLabels,generateCoastPrototype} from '../dist/terrain/coast-prototype.js';
import {mountainVariants,mountainLabels,generateMountainPrototype,projectMountainPrototype} from '../dist/terrain/mountain-prototype.js';
import {generateWorldPrototype,prototypeSites} from '../dist/terrain/world-prototype.js';
import {riverVariants} from '../dist/terrain/river-prototype.js';
import {hillVariants} from '../dist/terrain/hill-prototype.js';

const output='artifacts/terrain31-world',all=[],failures=[],frequency={river:{},hill:{},coast:{},mountains:{},seaSide:{}};
await mkdir(output,{recursive:true});
for(let seed=1;seed<=1000;seed++){
 const r=generateWorldPrototype(seed);if(r.status!=='ok'){failures.push(r);continue;}
 const w=r.world;all.push(w);
 for(const [kind,id] of Object.entries({river:w.river.variant,hill:w.hill.variant,coast:w.coast.variant,mountains:w.mountains.variant,seaSide:w.seaSide}))frequency[kind][id]=(frequency[kind][id]??0)+1;
}
const ids=w=>[w.river.variant,w.hill.variant,w.coast.variant,w.mountains.variant,w.seaSide];
const uncovered=new Set([...riverVariants,...hillVariants,...coastVariants,...mountainVariants,'east','west']),selected=[];
while(uncovered.size){
 let best=null,score=0;
 for(const w of all){if(selected.includes(w))continue;const n=ids(w).filter(x=>uncovered.has(x)).length;if(n>score){score=n;best=w;}}
 if(!best)break;selected.push(best);for(const id of ids(best))uncovered.delete(id);
}
for(const w of all){if(selected.length>=12)break;if(!selected.includes(w))selected.push(w);}
await writeFile(output+'/audit.json',JSON.stringify({generatorId:'world-prototype-v1',seedsTested:1000,failures,frequency,
 selection:'greedy maximum uncovered categories; tie lowest seed; fill to >=12 with lowest unused seeds',
 selectedSeeds:selected.map(w=>w.seed),uncovered:[...uncovered],
 cases:all.map(w=>({seed:w.seed,attempt:w.attempt,ids:ids(w),initialPlots:w.initialPlots}))},null,2));
assert.equal(failures.length,0);assert.equal(uncovered.size,0);

const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'5297'},stdio:['ignore','pipe','inherit']});let browser;
try{
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5297');
 const frames=[],provenance=[];
 async function render(kind,id,payload,site=null){
  const im=await page.evaluate(async({kind,payload,site})=>{
   const {drawCoastPrototype,coastPhysicsColors}=await import('/terrain/draw-coast-prototype.js');
   const {rasterizeCoast}=await import('/terrain/coast-prototype.js');
   const {drawMountainProjection}=await import('/terrain/mountain-prototype.js');
   const {drawWorldPrototype}=await import('/terrain/draw-world-prototype.js');
   const {prototypeWaterAt}=await import('/terrain/river-prototype.js');
   const {rasterizeHill}=await import('/terrain/hill-prototype.js');
   const canvas=document.createElement('canvas');
   const paint=(target,p)=>{
    if(kind==='coast')drawCoastPrototype(target,p);
    else if(kind==='world')drawWorldPrototype(target,p,site);
    else {target.width=320;target.height=180;const c=target.getContext('2d');c.fillStyle='#bdc9bb';c.fillRect(0,0,320,180);
     c.fillStyle='#d8cfad';c.fillRect(0,53,320,43);drawMountainProjection(c,p);c.fillStyle='#a2a17a';c.fillRect(0,96,320,84);}
   };
   paint(canvas,payload);const raw=canvas.toDataURL('image/png'),copy=document.createElement('canvas');
   paint(copy,JSON.parse(JSON.stringify(payload)));if(copy.toDataURL('image/png')!==raw)throw Error('JSON PNG mismatch');
   const bytes=canvas.getContext('2d').getImageData(0,0,320,180).data;
   const rgb=(data,i)=>(data[i*4]<<16)|(data[i*4+1]<<8)|data[i*4+2];
   if(kind==='world'&&(site==='coast-inlet'||site==='river-bank')){
    const coast=site==='coast-inlet'?rasterizeCoast(payload.coast):null;
    const colors=(coast?['739aa9','6c999e','a6b7ad','91aeaa','8aaab1']:['6c999e','8aadb0']).map(x=>parseInt(x,16));
    for(let y=96;y<180;y++)for(let x=0;x<320;x++){
     const canonical=payload.views[site].mirrorX?319-x:x;
     const water=coast?coast.surface[y*320+canonical]>=2:prototypeWaterAt(payload.river,canonical+.5,y+.5);
     if(colors.includes(rgb(bytes,y*320+x))!==water)throw Error('world transform/water mismatch '+site+' '+x+','+y);
    }
   }
   let mask=null;
   if(kind==='world'){
    drawWorldPrototype(copy,payload,site,true);mask=copy.toDataURL('image/png');
    const data=copy.getContext('2d').getImageData(0,0,320,180).data;
    const hill=site==='hill-side'?rasterizeHill(payload.hill):null,coast=site==='coast-inlet'?rasterizeCoast(payload.coast):null;
    for(let y=96;y<180;y++)for(let x=0;x<320;x++){
     const sx=payload.views[site].mirrorX?319-x:x,i=y*320+sx;
     const expected=hill?(hill.bearing[i]===2?'68606d':hill.grade[i]===2?'ab7058':hill.grade[i]===1?'b3aa69':'8eaa83'):
      coast?coastPhysicsColors[coast.bearing[i]===1?4:coast.bearing[i]===2?5:coast.surface[i]].slice(1):
      prototypeWaterAt(payload.river,sx+.5,y+.5)?'6c999e':'8eaa83';
     if(rgb(data,y*320+x)!==parseInt(expected,16))throw Error('world physics transform mismatch '+site);
    }
   }
   if(kind==='coast'){
    drawCoastPrototype(copy,payload,true);mask=copy.toDataURL('image/png');
    const r=rasterizeCoast(payload),data=copy.getContext('2d').getImageData(0,0,320,180).data;
    for(let y=96;y<180;y++)for(let x=0;x<320;x++){
     const i=y*320+x,color=coastPhysicsColors[r.bearing[i]===1?4:r.bearing[i]===2?5:r.surface[i]];
     if(rgb(data,i)!==parseInt(color.slice(1),16))throw Error('coast physics mismatch');
    }
   }
   const large=document.createElement('canvas');large.width=1280;large.height=720;
   const c=large.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(canvas,0,0,1280,720);
   return {raw,large:large.toDataURL('image/png'),mask};
  },{kind,payload,site});
  for(const [key,suffix] of [['raw','320x180'],['large','4x'],['mask','physics_320x180']])if(im[key])await writeFile(output+'/'+id+'_'+suffix+'.png',Buffer.from(im[key].split(',')[1],'base64'));
  frames.push({kind,id,site,raw:im.raw});provenance.push({kind,id,site,payload,pngSha256:createHash('sha256').update(Buffer.from(im.raw.split(',')[1],'base64')).digest('hex')});
 }
 for(const v of coastVariants)for(const seed of [7,42,82])await render('coast',v+'_seed'+seed+'_CATALOG_OVERRIDE',generateCoastPrototype(seed,v));
 for(const v of mountainVariants)for(const site of prototypeSites)await render('mountains',v+'_'+site+'_seed42_CATALOG_OVERRIDE',projectMountainPrototype(generateMountainPrototype(42,v),site));
 for(const w of selected)for(const site of prototypeSites)await render('world','world_seed'+w.seed+'_'+site,w,site);
 async function sheet(name,title,subtitle,cards,columns,scale){
  const raw=await page.evaluate(async({title,subtitle,cards,columns,scale})=>{
   const width=320*scale,height=180*scale,gap=16,row=height+48,c=document.createElement('canvas');c.width=columns*(width+gap)+gap;c.height=105+Math.ceil(cards.length/columns)*row;
   const x=c.getContext('2d');x.imageSmoothingEnabled=false;x.fillStyle='#f4f0e6';x.fillRect(0,0,c.width,c.height);x.fillStyle='#354333';x.font='26px sans-serif';x.fillText(title,16,35);x.font='15px sans-serif';x.fillText(subtitle,16,64);
   for(let i=0;i<cards.length;i++){const px=gap+(i%columns)*(width+gap),py=86+Math.floor(i/columns)*row;
    x.fillStyle='#354333';x.font='16px sans-serif';x.fillText(cards[i].label,px,py+21);
    const image=new Image();image.src=cards[i].raw;await image.decode();x.drawImage(image,px,py+30,width,height);}
   return c.toDataURL('image/png');
  },{title,subtitle,cards,columns,scale});
  await writeFile(output+'/'+name+'.png',Buffer.from(raw.split(',')[1],'base64'));
 }
 await sheet('terrain31_coasts_comparison','D1-C | 8 coast families','PROTOTYPE ONLY | seed42 catalog override | 320 x 180 enlarged 2x',coastVariants.map(v=>({label:v+' / '+coastLabels[v],raw:frames.find(f=>f.id===v+'_seed42_CATALOG_OVERRIDE').raw})),2,2);
 await sheet('terrain31_mountains_comparison','D1-C | 6 mountain families','PROTOTYPE ONLY | seed42 | same river-bank camera | 320 x 180 enlarged 2x',mountainVariants.map(v=>({label:v+' / '+mountainLabels[v],raw:frames.find(f=>f.id===v+'_river-bank_seed42_CATALOG_OVERRIDE').raw})),2,2);
 await sheet('terrain31_worlds_comparison','D1-C | shared watershed / 3 observation windows','PROTOTYPE ONLY | hill-side / river-bank / coast-inlet | original 320 x 180 | no buildings or history',selected.flatMap(w=>prototypeSites.map(site=>({label:'seed '+w.seed+' '+(site==='hill-side'?w.hill.variant:site==='river-bank'?'R'+String(riverVariants.indexOf(w.river.variant)+1).padStart(2,'0'):w.coast.variant)+' '+w.mountains.variant+' sea:'+w.seaSide,raw:frames.find(f=>f.id==='world_seed'+w.seed+'_'+site).raw}))),3,1);
 await writeFile(output+'/provenance.json',JSON.stringify({status:'PROTOTYPE_NOT_HISTORY',sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',
  newGameIntegration:false,saveSchemaChange:false,selectedWorldCount:selected.length,catalogOverrides:true,naturalWorldSelection:true,provenance},null,2));
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({type:'terrain31-world',worlds:selected.length,frames:frames.length,failures:failures.length,frequency,selectedSeeds:selected.map(w=>w.seed)}));
}finally{await browser?.close();server.kill();}
