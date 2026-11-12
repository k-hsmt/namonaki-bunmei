/**
 * Issue #47 B1b: REAL saved game scene geometry with three PROTOTYPE-only plant painters.
 *
 * npm run build && node scripts/preview-biome-scenes.mjs
 *
 * Renders 7 forced VISUAL TEST biomes × 3 REAL sites × A/B/C renderers (63 frames),
 * plus 3 unchanged actual-scene baselines. All geometry, architecture and observation
 * come from the current game; climate/vegetation assignments here are NOT generated
 * climate, ecology, historic state, or save fields. No production files are modified.
 *
 * Run after playwright's chromium is installed; CI artifact: artifacts/biome47-b1b.
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import * as Claude from './lib/plant-prototype.mjs';
import {expressiveCatalog,renderExpressivePlant} from './lib/expressive-plant-prototype.mjs';
import {REVIEW_BIOMES,REVIEW_STYLES,REVIEW_SITES,EXPRESSIVE_IDS,planReviewPlants} from './lib/biome47-b1b-spec.mjs';

const out='artifacts/biome47-b1b';
const seed=Number(process.env.BIOME47_B1B_SEED??88),year=Number(process.env.BIOME47_B1B_YEAR??300);
assert.ok(Number.isSafeInteger(seed)&&seed>0&&seed<=0xffffffff,'Invalid seed');
assert.ok(Number.isSafeInteger(year)&&year>=0&&year<=2000,'Invalid review year');
await mkdir(out,{recursive:true});
const sha=s=>createHash('sha256').update(s).digest('hex');
const uri=r=>'data:image/png;base64,'+r.png().toString('base64');
const specimens={expressive:{},claude:{}};
for(const item of expressiveCatalog){
 specimens.expressive[item.id]={
  young:uri(renderExpressivePlant(item.id,{stage:'young'})),
  mature:uri(renderExpressivePlant(item.id))
 };
}
for(const id of Object.keys(Claude.archetypes)){
 specimens.claude[id]={};
 for(const stage of ['young','mature'])
  specimens.claude[id][stage]=Array.from({length:6},(_,variant)=>uri(Claude.renderPlant(id,{stage,variant})));
}
assert.equal(Object.keys(specimens.expressive).length,13);
assert.equal(Object.keys(specimens.claude).length,13);
assert.ok(Object.values(EXPRESSIVE_IDS).every(id=>Object.hasOwn(specimens.expressive,id)));

const PORT=Number(process.env.BIOME47_B1B_PORT??5327);
assert.ok(Number.isInteger(PORT)&&PORT>0&&PORT<65536);
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(PORT)},stdio:['ignore','pipe','pipe']});
let browser;
try{
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('Review web server exited')})]);
 browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
 page.setDefaultTimeout(240000);
 await page.route('**/__b1b_scene_review__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>B1b isolated visual trial</title>'}));
 await page.goto('http://127.0.0.1:'+PORT+'/__b1b_scene_review__');

 // 1. The game itself, in a real browser, creates the saved-terrain/architecture scene.
 //    Keep it only in browser memory. Return read-only physics/occupation to the Node planner.
 const prepared=await page.evaluate(async ({seed,year})=>{
  const W=await import('/story/new-world.js'),A=await import('/architecture/production-v1.js');
  const S=await import('/story/world-session.js'),O=await import('/scene/terrain-production-scene-v1.js');
  const D=await import('/scene/draw-generated-review.js'),R=await import('/terrain/owned-record-physics.js');
  const created=await W.createNewArchitectureWorld(seed);
  const world=year===0?created.architecture:await A.advanceArchitectureWorld(created.architecture,year,'automatic');
  const session=S.architectureProductionSession(world),painter=S.worldStructurePainter(session);
  const scenes=[],result=[];
  for(let si=0;si<3;si++){
   const obs=O.observeTerrainProductionScene(world.terrain,year,si);
   const raster=R.readOwnedRecordPhysics(obs.ground.terrain.sites[obs.ground.site].physics);
   const live=new Set(obs.snapshot.objects.filter(o=>o.kind!=='field'||o.condition!=='ruined').map(o=>o.id));
   const occupied=[
    ...obs.ground.facilities.filter(x=>live.has(x.id)).map(x=>x.plot),
    ...obs.composition.residentialBlocks.map(x=>x.footprint),
    ...(obs.snapshot.publicSpaces??[]).filter(x=>x.condition==='used').map(x=>x.footprint),
    ...obs.ground.bridges.flatMap(x=>[x.deck,...x.bankSupports])
   ];
   const projection=D.projectScenePaint(obs),withoutPlants={
    observation:obs,
    presentation:{...projection.presentation,trees:[]},
    vegetation:null
   };
   const original=document.createElement('canvas');D.drawGeneratedSceneReview(original,obs,undefined,undefined,painter);
   const originalRepeat=document.createElement('canvas');D.drawGeneratedSceneReview(originalRepeat,obs,undefined,undefined,painter);
   if(original.toDataURL()!==originalRepeat.toDataURL())throw Error('Original scene changed while redrawing');
   const background=document.createElement('canvas');D.drawGeneratedSceneReview(background,obs,'backdrop',withoutPlants,painter);
   const buildings=document.createElement('canvas');D.drawGeneratedSceneReview(buildings,obs,'structures',withoutPlants,painter);
   /**
    * Depth of every structure pixel for the plant/structure Y order. Each structure is drawn alone with
    * the same game function, in the game's own order (roof parts far→middle→near, then civic, then other
    * facilities, then presentation marks); the last one drawn owns the pixel. Its depth is its ground line:
    * a facility's footprint front edge (plot.y+depth), a roof part's base y, a mark's y. The stacked singles
    * must reproduce the full structure layer exactly, so structure-to-structure order stays the game's.
    */
   const pres=projection.presentation,blocks=obs.composition.residentialBlocks;
   const single=(objects,roofPart,mark)=>{
    const o2={...obs,snapshot:{...obs.snapshot,objects},composition:{...obs.composition,residentialBlocks:blocks.map(b=>({...b,roofParts:b.roofParts.filter(p=>p===roofPart)}))}};
    const marks={festival:null,fire:null,cart:null};if(mark)marks[mark]=pres[mark];
    const cv=document.createElement('canvas');D.drawGeneratedSceneReview(cv,o2,'structures',{observation:o2,presentation:{...pres,trees:[],...marks},vegetation:null},painter);return cv;
   };
   const items=[];
   for(const depth of ['far','middle','near'])
    for(const part of blocks.flatMap(b=>b.roofParts).filter(p=>p.depth===depth).sort((a,b)=>a.y-b.y||a.x-b.x||a.partId.localeCompare(b.partId)))
     items.push({id:'roof:'+part.partId,ground:part.y,canvas:single([],part,null)});
   for(const o of [...obs.snapshot.objects.filter(o=>o.civic),...obs.snapshot.objects.filter(o=>!o.civic&&o.kind!=='bridge')]){
    const plot=obs.ground.facilities.find(f=>f.id===o.id).plot;
    items.push({id:o.id,ground:plot.y+plot.depth,canvas:single([o],null,null)});
   }
   for(const mark of ['festival','fire','cart'])if(pres[mark])items.push({id:mark,ground:pres[mark].y,canvas:single([],null,mark)});
   const depthMap=new Int16Array(57600).fill(-1),ownerMap=new Int16Array(57600).fill(-1);
   const stacked=document.createElement('canvas');stacked.width=320;stacked.height=180;const sctx=stacked.getContext('2d');
   items.forEach((item,n)=>{
    sctx.drawImage(item.canvas,0,0);
    const d=item.canvas.getContext('2d').getImageData(0,0,320,180).data;
    for(let i=0;i<57600;i++)if(d[i*4+3]){depthMap[i]=item.ground;ownerMap[i]=n;}
   });
   const full=buildings.getContext('2d').getImageData(0,0,320,180).data,again=sctx.getImageData(0,0,320,180).data;
   for(let i=0;i<full.length;i++)if(full[i]!==again[i])throw Error('Single-structure renders do not reproduce the structure layer at '+obs.ground.site);
   for(let i=0;i<57600;i++)if(full[i*4+3]&&full[i*4+3]!==255)throw Error('Partially transparent structure pixel; the Y-order proof needs opaque structures');
   scenes.push({background,buildings,raster,mirrorX:obs.ground.terrain.sites[obs.ground.site].render.mirrorX===true,
    depthMap,ownerMap,structures:items.map(({id,ground})=>({id,ground}))});
   result.push({siteIndex:si,siteId:obs.ground.site,occupied,structures:items.map(({id,ground})=>({id,ground})),mirrorX:obs.ground.terrain.sites[obs.ground.site].render.mirrorX===true,
    physics:{surface:Array.from(raster.surface),grade:Array.from(raster.grade),bearing:Array.from(raster.bearing)},
    realBuildings:obs.snapshot.objects.length,realHousingBlocks:obs.composition.residentialBlocks.length,
    original:original.toDataURL('image/png')
   });
  }
  window.__biome47B1bScenes=scenes;
  return result;
 },{seed,year});
 assert.equal(prepared.length,3);

 // 2. Plan fixed test-only species and roots on verified REAL land for each site/biome.
 const plans=[],counts=[];
 for(const site of prepared){
  assert.equal(site.siteId,REVIEW_SITES[site.siteIndex].id,'Current saved site does not match review site');
  const physics={surface:Uint8Array.from(site.physics.surface),grade:Uint8Array.from(site.physics.grade),bearing:Uint8Array.from(site.physics.bearing)};
  for(const biome of REVIEW_BIOMES){
   const plan=planReviewPlants({physics,occupied:site.occupied,seed,siteIndex:site.siteIndex,biomeId:biome.id});
   assert.ok(plan.habitats.validCandidates>0,'No eligible saved terrain at '+site.siteId);
   assert.ok(plan.counts.low>0,'No eligible undergrowth at '+site.siteId+'/'+biome.id);
   plans.push(plan);
   counts.push({site:site.siteId,biome:biome.id,...plan.counts,...plan.habitats});
  }
 }

 // 3. Render 63 frames with the same origins, species, climate trial palette, occupation and architecture.
 const rendered=await page.evaluate(async({specimens,plans,biomes,styles,expressiveIds,occupied})=>{
  const scenes=window.__biome47B1bScenes;
  if(!scenes||scenes.length!==3)throw Error('Saved scene context missing');
  const imageOf=async url=>{const image=new Image();image.src=url;await image.decode();return image;};
  const loaded={expressive:{},claude:{}};
  for(const [kind,items] of Object.entries(specimens))for(const [id,stages] of Object.entries(items)){
   loaded[kind][id]={};
   for(const [stage,urls] of Object.entries(stages))
    loaded[kind][id][stage]=Array.isArray(urls)?await Promise.all(urls.map(imageOf)):await imageOf(urls);
  }
  /**
   * Saved scenes are drawn through translate(320,0)·scale(-1,1) when render.mirrorX is set, but terrain
   * physics, occupied plots and the planner's roots are record coordinates. Record pixel column x
   * appears at screen column 319-x, so a 2px root at record x..x+1 appears at screen 318-x..319-x.
   */
  const screenColumn=(si,x)=>scenes[si].mirrorX?319-x:x;
  const screenRoot=(si,x)=>scenes[si].mirrorX?318-x:x;
  for(let si=0;si<3;si++){
   // Check the mapping against the real canvas transform used by drawGeneratedSceneReview.
   const probe=document.createElement('canvas');probe.width=320;probe.height=1;const p=probe.getContext('2d');
   for(let x=0;x<320;x++){
    p.setTransform(1,0,0,1,0,0);p.clearRect(0,0,320,1);
    if(scenes[si].mirrorX){p.translate(320,0);p.scale(-1,1);}
    p.fillStyle='#000';p.fillRect(x,0,1,1);
    const d=p.getImageData(0,0,320,1).data;let hit=-1;for(let i=0;i<320;i++)if(d[i*4+3])hit=i;
    if(hit!==screenColumn(si,x))throw Error('Mirror mapping disagrees with the canvas transform at site '+si+' x '+x);
   }
  }
  const tint=(canvas,raster,biome,si)=>{
   const ctx=canvas.getContext('2d'),im=ctx.getImageData(0,0,320,180),d=im.data;
   const col=[1,3,5].map(i=>parseInt(biome.soil.slice(i,i+2),16)),a=biome.strength;
   for(let y=96;y<180;y++)for(let x=0;x<320;x++){
    // Screen column x shows record column screenColumn(si,x) (the mapping is its own inverse).
    const z=y*320+screenColumn(si,x);if(raster.surface[z]!==1||raster.bearing[z]!==0)continue;
    const i=(y*320+x)*4;for(let j=0;j<3;j++)d[i+j]=Math.round(d[i+j]*(1-a)+col[j]*a);
   }
   ctx.putImageData(im,0,0);
  };
  const blank=()=>{const c=document.createElement('canvas');c.width=320;c.height=180;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;return [c,ctx];};
  // Plants are painted on their own transparent layer so the frame order can be verified pixel by pixel.
  /**
   * Plants of one frame, in Y order: every plant (undergrowth and trees together) sorted by root y,
   * ties undergrowth first, then x. root[i] is the root y of the plant visible at pixel i (the last one
   * drawn there, which has the largest root y); kind[i] is 1 undergrowth, 2 tree.
   */
  const plantLayer=(si,style,plan)=>{
   const [all,allCtx]=blank(),[scratch,sctx]=blank();
   const root=new Int16Array(57600).fill(-1),kind=new Uint8Array(57600);
   let clipped=0;
   const ordered=[...plan.low,...plan.trees].sort((a,b)=>a.y-b.y||Number(a.kind==='tree')-Number(b.kind==='tree')||a.x-b.x||a.id.localeCompare(b.id));
   for(const plant of ordered){
    const expressive=style.id==='expressive'||(style.id==='hybrid'&&plant.kind==='tree'&&plant.y>=142);
    const id=expressive?expressiveIds[plant.id]:plant.id;
    const img=expressive?loaded.expressive[id][plant.stage]:loaded.claude[id][plant.stage][plant.variant];
    const depth=(plant.y-96)/84;
    // Same tree roots; A retains the original expressive silhouette with a 0.45..0.73 scale.
    // B uses its native restrained 0.58..1.00 size. C combines them by depth.
    const k=expressive?.45+.28*depth:.58+.42*depth;
    const w=Math.max(1,Math.round(img.width*k)),h=Math.max(1,Math.round(img.height*k));
    const ox=expressive?36:48,oy=expressive?59:68;
    // Sprites are not flipped; only the root position follows the scene's mirror.
    const left=Math.round(screenRoot(si,plant.x)-ox*k),top=Math.round(plant.y-oy*k);
    if(left<0||top<0||left+w>320||top+h>180)clipped++;
    allCtx.drawImage(img,left,top,w,h);
    const x0=Math.max(0,left),y0=Math.max(0,top),x1=Math.min(320,left+w),y1=Math.min(180,top+h);
    if(x1<=x0||y1<=y0)continue;
    sctx.clearRect(x0,y0,x1-x0,y1-y0);sctx.drawImage(img,left,top,w,h);
    const d=sctx.getImageData(x0,y0,x1-x0,y1-y0).data;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(d[((y-y0)*(x1-x0)+x-x0)*4+3]){const i=y*320+x;root[i]=plant.y;kind[i]=plant.kind==='tree'?2:1;}
    sctx.clearRect(x0,y0,x1-x0,y1-y0);
   }
   return {all,root,kind,clipped};
  };
  // Background + biome soil tint. Identical for every style of one site/biome.
  const ground=(si,biome)=>{const [c,ctx]=blank();ctx.drawImage(scenes[si].background,0,0);tint(c,scenes[si].raster,biome,si);return c;};
  const pixels=c=>c.getContext('2d').getImageData(0,0,320,180).data;
  /** A plant pixel is in front of a structure pixel only when the plant's root y is greater than the structure's ground line. */
  const inFront=(si,layer,i)=>layer.root[i]>scenes[si].depthMap[i];
  const splitPlants=(si,layer)=>{
   if(layer.split?.si===si)return layer.split;
   const p=pixels(layer.all),[front,fctx]=blank(),[behind,bctx]=blank();
   const fi=fctx.createImageData(320,180),bi=bctx.createImageData(320,180);
   for(let i=0;i<57600;i++){if(!p[i*4+3])continue;(inFront(si,layer,i)?fi:bi).data.set(p.subarray(i*4,i*4+4),i*4);}
   fctx.putImageData(fi,0,0);bctx.putImageData(bi,0,0);
   return layer.split={si,front,behind};
  };
  /**
   * B1b order: 1 background/terrain, 2 biome soil tint, then plants and structures by ground line (Y):
   * plants behind a structure, the structure layer, plants in front of it. The structure layer is the
   * game's own transparent canvas, so structure-to-structure order is unchanged and nothing is painted twice.
   * 'structures-under-plants' (every plant over every structure) and 'plants-under-structures' (the reverse)
   * reproduce the two earlier B1b orders for side-by-side review only.
   */
  const compose=(si,biome,layer,order='y-sorted')=>{
   const [c,ctx]=blank();ctx.drawImage(ground(si,biome),0,0);
   if(order==='y-sorted'){const s=splitPlants(si,layer);ctx.drawImage(s.behind,0,0);ctx.drawImage(scenes[si].buildings,0,0);ctx.drawImage(s.front,0,0);}
   else if(order==='structures-under-plants'){ctx.drawImage(scenes[si].buildings,0,0);ctx.drawImage(layer.all,0,0);}
   else if(order==='plants-under-structures'){ctx.drawImage(layer.all,0,0);ctx.drawImage(scenes[si].buildings,0,0);}
   else throw Error('Unknown B1b layer order '+order);
   return c;
  };
  /** Pixel proof of the Y order, with how many structure pixels plants cover and how many plant pixels structures hide. */
  const verify=(si,biome,layer,frameCanvas,label)=>{
   const f=pixels(frameCanvas),g=pixels(ground(si,biome)),p=pixels(layer.all),b=pixels(scenes[si].buildings);
   let structure=0,occluded=0,byTrees=0,byLow=0,hidden=0;
   for(let i=0;i<57600;i++){
    const a=i*4,pa=p[a+3];
    if(pa!==0&&pa!==255)throw Error(label+': partially transparent plant pixel; order proof needs opaque sprites');
    const front=pa&&inFront(si,layer,i),src=front?p:b[a+3]?b:g;
    if(f[a]!==src[a]||f[a+1]!==src[a+1]||f[a+2]!==src[a+2]||f[a+3]!==src[a+3])
     throw Error(label+': pixel '+i+(front?' is not the plant in front':b[a+3]?' is not the structure (a plant behind it shows through)':' differs from the ground'));
    if(b[a+3]){structure++;if(front){occluded++;if(layer.kind[i]===2)byTrees++;else byLow++;}else if(pa)hidden++;}
   }
   if(structure===0)throw Error(label+': structures vanished from the frame');
   return {structurePixels:structure,occludedStructurePixels:occluded,occludedByTrees:byTrees,occludedByUndergrowth:byLow,
    occludedShare:Math.round(occluded/structure*10000)/10000,plantPixelsBehindStructures:hidden};
  };
  // Every planned root (2px, record land) must sit on record land when read back through the screen mapping.
  for(const plan of plans)for(const q of [...plan.trees,...plan.low]){
   const sx=screenRoot(plan.siteIndex,q.x);
   for(const c of [sx,sx+1]){const z=q.y*320+screenColumn(plan.siteIndex,c);if(scenes[plan.siteIndex].raster.surface[z]!==1)throw Error('Plant root drawn off land: '+plan.biomeId+'/'+plan.siteIndex+' x '+q.x);}
  }
  const frames=[],layers=new Map();
  for(const biome of biomes)for(let si=0;si<3;si++){
   const plan=plans.find(p=>p.siteIndex===si&&p.biomeId===biome.id);
   if(!plan)throw Error('Missing saved-terrain plan '+biome.id+'/'+si);
   const rendered=[];
   for(const style of styles){
    const layer=plantLayer(si,style,plan),c=compose(si,biome,layer),data=c.toDataURL('image/png');
    // Repeated rasterization must be bit-identical, including the fake biome palette.
    if(data!==compose(si,biome,plantLayer(si,style,plan)).toDataURL('image/png'))throw Error('B1b pixel nondeterminism');
    const key=biome.id+'/'+si+'/'+style.id;layers.set(key,{si,biome,layer});
    rendered.push({biome:biome.id,siteIndex:si,style:style.id,data,clipped:layer.clipped,occlusion:verify(si,biome,layer,c,key)});
   }
   frames.push(...rendered);
  }
  /** The previous B1b order (every plant over every structure) and a front/back map, for review of selected frames. */
  const previousOrder=key=>{const {si,biome,layer}=layers.get(key);return compose(si,biome,layer,'structures-under-plants').toDataURL('image/png');};
  const occlusionMap=key=>{
   const {si,biome,layer}=layers.get(key),c=compose(si,biome,layer),ctx=c.getContext('2d'),im=ctx.getImageData(0,0,320,180),d=im.data;
   const p=pixels(layer.all),b=pixels(scenes[si].buildings);
   for(let i=0;i<57600;i++){
    const a=i*4;
    if(b[a+3]&&p[a+3]&&inFront(si,layer,i)){d[a]=230;d[a+1]=40;d[a+2]=170;}        // structure hidden by a plant in front
    else if(b[a+3]&&p[a+3]){d[a]=40;d[a+1]=120;d[a+2]=220;}                       // plant behind, hidden by the structure
    else if(b[a+3]){d[a]=245;d[a+1]=245;d[a+2]=235;}                              // structure, nothing behind or in front
    else for(let j=0;j<3;j++)d[a+j]=Math.round(d[a+j]*.35+235*.65);               // everything else, faded
   }
   ctx.putImageData(im,0,0);return c.toDataURL('image/png');
  };
  // Guaranteed overlaps (TEST ONLY, not part of the 63): one tree just in front of a real structure, one just behind it.
  const overlapChecks=[];
  for(let si=0;si<3;si++){
   const b=pixels(scenes[si].buildings);
   // Structure layers are drawn mirrored when render.mirrorX is set; occupied plots are in record coordinates.
   const target=occupied[si].map(record=>({record,p:scenes[si].mirrorX?{...record,x:320-record.x-record.width}:record})).map(({record,p})=>{let n=0;for(let y=Math.max(0,p.y-24);y<Math.min(180,p.y+p.depth);y++)for(let x=p.x;x<p.x+p.width;x++)if(b[(y*320+x)*4+3])n++;return {record,p,n};})
    .filter(({p,n})=>n>=20&&p.y+p.depth+4<=178)
    // Prefer a structure whose front tree is a C near tree (root y>=142, painter A); otherwise the nearest one.
    .sort((a,c)=>Number(c.p.y+c.p.depth+4>=142)-Number(a.p.y+a.p.depth+4>=142)||c.p.y-a.p.y||c.n-a.n||a.p.x-c.p.x)[0];
   if(!target)throw Error('No near structure to test occlusion at site '+si);
   const biome=biomes.find(x=>x.id==='temperate_forest'),style=styles.find(x=>x.id==='hybrid');
   // Tree roots are record coordinates, like every planned plant; plantLayer mirrors them.
   const p=target.record,x=p.x+Math.floor(p.width/2)-1;
   const cases=[{placement:'front',tree:{kind:'tree',id:'deciduous',x,y:p.y+p.depth+4,variant:0,stage:'mature'}},
    {placement:'behind',tree:{kind:'tree',id:'deciduous',x,y:p.y-2,variant:0,stage:'mature'}}];
   for(const {placement,tree} of cases){
    const layer=plantLayer(si,style,{trees:[tree],low:[]}),c=compose(si,biome,layer),key='overlap-check/'+placement+'/'+si;
    const occlusion=verify(si,biome,layer,c,key);
    if(placement==='front'&&occlusion.occludedByTrees===0)throw Error(key+': the tree in front did not cover the structure');
    if(placement==='behind'&&occlusion.plantPixelsBehindStructures===0)throw Error(key+': the structure did not hide the tree behind it');
    layers.set(key,{si,biome,layer});
    overlapChecks.push({siteIndex:si,placement,tree:{id:tree.id,x:tree.x,y:tree.y,painter:tree.y>=142?'A (C near tree)':'B (C mid-ground tree)'},
     structurePlot:p,occlusion,data:c.toDataURL('image/png'),previous:previousOrder(key)});
   }
  }
  // Review examples: the C frames where the Y order hides the most plant pixels behind structures.
  const ranked=frames.filter(f=>f.style==='hybrid'&&f.occlusion.plantPixelsBehindStructures>0)
   .sort((a,b)=>b.occlusion.plantPixelsBehindStructures-a.occlusion.plantPixelsBehindStructures||a.biome.localeCompare(b.biome)||a.siteIndex-b.siteIndex);
  const examples=ranked.slice(0,6).map(f=>{const key=f.biome+'/'+f.siteIndex+'/'+f.style;return {biome:f.biome,siteIndex:f.siteIndex,style:f.style,previous:previousOrder(key),map:occlusionMap(key)};});
  return {frames,overlapChecks,examples};
 },{specimens,plans,biomes:REVIEW_BIOMES,styles:REVIEW_STYLES,expressiveIds:EXPRESSIVE_IDS,occupied:prepared.map(s=>s.occupied)});
 const {frames:results,overlapChecks,examples}=rendered;
 assert.equal(results.length,7*3*3);
 const artifacts=[],images=new Map();
 const saveData=async(name,encoded)=>{
  assert.ok(encoded.startsWith('data:image/png;base64,'));
  const raw=Buffer.from(encoded.slice(encoded.indexOf(',')+1),'base64');
  assert.deepEqual([...raw.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  await writeFile(out+'/'+name+'.png',raw);
  artifacts.push({name,sha256:sha(raw),bytes:raw.length});
  return raw;
 };
 for(const site of prepared)await saveData('actual_'+REVIEW_SITES[site.siteIndex].id+'_seed'+seed+'_year'+year,site.original);
 for(const r of results){
  const name=r.biome+'_'+REVIEW_SITES[r.siteIndex].id+'_'+r.style;
  await saveData(name,r.data);
  images.set(name,{name,clipped:r.clipped,occlusion:r.occlusion});
 }
 // Review aids, not part of the 63: the previous order and front/back maps for the C frames where the
 // Y order hides the most plant pixels, and guaranteed tree-in-front / tree-behind checks per site.
 const exampleName=e=>e.biome+'_'+REVIEW_SITES[e.siteIndex].id+'_'+e.style;
 for(const e of examples){await saveData('previous-order_'+exampleName(e),e.previous);await saveData('occlusion-map_'+exampleName(e),e.map);}
 const overlapName=o=>'overlap-check_'+REVIEW_SITES[o.siteIndex].id+'_'+o.placement;
 for(const o of overlapChecks){await saveData(overlapName(o)+'_TEST_ONLY',o.data);await saveData(overlapName(o)+'_previous-order_TEST_ONLY',o.previous);}
 const report={
  status:'PROTOTYPE ONLY — NOT GENERATED CLIMATE, NOT HISTORY',
  sourceSHA:process.env.REVIEW_SOURCE_SHA??'unverified-local',
  seed,year,reference:'Real saved terrain and architecture; forced visual-only species trial',
  baselineSites:prepared.map(x=>({site:x.siteId,mirrorX:x.mirrorX,buildings:x.realBuildings,housingBlocks:x.realHousingBlocks})),
  coordinateNote:'Planner roots, occupied plots and physics are record coordinates. Plants and the soil tint are mapped to the screen through the scene mirror (root x -> 318-x, column x -> 319-x when mirrorX); sprites are not flipped.',
  biomes:REVIEW_BIOMES.map(x=>({id:x.id,label:x.label})),
  styles:REVIEW_STYLES.map(x=>({id:x.id,label:x.label})),
  layerOrder:['background (terrain, ground, canals, public spaces, bridges)','biome soil tint (land cells only)','plants whose root y is not below the ground line of the structure pixel they overlap','confirmed structures (the game layer, unchanged internal order)','plants in front: root y greater than the structure ground line'],
  layerOrderNote:'Plants are sorted by root y (undergrowth and trees together). Structure ground line: facility footprint front edge (plot.y+depth), roof part base y, presentation mark y. Ties put the structure in front.',
  structureGroundLines:prepared.map(x=>({site:x.siteId,structures:x.structures})),
  counts,frames:results.map(x=>({biome:x.biome,site:REVIEW_SITES[x.siteIndex].id,style:x.style,clipped:x.clipped,occlusion:x.occlusion})),
  mostHiddenPlantHybridExamples:examples.map(e=>({name:exampleName(e),occlusion:images.get(exampleName(e)).occlusion})),
  overlapChecks:overlapChecks.map(({data,previous,...o})=>({...o,site:REVIEW_SITES[o.siteIndex].id})),
  assets:artifacts
 };
 await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
 const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const pct=v=>(Math.round(v*1000)/10).toFixed(1)+'%';
 const share=o=>'建物の遮蔽 '+pct(o.occludedShare)+'（'+o.occludedStructurePixels+'/'+o.structurePixels+'px、うち樹木 '+o.occludedByTrees+'px）／建物の奥に隠れた植物 '+o.plantPixelsBehindStructures+'px';
 const img=name=>'<img src="'+esc(name)+'.png" width="320" height="180" loading="lazy" alt="'+esc(name)+'">';
 const rows=REVIEW_BIOMES.map(b=>{
  const cells=REVIEW_SITES.map(site=>'<tr><th>'+esc(site.label)+'</th>'+
    REVIEW_STYLES.map(style=>{const name=b.id+'_'+site.id+'_'+style.id;return '<td>'+img(name)+'<small>'+share(images.get(name).occlusion)+'</small></td>';}).join('')+'</tr>').join('');
  return '<section><h2>'+esc(b.label)+'</h2><div class="scroll"><table><thead><tr><th>地区</th>'+
    REVIEW_STYLES.map(s=>'<th>'+esc(s.label)+'</th>').join('')+'</tr></thead><tbody>'+cells+'</tbody></table></div></section>';
 }).join('\n');
 const baseline=prepared.map(s=>'<figure>'+img('actual_'+s.siteId+'_seed'+seed+'_year'+year)+
  '<figcaption>'+esc(REVIEW_SITES[s.siteIndex].label)+'／本編の元の景観</figcaption></figure>').join('');
 const html='<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>名もなき文明 / Issue47 B1b 実景観の植物比較</title>'+
  '<style>:root{color-scheme:light}body{font:14px/1.6 system-ui,sans-serif;background:#e9eae3;color:#2b342b;margin:0;padding:22px}main{max-width:1200px;margin:auto}h1{font-size:24px}h2{border-top:1px solid #c5cbbf;padding-top:20px;margin-top:32px}table{border-collapse:separate;border-spacing:8px 6px}td,th{padding:6px;background:#f8f8f3;border-radius:3px}th{text-align:left;white-space:nowrap;font-size:12px}.scroll{overflow-x:auto}img{display:block;image-rendering:pixelated;max-width:none}figure{display:inline-block;margin:0 14px 14px 0}figcaption{font-size:12px}small,.note{color:#5c675c}details{margin:16px 0}@media(max-width:700px){body{padding:12px}h1{font-size:20px}}</style>'+
  '<main><h1>Issue #47 B1b｜本編の地形・建物×植物造形 A/B/C</h1>'+
  '<p><b>PROTOTYPE ONLY / NOT HISTORY.</b> seed '+seed+'、観測年 '+year+'。地形・建物・橋・住宅は本編の確定記録から取得。植物と地表色は7つの仮想気候を指定した<b>視覚比較用</b>であり、世界の気候が既に生成・保存されたものではありません。</p>'+
  '<p>各地区内ではA/B/Cで植物の根元・種類・本数・観測年は同じです。A＝PR #126の輪郭、B＝PR #127の6個体差、C＝近景の主木をA、その他をB。<b>植物と建物の前後は根元・接地線のY座標で決めます</b>（建物より奥に根元がある植物は建物に隠れ、手前の植物は建物を覆う）。建物同士の重なり順は本編のまま。各画像の下の数値は、建物の画素のうち手前の植物に覆われた割合と、建物の奥に隠れた植物の画素数です。原寸320×180で評価してください。</p>'+
  '<h2>実ゲーム描画（変更前の参照）</h2>'+baseline+
  '<h2>前後判定の代表例（C統合版で建物の奥に隠れた植物が多い6画面）</h2><p class="note">左＝以前の描画順（すべての植物が建物の上）、中＝現在（Y座標で前後判定）、右＝前後図（<b style="color:#e628aa">桃色</b>＝手前の植物に隠れた建物、<b style="color:#2878dc">青</b>＝建物の奥に隠れた植物、白＝それ以外の建物）。植物の大きさ・本数・位置は変えていない。</p>'+
  examples.map(e=>{const n=exampleName(e);return '<div class="scroll"><table><tr><td>'+img('previous-order_'+n)+'<small>以前の順序</small></td><td>'+img(n)+'<small>現在の順序｜'+share(images.get(n).occlusion)+'</small></td><td>'+img('occlusion-map_'+n)+'<small>遮蔽図｜'+esc(n)+'</small></td></tr></table></div>';}).join('')+
  '<h2>確実に重なる検証画面（TEST ONLY、63枚に含まない）</h2><p class="note">各地区で実在の建物の手前4px／奥2pxにC方式の落葉広葉樹を1本だけ置いた画面（根元y≥142ならA造形、それ以外はB造形）。手前の木は建物を覆い、奥の木は建物に隠れることを画素単位で検証している。</p>'+
  overlapChecks.map(o=>'<div class="scroll"><table><tr><td>'+img(overlapName(o)+'_previous-order_TEST_ONLY')+'<small>以前の順序｜'+(o.placement==='front'?'手前の木':'奥の木')+'</small></td><td>'+img(overlapName(o)+'_TEST_ONLY')+'<small>現在｜'+share(o.occlusion)+'</small></td></tr></table></div>').join('')+
  rows+
  '<p class="note">次のHumanレビュー：建築の見え方・木の大きさ・各バイオームの形態差・局所水分・静かな余白。植物の数値的な成長・遷移、セーブと季節はB2以降です。</p></main></html>';
 await writeFile(out+'/gallery.html',html);
 console.log(JSON.stringify({type:'issue47-b1b',status:'review-only',seed,year,frames:results.length,
  originals:prepared.length,artifacts:artifacts.length,topHiddenPlantExample:examples[0]&&{name:exampleName(examples[0]),...images.get(exampleName(examples[0])).occlusion},
  overlapChecks:overlapChecks.map(o=>[REVIEW_SITES[o.siteIndex].id,o.placement,o.occlusion.occludedByTrees,o.occlusion.plantPixelsBehindStructures]),sites:prepared.map(s=>s.siteId),out, report:out+'/report.json'}));
}finally{await browser?.close();server.kill();}
