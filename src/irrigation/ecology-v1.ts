/** Recorded conveyance only; local head and actual occupation limit the wetted cells. */
import type {IrrigationContext} from './types-v1.js';
import type {ChannelState,ChannelSystem} from './review-types-v1.js';
import type {IrrigationPatchEffects} from '../environment/model-v1.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
const W=320,N=57600;
export const patchIndex=(x:number,y:number)=>Math.floor((y-96)/8)*40+Math.floor(x/8);
export function channelPatches(system:ChannelSystem):number[]{return [...new Set(system.geometry.cells.map(([x,y])=>patchIndex(x,y)))].sort((a,b)=>a-b);}
export function irrigationEffects(system:ChannelSystem|undefined,state:ChannelState|null,frame:Omit<IrrigationContext,'cause'>|undefined,disturbedPatches:readonly number[]=[]):IrrigationPatchEffects {
 const moisture=Array<number>(440).fill(0),occupiedPatches=system&&state&&state.status!=='retired'?channelPatches(system):[];
 if(!system||state?.status!=='active')return {moisture,occupiedPatches,disturbedPatches};
 if(!frame)throw Error('Active irrigation requires a confirmed frame');
 const r=readOwnedRecordPhysics(frame.ground.terrain.sites['river-bank'].physics),wet=irrigationWettedCells(system,frame),denominator=new Uint8Array(440),numerator=new Uint8Array(440);
 for(let y=96;y<180;y++)for(let x=0;x<W;x++){const i=y*W+x,k=patchIndex(x,y);if(r.surface[i]===1&&r.bearing[i]===0)denominator[k]!++;if(wet[i])numerator[k]!++;}
 for(let k=0;k<440;k++)if(denominator[k])moisture[k]=Math.min(24,Math.floor(24*numerator[k]!/denominator[k]!));
 return {moisture,occupiedPatches,disturbedPatches};
}

/** The same connected cells support ecology and the independent harvest comparison. */
export function irrigationWettedCells(system:ChannelSystem,frame:Omit<IrrigationContext,'cause'>):Uint8Array {
 const r=readOwnedRecordPhysics(frame.ground.terrain.sites['river-bank'].physics),g=system.geometry,blocked=new Uint8Array(N),eligible=new Uint8Array(N),wet=new Uint8Array(N);
 for(const o of frame.ground.occupancy){if(o.id===g.field.id)continue;const p=o.plot;for(let y=p.y;y<p.y+p.depth;y++)blocked.fill(1,y*W+p.x,y*W+p.x+p.width);}
 const offer=(x:number,y:number)=>{if(x>=0&&x<W&&y>=96&&y<180){const i=y*W+x;if(!blocked[i]&&r.surface[i]===1&&r.bearing[i]===0&&r.elevation[i]===g.intake.head)eligible[i]=1;}};
 for(const [x,y]of g.cells)offer(x,y);const p=g.field.plot;for(let y=p.y-2;y<p.y+p.depth+2;y++)for(let x=p.x-2;x<p.x+p.width+2;x++)offer(x,y);
 const queue=new Int32Array(N);let head=0,tail=0;for(const [x,y]of g.cells){const i=y*W+x;if(eligible[i]&&!wet[i]){wet[i]=1;queue[tail++]=i;}}
 while(head<tail){const i=queue[head++]!,x=i%W,y=Math.floor(i/W);for(const j of [x>0?i-1:-1,x<319?i+1:-1,y>96?i-W:-1,y<179?i+W:-1])if(j>=0&&eligible[j]&&!wet[j]){wet[j]=1;queue[tail++]=j;}}
 return wet;
}
