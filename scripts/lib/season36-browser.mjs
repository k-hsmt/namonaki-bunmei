/** Issue #36 D1: browser-only, read-only seasonal landscape trial.
 * Imports current game components, but NEVER changes the owned world or any game source.
 * Controlled phase is only an argument to draw(); it is not saved or passed to the engine.
 */
import {createNewArchitectureWorld} from '/story/new-world.js';
import {advanceArchitectureWorld} from '/architecture/production-v1.js';
import {architectureProductionSession,observeGeneratedWorldSession,drawWorldSession,worldStructurePainter} from '/story/world-session.js';
import {projectScenePaint,withoutLandscapePlants,drawGeneratedSceneReview,sceneStructureDrawer} from '/scene/draw-generated-review.js';
import {prepareSceneFlora,sceneOccupiedPlots,structureGroundLines} from '/scene/flora-draw.js';
import {planFloraScene,rasterizeFlora,composeFlora} from '/flora/flora-scene-v1.js';
import {readOwnedRecordPhysics} from '/terrain/owned-record-physics.js';
import {drawMiniature} from '/architecture/miniature-v1.js';
import {appearance,visualHash,PHASES} from '/__season36_lib__.js';

const W=320,H=180;
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const SNOW=rgb('#e1e6dc'),OCHRE=rgb('#b79865'),WET=rgb('#657c67'),SPRING=rgb('#92b773');
const blend=(data,k,col,t)=>{for(let j=0;j<3;j++)data[k+j]=Math.round(data[k+j]*(1-t)+col[j]*t);};
const clip=n=>Math.max(0,Math.min(1,n));
const image=(c)=>c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,W,H);
function canvas(){const c=document.createElement('canvas');c.width=W;c.height=H;return c;}
function peopleAndClouds(ctx,p){
 for(const {x,y} of p.clouds){
  ctx.fillStyle=p.drought?'#c4c3aa':'#e9e1cb';ctx.fillRect(x+4,y,19,3);ctx.fillRect(x,y+3,31,5);ctx.fillRect(x+8,y-3,10,4);
 }
}
function people(ctx,p){
 for(const [i,[x,y]]of p.people.entries()){
  ctx.fillStyle='#d2b894';ctx.fillRect(x,y-6,2,2);
  ctx.fillStyle=['#66594f','#b29b74','#667a70'][i%3];ctx.fillRect(x,y-4,2,3);
  ctx.fillStyle='#454e48';ctx.fillRect(x,y-1,2,2);
 }
}
function drawMirrored(ctx,mirror,fn){
 ctx.save();if(mirror){ctx.translate(320,0);ctx.scale(-1,1);}fn();ctx.restore();
}
/** Snow on ground is visual only. A 7×5-ish clump hash avoids a full-screen white filter. */
function seasonalGround(data,p,phase,site){
 const {physics,mirror,seed,occupied}=site;
 const cover=clip(p.snow*.92),wet=p.wetness,dy=p.dryness;
 const covered=(x,y)=>occupied.some(z=>x>=z.x&&x<z.x+z.width&&y>=z.y&&y<z.y+z.depth);
 let snowPixels=0,changed=0;
 for(let y=96;y<H;y++)for(let x=0;x<W;x++){
  const rx=mirror?319-x:x,j=y*W+rx;
  if(physics.surface[j]!==1||physics.bearing[j]!==0||covered(rx,y))continue;
  const k=(y*W+x)*4,old=[data[k],data[k+1],data[k+2]];
  if(phase===2)blend(data,k,OCHRE,.10+.13*dy);
  else if(phase===0)blend(data,k,SPRING,.035*(1-dy));
  if(phase===1&&wet>.2)blend(data,k,WET,.055*wet);
  const block=visualHash(seed,Math.floor(rx/9),Math.floor(y/6),site.index*107);
  const detail=visualHash(seed,rx,y,site.index+36);
  // More cover gives larger patches; keep broken edges even at high cover.
  const snowy=cover>.005 && (block%1000)/1000<cover &&
    ((detail%1000)/1000 < clip(cover*.58+.38));
  if(snowy){blend(data,k,SNOW,.64+.23*cover);snowPixels++;}
  if(data[k]!==old[0]||data[k+1]!==old[1]||data[k+2]!==old[2])changed++;
 }
 return {snowPixels,changed};
}
const autumnIds=new Set(['deciduous','riparian']);
const dryIds=new Set(['savanna','dryShrub','coldShrub','shrub','herb','wetland','understory']);
/** Changes only pixels of already recorded plants, keeping root and physical position. */
function seasonalFlora(site,p,phase){
 const ordered=[...site.plants].sort((a,b)=>a.y-b.y||Number(a.kind==='tree')-Number(b.kind==='tree')||a.x-b.x||a.id.localeCompare(b.id));
 const items=site.raster.items.map((it,i)=>{
  const plant=ordered[i];if(!plant)throw Error('Flora plan/raster mismatch');
  const autumn=autumnIds.has(plant.id),dry=dryIds.has(plant.id);
  const xs=[],ys=[],crown=[],cols=[];
  for(let n=0;n<it.x.length;n++){
   const r=it.rgba[n*4],g=it.rgba[n*4+1],b=it.rgba[n*4+2],a=it.rgba[n*4+3];
   const leaf=g>r*.86&&g>b*.91&&g>58;
   const x=it.x[n],y=it.y[n],h=visualHash(site.seed,x,y,i*157);
   let keep=1;
   if(leaf&&autumn){if(phase===0)keep=.72;if(phase===2)keep=.86;if(phase===3)keep=Math.max(.06,1-p.snow)*.20;}
   else if(leaf&&plant.id==='savanna'&&phase===3)keep=.23+.45*(1-p.dryness);
   else if(leaf&&dry&&phase===3)keep=.5+.35*(1-p.dryness);
   if(leaf&&(h%1000)/1000>keep)continue;
   let out=[r,g,b];if(leaf&&autumn&&phase===0)out=out.map((v,j)=>Math.round(v*.7+SPRING[j]*.3));
   if(leaf&&autumn&&phase===2)out=out.map((v,j)=>Math.round(v*(1-.68*p.autumn)+OCHRE[j]*.68*p.autumn));
   if(leaf&&dry&&phase>=2)out=out.map((v,j)=>Math.round(v*(1-.3*p.dryness)+OCHRE[j]*.3*p.dryness));
   xs.push(x);ys.push(y);crown.push(it.crown[n]);cols.push(...out,a);
  }
  // Light snow on real exposed plant-pixel top edges, so it follows swaying crowns.
  if(p.snow>.02){
   const occupancy=new Set(xs.map((x,k)=>ys[k]*W+x));
   for(let n=0;n<xs.length;n++){
    const x=xs[n],y=ys[n],isTop=!occupancy.has((y-1)*W+x);
    if(!isTop)continue;
    if((visualHash(site.seed,x,y,i+897)%1000)/1000>=p.snow*.8)continue;
    const k=n*4;for(let j=0;j<3;j++)cols[k+j]=Math.round(cols[k+j]*.25+SNOW[j]*.75);
   }
  }
  return {root:it.root,tree:it.tree,x:Int16Array.from(xs),y:Int16Array.from(ys),crown:Uint8Array.from(crown),rgba:Uint8ClampedArray.from(cols)};
 });
 const layer=composeFlora({items,trees:site.raster.trees}),behind=new ImageData(W,H),front=new ImageData(W,H);
 for(let i=0;i<W*H;i++){
  if(layer.root[i]<0||layer.rgba[i*4+3]===0)continue;
  const dst=site.structPixels[i*4+3]&&layer.root[i]>site.depth[i]?front:behind;
  for(let j=0;j<4;j++)dst.data[i*4+j]=layer.rgba[i*4+j];
 }
 return {behind,front};
}
/** Roof top of each column is from the game's exact miniature sprite, not guessed from pixels/colours.
 * Non-miniature facilities and unrecorded roofs are intentionally NOT painted in D1.
 */
function miniatureRoofEdges(site){
 const births=site.session.architecture.architecture.births,year=site.year,parts=site.observation.composition.residentialBlocks.flatMap(b=>b.roofParts);
 const surfaces=[];let unsupported=0;
 for(const part of parts){
  if(part.condition==='ruined')continue;
  const index=Number(part.partId.slice(part.partId.lastIndexOf(':')+1));
  const matches=births.filter(b=>b.ref.kind==='housing'&&b.ref.blockId===part.blockId&&b.source.year<=year&&
    Number.isSafeInteger(index)&&b.ref.parts.from<=index&&index<b.ref.parts.to);
  const birth=matches.sort((a,b)=>b.source.year-a.source.year)[0];
  if(!birth){unsupported++;continue;}
  const tmp=canvas(),ctx=tmp.getContext('2d');
  drawMiniature({rect(x,y,w,h,col){ctx.fillStyle=col;ctx.fillRect(x,y,w,h);}}, {use:birth.use,...birth.features},part.x,part.y,part.depth);
  const d=image(tmp).data,byX=new Map();
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const k=(y*W+x)*4;if(!d[k+3]||byX.has(x))continue;
   const px=site.mirror?319-x:x,idx=y*W+px;
   if(site.structPixels[idx*4+3]&&site.depth[idx]===part.y)byX.set(x,idx);
  }
  surfaces.push([...byX.values()]);
 }
 return {surfaces,unsupported};
}
function seasonalRoofs(data,site,p){
 if(p.snow<.02)return 0;let n=0;
 for(const surface of site.roofs.surfaces)for(const i of surface){
  const y=Math.floor(i/W),x=i%W;
  if((visualHash(site.seed,x,y,912)%1000)/1000>p.snow*.9)continue;
  blend(data,i*4,SNOW,.64+.2*p.snow);n++;
 }
 return n;
}
function compose(site,phase,baseline=false){
 const p=appearance(site.session.climate,site.observation.ground.environment,phase),bg=canvas(),st=canvas();
 bg.getContext('2d').drawImage(site.backdrop,0,0);
 st.getContext('2d').drawImage(site.structures,0,0);
 let ground={snowPixels:0,changed:0},roofCount=0;
 if(!baseline){
  const z=image(bg);ground=seasonalGround(z.data,p,phase,site);bg.getContext('2d').putImageData(z,0,0);
  const s=image(st);roofCount=seasonalRoofs(s.data,site,p);st.getContext('2d').putImageData(s,0,0);
 }
 const f=baseline?{behind:image(site.originalBehind),front:image(site.originalFront)}:seasonalFlora(site,p,phase);
 const out=canvas(),ctx=out.getContext('2d');
 ctx.drawImage(bg,0,0);
 drawMirrored(ctx,site.mirror,()=>peopleAndClouds(ctx,site.paint.presentation));
 const put=data=>{const cv=canvas();cv.getContext('2d').putImageData(data,0,0);ctx.drawImage(cv,0,0);};
 put(f.behind);
 drawMirrored(ctx,site.mirror,()=>people(ctx,site.paint.presentation));
 ctx.drawImage(st,0,0);put(f.front);
 return {data:out.toDataURL('image/png'),p,ground,roofPixels:roofCount};
}
export async function createTrial(seed,year){
 if(!Number.isSafeInteger(seed)||!Number.isSafeInteger(year)||year<0||year>10000)throw Error('Invalid trial input');
 const created=await createNewArchitectureWorld(seed);
 const world=year?await advanceArchitectureWorld(created.architecture,year,'automatic'):created.architecture;
 const session=architectureProductionSession(world),stateBefore=JSON.stringify(session.state),sites=[];
 const painter=worldStructurePainter(session);
 for(let index=0;index<3;index++){
  const observation=observeGeneratedWorldSession(session,year,index);
  const paint=withoutLandscapePlants(projectScenePaint(observation));
  const backdrop=canvas(),structures=canvas();
  drawGeneratedSceneReview(backdrop,observation,'backdrop',paint,painter);
  drawGeneratedSceneReview(structures,observation,'structures',paint,painter);
  const flora=prepareSceneFlora(backdrop,structures,observation,painter.flora(observation),paint.presentation,sceneStructureDrawer(paint,painter));
  const source=painter.flora(observation),mirror=observation.ground.terrain.sites[observation.ground.site].render.mirrorX===true;
  const physics=readOwnedRecordPhysics(observation.ground.terrain.sites[observation.ground.site].physics);
  const plants=planFloraScene({seed,site:observation.ground.site,patches:source.patches,views:source.views,physics,occupied:sceneOccupiedPlots(observation)});
  const depth=structureGroundLines(observation,paint.presentation,sceneStructureDrawer(paint,painter));
  const original=canvas();drawWorldSession(original,session,year,index);
  const site={index,seed,year,session,observation,paint,backdrop,structures,originalBehind:flora.behind,originalFront:flora.front,plants,
   mirror,physics,occupied:sceneOccupiedPlots(observation),raster:rasterizeFlora(plants,mirror),depth,structPixels:image(structures).data,roofs:null};
  site.roofs=miniatureRoofEdges(site);
  const check=compose(site,year%4,true),a=image(original).data,b=Uint8ClampedArray.from(await (async()=>{const tmp=canvas(),im=new Image();im.src=check.data;await im.decode();tmp.getContext('2d').drawImage(im,0,0);return image(tmp).data;})());
  let mismatch=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])mismatch++;
  site.baselineDifferentChannels=mismatch;
  sites.push(site);
 }
 if(JSON.stringify(session.state)!==stateBefore)throw Error('A drawing modified the civilisation state');
 return Object.freeze({
  meta:{seed,year,biome:session.climate.dominantBiome,sites:sites.map(s=>({
   id:s.observation.ground.site,plants:s.plants.length,trees:s.plants.filter(p=>p.kind==='tree').length,
   roofs:s.roofs.surfaces.length,unsupportedHousingRoofs:s.roofs.unsupported,baselineChannelDifference:s.baselineDifferentChannels
  }))},
  draw(siteIndex,phase){if(!Number.isInteger(siteIndex)||siteIndex<0||siteIndex>2)throw Error('Invalid site');return compose(sites[siteIndex],phase);},
  unchanged(){return JSON.stringify(session.state)===stateBefore;}
 });
}
