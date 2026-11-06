/** Issue #31: 地形のみの比較。自然進行の画面や史実の建設ではない。 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {generateRiverPrototype,legacyRiverReference,reviewPrototypePlot} from '../dist/terrain/river-prototype.js';
import {fixedFacilityLotReservations} from '../dist/story/settlement-history.js';
import {existingGround} from '../dist/scene/housing-ground.js';

const output='artifacts/terrain31-prototype';
const terrains=[legacyRiverReference(),...[7,42,82].map(generateRiverPrototype)];
const reserved=fixedFacilityLotReservations(0).map(lot=>({id:lot.id,kind:lot.kind,
 footprint:existingGround({...lot,builtYear:0,condition:'intact'})}));
const server=spawn(process.execPath,['scripts/serve.mjs'],{
 env:{...process.env,PORT:'5295'},stdio:['ignore','pipe','inherit']});
let browser;
try{
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 const page=await browser.newPage({viewport:{width:1024,height:768}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5295');
 await mkdir(output,{recursive:true});
 const cases=[],frames=[];
 for(const terrain of terrains){
  const plots=reserved.map(lot=>({...lot,...(lot.kind==='bridge'
   ?{status:'hold',reason:'bridge-design-required',waterPixels:null}
   :reviewPrototypePlot(terrain,lot.footprint))}));
  const rendered=await page.evaluate(async({terrain,plots})=>{
   const {drawRiverPrototype,prototypeWaterColors}=await import('/terrain/draw-river-prototype.js');
   const {prototypeWaterAt}=await import('/terrain/river-prototype.js');
   const c=document.createElement('canvas');drawRiverPrototype(c,terrain);
   const raw=c.toDataURL('image/png');
   const again=document.createElement('canvas');drawRiverPrototype(again,terrain);
   if(again.toDataURL('image/png')!==raw)throw Error('nondeterministic terrain drawing');
   const bytes=c.getContext('2d').getImageData(0,0,320,180).data;
   const colors=prototypeWaterColors.map(hex=>parseInt(hex.slice(1),16));
   let waterPixels=0;
   for(let y=95;y<180;y++)for(let x=0;x<320;x++){
    const i=(y*320+x)*4,rgb=(bytes[i]<<16)|(bytes[i+1]<<8)|bytes[i+2];
    const painted=colors.includes(rgb),physical=prototypeWaterAt(terrain,x+.5,y+.5);
    if(painted!==physical)throw Error('render/land gate water mismatch at '+x+','+y);
    if(physical)waterPixels++;
   }
   const full=document.createElement('canvas');full.width=1280;full.height=720;
   const f=full.getContext('2d');f.imageSmoothingEnabled=false;f.drawImage(c,0,0,1280,720);
   const marked=document.createElement('canvas');drawRiverPrototype(marked,terrain);
   const m=marked.getContext('2d');
   for(const p of plots){
    const box=p.footprint;
    m.strokeStyle=p.kind==='bridge'?'#cebd63':p.status==='land'?'#416b4c':'#b54d39';
    m.lineWidth=1;m.strokeRect(box.x+.5,box.y+.5,box.width-1,box.depth-1);
   }
   const marked4=document.createElement('canvas');marked4.width=1280;marked4.height=720;
   const z=marked4.getContext('2d');z.imageSmoothingEnabled=false;z.drawImage(marked,0,0,1280,720);
   return {raw,large:full.toDataURL('image/png'),marked:marked4.toDataURL('image/png'),waterPixels};
  },{terrain,plots});
  const prefix=terrain.variant+'_seed'+terrain.seed+'_PROTOTYPE_NOT_HISTORY';
  for(const [key,suffix] of [['raw','320x180'],['large','4x'],['marked','reserved-lots_4x']])
   await writeFile(output+'/'+prefix+'_'+suffix+'.png',Buffer.from(rendered[key].split(',')[1],'base64'));
  frames.push({title:terrain.variant+' | seed '+terrain.seed,raw:rendered.raw,marked:rendered.marked});
  cases.push({terrain,waterPixels:rendered.waterPixels,plots,
   landLots:plots.filter(p=>p.status==='land').length,
   waterConflictLots:plots.filter(p=>p.reason==='water').map(p=>p.id)});
 }
 const sheet=await page.evaluate(async frames=>{
  const c=document.createElement('canvas');c.width=2608;c.height=1744;
  const x=c.getContext('2d');x.imageSmoothingEnabled=false;
  x.fillStyle='#f4f0e6';x.fillRect(0,0,c.width,c.height);
  x.fillStyle='#303d32';x.font='35px sans-serif';x.fillText('Issue #31 | River terrain prototypes',24,48);
  x.font='22px sans-serif';x.fillText('PROTOTYPE ONLY: terrain geometry, not gameplay history. Existing games are unchanged.',24,88);
  for(let i=0;i<frames.length;i++){
   const f=frames[i],px=16+(i%2)*1296,py=120+Math.floor(i/2)*788;
   x.fillStyle='#303d32';x.font='26px sans-serif';x.fillText(f.title,px+8,py+30);
   const image=new Image();image.src=f.raw;await image.decode();x.drawImage(image,px,py+46,1280,720);
  }
  x.fillStyle='#62685d';x.font='22px sans-serif';x.fillText('The renderer and land checks read the same water geometry. Reserved-lot diagnostics are separate.',24,1720);
  return c.toDataURL('image/png');
 },frames);
 await writeFile(output+'/terrain31_comparison.png',Buffer.from(sheet.split(',')[1],'base64'));
 const report={status:'PROTOTYPE_NOT_HISTORY',sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',
  liveGameIntegration:false,saveMigration:false,cases,
  note:'land means only that the old reserved rectangle is dry in this prototype. It is not construction approval. Bridge alignment, access, slopes, housing and land-use history need later design.'};
 await writeFile(output+'/provenance.json',JSON.stringify(report,null,2));
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({type:'terrain31-prototype',cases:cases.map(c=>({variant:c.terrain.variant,seed:c.terrain.seed,
  waterPixels:c.waterPixels,landLots:c.landLots,waterConflictLots:c.waterConflictLots}))}));
}finally{await browser?.close();server.kill();}
