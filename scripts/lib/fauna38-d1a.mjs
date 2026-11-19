/**
 * Issue #38 D1a controlled PIXEL-ART SILHOUETTE + MOTION trial.
 * Standalone, NOT the world's fauna history, habitats, terrain, plants or scene renderer.
 * Compare sprites against the real architecture grammar and current 2x6px human scale.
 * All positions are illustrative fixture coordinates, never inferred animal presence.
 */
import {Raster} from './pixel-raster.mjs';
import {drawArchitecture} from '../../dist/architecture/draw-v1.js';

export const FAUNA_D1A_RULE='fauna-d1a-controlled-sprites-v1';
export const WIDTH=320,HEIGHT=180;
export const FRAMES=Object.freeze([0,1,2,3,4,5,6,7]);
export const STYLES=Object.freeze([{id:'restrained',label:'A：控えめな輪郭'},{id:'legible',label:'B：識別しやすい輪郭'}]);
export const DEPTHS=Object.freeze([
 {id:'far',label:'遠景',factor:.46,root:125},
 {id:'middle',label:'中景',factor:.64,root:145},
 {id:'near',label:'近景',factor:.83,root:158},
]);
export const ANIM_STARTS=Object.freeze([0,2,4.2,6.2,8,8.5,9,9.5]);
export const ANIM_CYCLE=12;
export const SPECIES=Object.freeze([
 {id:'deer',label:'シカ類',category:'野生の大型草食動物',scale:1,habitat:'land',palette:['#86664e','#654b3e','#b79977','#dfc49a']},
 {id:'wild_equine',label:'野生のウマ類',category:'野生の大型草食動物',scale:1,habitat:'land',palette:['#787166','#514e49','#a49c86','#d5c6a1']},
 {id:'hare',label:'ノウサギ型の小動物',category:'野生の小型動物',scale:.8,habitat:'land',palette:['#8f795c','#615747','#c5ad8a','#ddd3ae']},
 {id:'songbird',label:'小鳥',category:'人里にも適応する野生の鳥',scale:.67,habitat:'land',palette:['#777a62','#4d594e','#bca985','#ead9b0']},
 {id:'waterbird',label:'水鳥',category:'水辺の野生の鳥',scale:.7,habitat:'water',palette:['#798e85','#4f6663','#c9c7b2','#e5d9b1']},
 {id:'flying_bird',label:'飛翔する鳥',category:'野生の飛翔鳥',scale:.8,habitat:'air',palette:['#667b78','#425651','#a2b5a8','#d9d4ae']},
]);
const get=(items,id,label)=>{const x=items.find(v=>v.id===id);if(!x)throw Error('Unknown D1a '+label+' '+id);return x;};
export function frameOf(seconds){
 if(!Number.isFinite(seconds)||seconds<0)throw Error('Invalid D1a animation second');
 const t=seconds%ANIM_CYCLE;
 for(let i=ANIM_STARTS.length-1;i>=0;i--)if(t>=ANIM_STARTS[i])return i;
 return 0;
}
const R=(r,x,y,w,h,c)=>r.rect(x,y,w,h,c);
/** Logical sprite design units, no Canvas, no browser, no procedural life-history. */
export function drawAnimalSprite(speciesId,styleId,frame){
 const species=get(SPECIES,speciesId,'species');get(STYLES,styleId,'style');
 if(!FRAMES.includes(frame))throw Error('Unknown D1a frame');
 const r=new Raster(24,22),[base,dark,light,accent]=species.palette,read=styleId==='legible';
 const c=(x,y,w,h,color=base)=>R(r,x,y,w,h,color),feed=frame===2||frame===3,
 walk=frame===4||frame===5||frame===6;
 const step=walk?frame%2:0;
 switch(speciesId){
  case 'deer':{
   c(3,9,11,4);c(4,8,9,1,light);c(2,10,2,2,dark); // body and tail
   c(12,6,3,5);c(13,5,2,3,light);
   if(feed){c(14,9,3,3);c(16,11,3,2,dark);c(17,12,2,1,accent);}
   else{c(14,5,4,3);c(17,7,2,1,dark);c(14,4,1,2,dark);}
   for(const [x,offset] of [[5,step],[11,step?0:1]]){
    c(x,13,2,4-offset,dark);c(x+(step&&x===11?1:0),17-offset,1,2,dark);
   }
   if(read){c(5,9,5,1,light);c(feed?17:16,feed?11:6,1,1,accent);
    if(!feed){c(14,2,1,4,dark);c(13,3,1,1,dark);c(16,3,1,3,dark);}}
   break;
  }
  case 'wild_equine':{
   c(3,8,13,5);c(4,8,7,1,light);c(2,8,2,4,dark);
   c(14,5,3,6,dark);c(15,4,2,3);
   if(feed){c(16,9,4,3);c(19,11,2,1,dark);}
   else{c(16,5,4,3);c(19,7,2,1,dark);}
   for(const x of [5,13]){c(x,13,2,4-(walk?step:0),dark);c(x+(walk&&x===13?1:0),17-(walk?step:0),1,3,dark);}
   if(read){c(5,9,9,1,light);c(15,4,1,3,light);c(16,2,2,3,dark);c(18,feed?11:6,1,1,accent);
    c(2,6,1,4,dark);}
   break;
  }
  case 'hare':{
   const lift=walk&&frame===5?2:0;
   c(5,12-lift,8,4);c(11,10-lift,4,4);c(4,12-lift,2,2,light);
   c(12,6-lift,2,5,dark);c(14,7-lift,1,3,dark);
   c(7,16-lift,4,2,dark);c(13,15-lift,3,2,dark);
   if(read){c(6,12-lift,5,1,light);c(13,10-lift,1,1,accent);c(15,12-lift,1,1,light);}
   break;
  }
  case 'songbird':{
   const hop=walk&&frame===5?2:0;
   c(7,11-hop,7,4);c(12,9-hop,4,4);c(15,11-hop,2,1,accent);c(5,11-hop,3,2,dark);
   c(9,13-hop,3,2,dark);c(11,15-hop,1,2,dark);
   if(feed){c(15,13-hop,2,1,accent);}
   if(read){c(9,11-hop,3,2,light);c(14,10-hop,1,1,dark);c(8,9-hop,3,2,dark);}
   break;
  }
  case 'waterbird':{
   c(4,12,12,4);c(5,12,9,1,light);c(4,15,12,1,dark);
   c(13,8,3,5);c(14,6,3,3,light);c(16,8,4,1,accent);c(3,11,3,2,dark);
   if(feed){c(16,10,2,3,light);c(17,12,2,1,accent);}
   if(read){c(7,13,5,1,light);c(15,7,1,1,dark);c(10,11,4,2,dark);}
   break;
  }
  case 'flying_bird':{
   const wing=frame%4;const bodyY=10+(frame===3?1:0);
   c(9,bodyY,6,3);c(14,bodyY-1,3,2);c(17,bodyY,2,1,accent);c(6,bodyY+1,3,2,dark);
   if(wing===0){c(6,bodyY-3,8,2,dark);c(11,bodyY-5,3,2,light);}
   else if(wing===1){c(9,bodyY-7,3,7,dark);c(11,bodyY-5,2,2,light);}
   else if(wing===2){c(4,bodyY+1,9,2,dark);c(8,bodyY+3,6,2,light);}
   else{c(6,bodyY+1,7,3,dark);c(11,bodyY+3,3,3,light);}
   if(read){c(12,bodyY,2,1,light);c(16,bodyY-1,1,1,dark);}
   break;
  }
 }
 return r;
}
export function animalBounds(r){
 let minX=Infinity,minY=Infinity,maxX=-1,maxY=-1,count=0;
 for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){
  const i=(y*r.width+x)*4;
  if(!r.data[i+3])continue;count++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
 }
 return count?{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1,pixels:count}:null;
}
function putScaled(r,sprite,anchorX,anchorY,scale){
 const root=19,offset=12;let rendered=0;
 for(let y=0;y<sprite.height;y++)for(let x=0;x<sprite.width;x++){
  const k=(y*sprite.width+x)*4;if(!sprite.data[k+3])continue;
  const dx=anchorX+Math.round((x-offset)*scale),dy=anchorY+Math.round((y-root)*scale);
  const color='#'+[sprite.data[k],sprite.data[k+1],sprite.data[k+2]].map(v=>v.toString(16).padStart(2,'0')).join('');
  r.rect(dx,dy,Math.max(1,Math.round(scale)),Math.max(1,Math.round(scale)),color);rendered++;
 }
 return rendered;
}
/** An explicitly illustrative stage, not the game terrain or a verified animal habitat. */
export function referenceStage(speciesId){
 const s=get(SPECIES,speciesId,'species'),r=new Raster(WIDTH,HEIGHT);
 for(let y=0;y<100;y++){
  const sky=y<75?'#bdccc4':y<88?'#b0beb2':'#a6b5a8';r.rect(0,y,WIDTH,1,sky);
 }
 for(let x=0;x<WIDTH;x++){
  const ridge=91-((Math.floor(x/47)*5+Math.floor(x/21))%13);
  r.rect(x,ridge,1,107-ridge,'#97aa99');
 }
 r.rect(0,107,WIDTH,HEIGHT-107,'#8d9b78');
 r.rect(0,147,WIDTH,HEIGHT-147,'#829270');
 for(let x=0;x<WIDTH;x+=8)for(let y=118;y<HEIGHT;y+=13)
  if((x*7+y*11)%31<7)r.rect(x+(y%3),y,2,1,'#748863');
 // Context oak: volume, trunk and canopy at a controlled (non-simulated) location.
 r.rect(55,108,5,41,'#655848');r.rect(51,130,4,5,'#655848');r.rect(60,125,4,5,'#655848');
 for(const [x,y,w,h] of [[39,92,32,13],[43,83,26,15],[49,77,18,11],[34,103,43,9]]){
  r.rect(x,y,w,h,'#637f63');r.rect(x+3,y+1,w-6,2,'#7d9477');
 }
 // Real architecture grammar reference (size override only).
 drawArchitecture(r,{use:'house',structure:'S02',wall:'plank',roofFamily:'R01',roofMaterial:'shingle',
  foundation:'F2',palette:'P01',pitch:'mid',eaves:'normal',window:'W2',entrance:'E1',
  ornaments:[],storeys:1},250,147,{width:42,height:21});
 // Real scene's current human scale reference: 2x6px.
 r.rect(214,147,2,2,'#d2b894');r.rect(214,149,2,3,'#66594f');r.rect(214,152,2,1,'#454e48');
 if(s.habitat==='water'){
  r.rect(101,133,103,36,'#7ea2a0');r.rect(105,136,96,31,'#80aaa9');
  for(let i=0;i<9;i++){const x=113+i*10,y=142+i%3*7;r.rect(x,y,5,1,'#9fc0b7');}
  for(const [x,y] of [[101,142],[199,150],[104,158]]){r.rect(x,y-6,1,7,'#667f65');r.rect(x+2,y-4,1,5,'#667f65');}
 }
 // No drawn animal here. A variant is the *only* differing subject.
 return r;
}
export function renderFaunaD1a({speciesId,styleId,depthId,frame}){
 const species=get(SPECIES,speciesId,'species'),depth=get(DEPTHS,depthId,'depth');
 get(STYLES,styleId,'style');
 if(!FRAMES.includes(frame))throw Error('Unknown D1a frame');
 const sprite=drawAnimalSprite(speciesId,styleId,frame);
 const bounds=animalBounds(sprite);if(!bounds)throw Error('Empty D1a sprite');
 const scale=depth.factor*species.scale;
 const delta=speciesId==='flying_bird'?[0,2,4,6,8,9,6,3][frame]:
  [0,0,0,0,1,3,2,0][frame];
 const x=148+delta,root=species.habitat==='air'?depth.root-13:depth.root;
 const result=referenceStage(speciesId),rendered=putScaled(result,sprite,x,root,scale);
 return {raster:result,sprite,metrics:{...bounds,rendered,displayScale:scale,anchorX:x,anchorY:root},fixture:{habitat:species.habitat,frame,depth:depthId}};
}
