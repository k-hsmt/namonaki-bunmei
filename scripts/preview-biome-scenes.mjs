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
   scenes.push({background,buildings,raster,mirrorX:obs.ground.terrain.sites[obs.ground.site].render.mirrorX===true});
   result.push({siteIndex:si,siteId:obs.ground.site,occupied,
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
  const tint=(canvas,raster,biome)=>{
   const ctx=canvas.getContext('2d'),im=ctx.getImageData(0,0,320,180),d=im.data;
   const col=[1,3,5].map(i=>parseInt(biome.soil.slice(i,i+2),16)),a=biome.strength;
   for(let y=96;y<180;y++)for(let x=0;x<320;x++){
    const z=y*320+x;if(raster.surface[z]!==1||raster.bearing[z]!==0)continue;
    const i=z*4;for(let j=0;j<3;j++)d[i+j]=Math.round(d[i+j]*(1-a)+col[j]*a);
   }
   ctx.putImageData(im,0,0);
  };
  const blank=()=>{const c=document.createElement('canvas');c.width=320;c.height=180;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;return [c,ctx];};
  // Plants are painted on their own transparent layer so the frame order can be verified pixel by pixel.
  const plantLayer=(style,plan)=>{
   const [low,lowCtx]=blank(),[trees,treeCtx]=blank();
   let clipped=0;
   const draw=(ctx,plant)=>{
    const expressive=style.id==='expressive'||(style.id==='hybrid'&&plant.kind==='tree'&&plant.y>=142);
    const kind=expressive?'expressive':'claude',id=expressive?expressiveIds[plant.id]:plant.id;
    const stage=plant.stage;
    const img=expressive?loaded.expressive[id][stage]:loaded.claude[id][stage][plant.variant];
    const depth=(plant.y-96)/84;
    // Same tree roots; A retains the original expressive silhouette with a 0.45..0.73 scale.
    // B uses its native restrained 0.58..1.00 size. C combines them by depth.
    const k=expressive?.45+.28*depth:.58+.42*depth;
    const w=Math.max(1,Math.round(img.width*k)),h=Math.max(1,Math.round(img.height*k));
    const ox=expressive?36:48,oy=expressive?59:68;
    const left=Math.round(plant.x-ox*k),top=Math.round(plant.y-oy*k);
    if(left<0||top<0||left+w>320||top+h>180)clipped++;
    ctx.drawImage(img,left,top,w,h);
   };
   for(const p of [...plan.low].sort((a,b)=>a.y-b.y))draw(lowCtx,p);
   for(const p of [...plan.trees].sort((a,b)=>a.y-b.y))draw(treeCtx,p);
   // Undergrowth first, trees over it: the same order as the original single-pass drawing.
   const [all,allCtx]=blank();allCtx.drawImage(low,0,0);allCtx.drawImage(trees,0,0);
   return {low,trees,all,clipped};
  };
  // Background + biome soil tint. Identical for every style of one site/biome.
  const ground=(si,biome)=>{const [c,ctx]=blank();ctx.drawImage(scenes[si].background,0,0);tint(c,scenes[si].raster,biome);return c;};
  /**
   * B1b occlusion trial order: 1 background/terrain, 2 biome soil tint, 3 confirmed structures, 4 plants.
   * The structure layer is a transparent canvas (drawGeneratedSceneReview 'structures'), so no
   * background is painted twice. Every plant is drawn over every structure: this is deliberately
   * NOT a depth sort (a far tree also covers a nearer building); see docs §4.
   * order='plants-under-structures' reproduces the previous B1b frames for side-by-side review only.
   */
  const compose=(si,biome,layer,order='structures-under-plants')=>{
   const [c,ctx]=blank();ctx.drawImage(ground(si,biome),0,0);
   if(order==='structures-under-plants'){ctx.drawImage(scenes[si].buildings,0,0);ctx.drawImage(layer.all,0,0);}
   else if(order==='plants-under-structures'){ctx.drawImage(layer.all,0,0);ctx.drawImage(scenes[si].buildings,0,0);}
   else throw Error('Unknown B1b layer order '+order);
   return c;
  };
  const pixels=c=>c.getContext('2d').getImageData(0,0,320,180).data;
  /** Pixel proof of the order, plus how many structure pixels the plants cover. */
  const verify=(si,biome,layer,frameCanvas,label)=>{
   const [under,uctx]=blank();uctx.drawImage(ground(si,biome),0,0);uctx.drawImage(scenes[si].buildings,0,0);
   const f=pixels(frameCanvas),u=pixels(under),p=pixels(layer.all),t=pixels(layer.trees),l=pixels(layer.low),b=pixels(scenes[si].buildings);
   let structure=0,occluded=0,byTrees=0,byLow=0;
   for(let i=0;i<f.length;i+=4){
    const pa=p[i+3];
    if(pa!==0&&pa!==255)throw Error(label+': partially transparent plant pixel; order proof needs opaque sprites');
    const src=pa?p:u;
    if(f[i]!==src[i]||f[i+1]!==src[i+1]||f[i+2]!==src[i+2]||f[i+3]!==src[i+3])
     throw Error(label+': pixel '+(i/4)+(pa?' is not the plant (plants must be in front)':' differs from background+structures (structure lost or altered)'));
    if(b[i+3]){structure++;if(pa){occluded++;if(t[i+3])byTrees++;else if(l[i+3])byLow++;}}
   }
   if(structure===0)throw Error(label+': structures vanished from the frame');
   return {structurePixels:structure,occludedStructurePixels:occluded,occludedByTrees:byTrees,occludedByUndergrowth:byLow,
    occludedShare:Math.round(occluded/structure*10000)/10000};
  };
  const frames=[],layers=new Map();
  for(const biome of biomes)for(let si=0;si<3;si++){
   const plan=plans.find(p=>p.siteIndex===si&&p.biomeId===biome.id);
   if(!plan)throw Error('Missing saved-terrain plan '+biome.id+'/'+si);
   const rendered=[];
   for(const style of styles){
    const layer=plantLayer(style,plan),c=compose(si,biome,layer),data=c.toDataURL('image/png');
    // Repeated rasterization must be bit-identical, including the fake biome palette.
    if(data!==compose(si,biome,plantLayer(style,plan)).toDataURL('image/png'))throw Error('B1b pixel nondeterminism');
    const key=biome.id+'/'+si+'/'+style.id;layers.set(key,{si,biome,layer});
    rendered.push({biome:biome.id,siteIndex:si,style:style.id,data,clipped:layer.clipped,occlusion:verify(si,biome,layer,c,key)});
   }
   frames.push(...rendered);
  }
  /** Previous order and an occlusion map, for side-by-side review of selected frames only. */
  const previousOrder=key=>{const {si,biome,layer}=layers.get(key);return compose(si,biome,layer,'plants-under-structures').toDataURL('image/png');};
  const occlusionMap=key=>{
   const {si,biome,layer}=layers.get(key),c=compose(si,biome,layer),ctx=c.getContext('2d'),im=ctx.getImageData(0,0,320,180),d=im.data;
   const p=pixels(layer.all),b=pixels(scenes[si].buildings);
   for(let i=0;i<d.length;i+=4){
    if(b[i+3]&&p[i+3]){d[i]=230;d[i+1]=40;d[i+2]=170;}                 // structure hidden by a plant
    else if(b[i+3]){d[i]=245;d[i+1]=245;d[i+2]=235;}                     // structure still visible
    else for(let j=0;j<3;j++)d[i+j]=Math.round(d[i+j]*.35+235*.65);       // everything else, faded
   }
   ctx.putImageData(im,0,0);return c.toDataURL('image/png');
  };
  // Guaranteed overlap (TEST ONLY, not one of the 63): a C near-ground tree rooted just in front of a real structure.
  const overlapChecks=[];
  for(let si=0;si<3;si++){
   const b=pixels(scenes[si].buildings);
   // Structure layers are drawn mirrored when render.mirrorX is set; occupied plots are in record coordinates.
   const target=occupied[si].map(q=>scenes[si].mirrorX?{...q,x:320-q.x-q.width}:q).map(p=>{let n=0;for(let y=Math.max(0,p.y-24);y<Math.min(180,p.y+p.depth);y++)for(let x=p.x;x<p.x+p.width;x++)if(b[(y*320+x)*4+3])n++;return {p,n};})
    .filter(({p,n})=>n>=20&&p.y+p.depth+4<=178)
    // Prefer a structure whose front tree is a C near tree (root y>=142, painter A); otherwise the nearest one.
    .sort((a,c)=>Number(c.p.y+c.p.depth+4>=142)-Number(a.p.y+a.p.depth+4>=142)||c.p.y-a.p.y||c.n-a.n||a.p.x-c.p.x)[0];
   if(!target)throw Error('No near structure to test occlusion at site '+si);
   const {p}=target,tree={kind:'tree',id:'deciduous',x:p.x+Math.floor(p.width/2),y:p.y+p.depth+4,variant:0,stage:'mature'};
   const biome=biomes.find(x=>x.id==='temperate_forest'),style=styles.find(x=>x.id==='hybrid');
   const layer=plantLayer(style,{trees:[tree],low:[]}),c=compose(si,biome,layer),key='overlap-check/'+si;
   const occlusion=verify(si,biome,layer,c,key);
   if(occlusion.occludedByTrees===0)throw Error(key+': the near tree did not cover the structure behind it');
   layers.set(key,{si,biome,layer});
   overlapChecks.push({siteIndex:si,tree:{id:tree.id,x:tree.x,y:tree.y,painter:tree.y>=142?'A (C near tree)':'B (C mid-ground tree; no structure near enough for A)'},structurePlot:p,occlusion,data:c.toDataURL('image/png'),previous:previousOrder(key)});
  }
  const ranked=frames.filter(f=>f.style==='hybrid').sort((a,b)=>b.occlusion.occludedStructurePixels-a.occlusion.occludedStructurePixels||a.biome.localeCompare(b.biome)||a.siteIndex-b.siteIndex);
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
 // Review aids, not part of the 63: previous order and occlusion maps for the most-occluded C frames,
 // and one guaranteed tree-over-structure check per site.
 const exampleName=e=>e.biome+'_'+REVIEW_SITES[e.siteIndex].id+'_'+e.style;
 for(const e of examples){await saveData('previous-order_'+exampleName(e),e.previous);await saveData('occlusion-map_'+exampleName(e),e.map);}
 for(const o of overlapChecks){const id=REVIEW_SITES[o.siteIndex].id;await saveData('overlap-check_'+id+'_TEST_ONLY',o.data);await saveData('overlap-check_'+id+'_previous-order_TEST_ONLY',o.previous);}
 const report={
  status:'PROTOTYPE ONLY — NOT GENERATED CLIMATE, NOT HISTORY',
  sourceSHA:process.env.REVIEW_SOURCE_SHA??'unverified-local',
  seed,year,reference:'Real saved terrain and architecture; forced visual-only species trial',
  baselineSites:prepared.map(x=>({site:x.siteId,buildings:x.realBuildings,housingBlocks:x.realHousingBlocks})),
  biomes:REVIEW_BIOMES.map(x=>({id:x.id,label:x.label})),
  styles:REVIEW_STYLES.map(x=>({id:x.id,label:x.label})),
  layerOrder:['background (terrain, ground, canals, public spaces, bridges)','biome soil tint (land cells only)','confirmed structures (transparent layer)','plants: undergrowth, then trees by root y'],
  layerOrderNote:'Every plant is drawn over every structure. This is an occlusion trial, not a depth sort.',
  counts,frames:results.map(x=>({biome:x.biome,site:REVIEW_SITES[x.siteIndex].id,style:x.style,clipped:x.clipped,occlusion:x.occlusion})),
  mostOccludedHybridExamples:examples.map(e=>({name:exampleName(e),occlusion:images.get(exampleName(e)).occlusion})),
  overlapChecks:overlapChecks.map(({data,previous,...o})=>({...o,site:REVIEW_SITES[o.siteIndex].id})),
  assets:artifacts
 };
 await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
 const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const pct=v=>(Math.round(v*1000)/10).toFixed(1)+'%';
 const share=o=>'建物の遮蔽 '+pct(o.occludedShare)+'（'+o.occludedStructurePixels+'/'+o.structurePixels+'px、うち樹木 '+o.occludedByTrees+'px）';
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
  '<p>各地区内ではA/B/Cで植物の根元・種類・本数・観測年は同じです。A＝PR #126の輪郭、B＝PR #127の6個体差、C＝近景の主木をA、その他をB。<b>描画順は 背景→地表色→建物→植物</b>。植物が建物を隠す見え方を確認するための順序で、奥行きによる前後判定はしていません（奥の木も手前の建物を覆います）。各画像の下の数値は、建物の画素のうち植物に覆われた割合です。原寸320×180で評価してください。</p>'+
  '<h2>実ゲーム描画（変更前の参照）</h2>'+baseline+
  '<h2>遮蔽の代表例（C統合版で建物が最も多く隠れた6画面）</h2><p class="note">左＝以前の描画順（建物が植物の上）、中＝現在（植物が建物の上）、右＝遮蔽図（<b style="color:#e628aa">桃色</b>＝植物に隠れた建物、白＝見えている建物）。植物の大きさ・本数・位置は変えていない。</p>'+
  examples.map(e=>{const n=exampleName(e);return '<div class="scroll"><table><tr><td>'+img('previous-order_'+n)+'<small>以前の順序</small></td><td>'+img(n)+'<small>現在の順序｜'+share(images.get(n).occlusion)+'</small></td><td>'+img('occlusion-map_'+n)+'<small>遮蔽図｜'+esc(n)+'</small></td></tr></table></div>';}).join('')+
  '<h2>確実に重なる検証画面（TEST ONLY、63枚に含まない）</h2><p class="note">各地区で実在の建物の手前4pxにC方式の落葉広葉樹を1本だけ置いた画面（根元y≥142ならA造形、入り江のように手前に建物がない地区ではB造形）。画素単位で植物が前面にあることを検証している。</p>'+
  overlapChecks.map(o=>{const id=REVIEW_SITES[o.siteIndex].id;return '<div class="scroll"><table><tr><td>'+img('overlap-check_'+id+'_previous-order_TEST_ONLY')+'<small>以前の順序</small></td><td>'+img('overlap-check_'+id+'_TEST_ONLY')+'<small>現在｜'+share(o.occlusion)+'</small></td></tr></table></div>';}).join('')+
  rows+
  '<p class="note">次のHumanレビュー：建築の見え方・木の大きさ・各バイオームの形態差・局所水分・静かな余白。植物の数値的な成長・遷移、セーブと季節はB2以降です。</p></main></html>';
 await writeFile(out+'/gallery.html',html);
 console.log(JSON.stringify({type:'issue47-b1b',status:'review-only',seed,year,frames:results.length,
  originals:prepared.length,artifacts:artifacts.length,maxHybridOcclusion:examples[0]&&images.get(exampleName(examples[0])).occlusion,
  overlapChecks:overlapChecks.map(o=>o.occlusion.occludedByTrees),sites:prepared.map(s=>s.siteId),out, report:out+'/report.json'}));
}finally{await browser?.close();server.kill();}
