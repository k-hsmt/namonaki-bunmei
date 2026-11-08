/** View-only flow lines, derived from saved water and outlet/shore geometry. */
import type {RecordPoint} from '../terrain/terrain-record-types.js';
import type {RecordRaster} from '../terrain/terrain-record-raster-v1.js';
export interface WaterTrack {readonly kind:'river'|'sea';readonly path:readonly RecordPoint[];readonly phase:number;readonly width:number}
const W=320,H=180,N=W*H;
const neighbors=(i:number)=>{const x=i%W,y=Math.floor(i/W);return [y<H-1?i+W:-1,x>0?i-1:-1,x<W-1?i+1:-1,y>96?i-W:-1].filter(j=>j>=96*W);};
function distances(r:RecordRaster,surface:number,roots:readonly number[]){
 const d=new Int32Array(N);d.fill(-1);const queue=new Int32Array(N);let head=0,tail=0;
 for(const i of roots)if(r.surface[i]===surface&&d[i]!<0){d[i]=0;queue[tail++]=i;}
 while(head<tail){const i=queue[head++]!;for(const j of neighbors(i))if(r.surface[j]===surface&&d[j]!<0){d[j]=d[i]!+1;queue[tail++]=j;}}
 return d;
}
export function planWaterTracks(r:RecordRaster,outlets:readonly RecordPoint[],anchors:readonly {point:RecordPoint;phase:number}[]):WaterTrack[]{
 const exits:number[]=[],shore:number[]=[];
 for(const [x,y] of outlets){let nearest=-1,best=Infinity;for(let i=96*W;i<N;i++)if(r.surface[i]===2){const d=Math.abs(i%W-x)+Math.abs(Math.floor(i/W)-y);if(d<best){best=d;nearest=i;}}if(nearest>=0)exits.push(nearest);}
 // A hidden river mouth may join visible sea or leave the lower edge.
 if(!outlets.length)for(let i=96*W;i<N;i++)if(r.surface[i]===2&&(i>=(H-1)*W||neighbors(i).some(j=>r.surface[j]===3)))exits.push(i);
 for(let i=96*W;i<N;i++)if(r.surface[i]===3&&neighbors(i).some(j=>r.surface[j]===1))shore.push(i);
 const river=distances(r,2,exits),sea=distances(r,3,shore),tracks:WaterTrack[]=[];
 for(const a of anchors){const start=a.point[1]*W+a.point[0],kind=r.surface[start]===2?'river':'sea',d=kind==='river'?river:sea;if(d[start]!<3)continue;
  const path:RecordPoint[]=[a.point];let i=start;
  for(let n=0;n<12;n++){const next=neighbors(i).find(j=>d[j]===d[i]!-1&&d[j]!>=0);if(next===undefined)break;i=next;path.push([i%W,Math.floor(i/W)]);}
  if(path.length>=4)tracks.push({kind,path,phase:a.phase%97,width:kind==='river'?3+a.phase%3:4+a.phase%3});
 }
 return tracks;
}
export function waterStrokeAt(track:WaterTrack,seconds:number){
 const steps=track.path.length-1,position=(seconds*(track.kind==='river'?2.2:1.1)+track.phase)%steps,index=Math.floor(position),point=track.path[index]!,next=track.path[index+1]!;
 return {point,vertical:track.kind==='sea'&&Math.abs(next[0]-point[0])>Math.abs(next[1]-point[1]),alpha:Math.sin(Math.PI*position/steps)*.65};
}
