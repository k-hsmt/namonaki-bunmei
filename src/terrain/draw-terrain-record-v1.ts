/** Frozen renderer v1. Draws saved results; no generator/prototype imports. */
import type {RecordSite} from './terrain-record-types.js';
import {readTerrainPhysicalSource,type TerrainPhysicalSource} from './terrain-revision-v1.js';
import {decodeRecordPhysics} from './terrain-record-raster-v1.js';
export function drawTerrainRecord(canvas:HTMLCanvasElement,record:TerrainPhysicalSource,site:RecordSite):void {
 record=readTerrainPhysicalSource(record);
 const s=record.sites[site],r=decodeRecordPhysics(s.physics);
 canvas.width=320;canvas.height=180;const c=canvas.getContext('2d');if(!c)throw Error('2d context missing');c.imageSmoothingEnabled=false;
 c.fillStyle='#bdc9bb';c.fillRect(0,0,320,96);c.fillStyle='#d8cfad';c.fillRect(0,53,320,43);
 for(const [paths,colors] of [[s.render.far,['#9da991','#8c9b80']],[s.render.middle,['#87926d']]] as const){
  paths.forEach((p,i)=>{c.fillStyle=colors[Math.min(i,colors.length-1)]!;c.beginPath();c.moveTo(p[0]![0],p[0]![1]);for(const q of p.slice(1))c.lineTo(q[0],q[1]);c.closePath();c.fill();});
 }
 for(let y=site==='river-bank'?95:96;y<180;y++)for(let x=0;x<320;x++){
  const i=y*320+x,surface=r.surface[i],b=r.bearing[i],h=r.elevation[i]!;
  c.fillStyle=site==='hill-side'?(b===2?'#858575':h===0?'#a2a17a':h<8?'#9b9f75':h<16?'#a9a67d':'#b3ae85'):
   site==='river-bank'?(surface===2?(y%13===0&&x%19<8?'#8aadb0':'#6c999e'):'#9b9e78'):
   b===2?'#858575':b===1?'#c7b78a':surface===3?'#739aa9':surface===2?'#6c999e':'#a2a17a';
  c.fillRect(x,y,1,1);
 }
 for(const [x,y,w,h,color] of s.render.decals){c.fillStyle=color;c.fillRect(x,y,w,h);}
 if(s.render.mirrorX){
  const copy=canvas.ownerDocument.createElement('canvas');copy.width=320;copy.height=180;copy.getContext('2d')!.drawImage(canvas,0,0);
  c.save();c.setTransform(-1,0,0,1,320,0);c.drawImage(copy,0,0);c.restore();
 }
}
