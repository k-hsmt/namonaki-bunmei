/** Frozen result verifier v1. Must never import a generator or prototype module. */
import type {RecordShape,RecordPhysics,RecordCell,CellRun} from './terrain-record-types.js';
export interface RecordRaster {surface:Uint8Array;grade:Uint8Array;bearing:Uint8Array;elevation:Uint8Array}
export function emptyRecordRaster():RecordRaster{return {surface:new Uint8Array(57600),grade:new Uint8Array(57600),bearing:new Uint8Array(57600),elevation:new Uint8Array(57600)};}
function contains(p:RecordShape['polygon'],x:number,y:number):boolean {
 let on=false;for(let i=0,j=p.length-1;i<p.length;j=i++){
  const a=p[i]!,b=p[j]!;if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])on=!on;
 }return on;
}
export function rasterizeRecordShapes(shapes:readonly RecordShape[],hillGrade:boolean):RecordRaster {
 const r=emptyRecordRaster();
 for(const s of shapes){
  const minX=Math.max(0,Math.floor(Math.min(...s.polygon.map(p=>p[0])))),maxX=Math.min(320,Math.ceil(Math.max(...s.polygon.map(p=>p[0]))));
  const minY=Math.max(95,Math.floor(Math.min(...s.polygon.map(p=>p[1])))),maxY=Math.min(180,Math.ceil(Math.max(...s.polygon.map(p=>p[1]))));
  for(let y=minY;y<maxY;y++)for(let x=minX;x<maxX;x++){
  if(!contains(s.polygon,x+.5,y+.5))continue;
  const i=y*320+x;if(s.applyTo==='land'&&r.surface[i]!==1||s.applyTo==='freshwater'&&r.surface[i]!==2)continue;
  let elevation=s.elevation;
  if(s.profile){
   const q=s.profile.axis==='x'?x+.5:y+.5,k=s.profile.knots;
   elevation=k[k.length-1]![1];
   for(let n=1;n<k.length;n++){const a=k[n-1]!,b=k[n]!;if(q<=b[0]){elevation=Math.round(a[1]+(b[1]-a[1])*Math.max(0,Math.min(1,(q-a[0])/(b[0]-a[0]))));break;}}
  }
  r.surface[i]=s.kind==='freshwater'?2:s.kind==='sea'?3:1;
  r.bearing[i]=s.kind==='cliff'?2:s.kind==='sandbar'?1:0;r.elevation[i]=elevation;
 }}
 for(let y=95;y<180;y++)for(let x=0;x<320;x++){
  const i=y*320+x;if(r.bearing[i]===2){r.grade[i]=2;continue;}
  if(!hillGrade||r.surface[i]!==1||y<96)continue;
  let difference=0;
  for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
   if(nx!<0||nx!>=320||ny!<96||ny!>=180)continue;
   difference=Math.max(difference,Math.abs(r.elevation[i]!-r.elevation[ny!*320+nx!]!));
  }r.grade[i]=Math.min(2,difference);
 }return r;
}
export function encodeRecordPhysics(r:RecordRaster):RecordPhysics {
 const rows:CellRun[][]=[];
 for(let y=0;y<180;y++){
  const row:CellRun[]=[];let start=0;
  const same=(a:number,b:number)=>r.surface[a]===r.surface[b]&&r.grade[a]===r.grade[b]&&r.bearing[a]===r.bearing[b]&&r.elevation[a]===r.elevation[b];
  for(let x=1;x<=320;x++)if(x===320||!same(y*320+start,y*320+x)){
   const i=y*320+start;row.push([x-start,r.surface[i]!,r.grade[i]!,r.bearing[i]!,r.elevation[i]!]);start=x;
  }rows.push(row);
 }return {encoding:'row-rle-v1',width:320,height:180,rows};
}
/** Caller validates row bounds before decoding. This decoder also bounds allocation/writes. */
export function decodeRecordPhysics(p:RecordPhysics):RecordRaster {
 if(p.rows.length!==180)throw Error('invalid RLE row count');const r=emptyRecordRaster();
 p.rows.forEach((row,y)=>{let x=0;if(row.length>320)throw Error('too many RLE runs');
  for(const [length,s,g,b,e] of row){if(!Number.isSafeInteger(length)||length<1||x+length>320)throw Error('invalid RLE length');
   r.surface.fill(s,y*320+x,y*320+x+length);r.grade.fill(g,y*320+x,y*320+x+length);
   r.bearing.fill(b,y*320+x,y*320+x+length);r.elevation.fill(e,y*320+x,y*320+x+length);x+=length;
  }if(x!==320)throw Error('incomplete RLE row');
 });return r;
}
export function sampleRecordPhysics(p:RecordPhysics,x:number,y:number):RecordCell|null {
 if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||x>=320||y<0||y>=180)return null;
 let end=0;for(const [n,surface,grade,bearing,elevation] of p.rows[y]!){end+=n;if(x<end)return {surface,grade,bearing,elevation};}return null;
}
