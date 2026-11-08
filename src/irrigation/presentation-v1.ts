/** Canonical 320x180 channel cells shared by paint, walking, roots and motion. */
import type {ChannelView} from './production-types-v1.js';
const masks=new WeakMap<object,Uint8Array>();
export function channelMask(view:ChannelView|undefined):Uint8Array|undefined {
 const geometry=view?.geometry;if(!geometry)return;let mask=masks.get(geometry);if(!mask){mask=new Uint8Array(57600);for(const [x,y]of geometry.cells)mask[y*320+x]=1;masks.set(geometry,mask);}return mask;
}
export function clearChannelRoot(mask:Uint8Array|undefined,x:number,y:number,width=2,depth=2):boolean {if(!mask)return true;for(let dy=0;dy<depth;dy++)for(let dx=0;dx<width;dx++)if(mask[(y+dy)*320+x+dx])return false;return true;}
export function drawProductionCanal(c:CanvasRenderingContext2D,view:ChannelView|undefined):void {
 if(!view?.geometry)return;for(const [i,[x,y]]of view.geometry.cells.entries()){c.fillStyle=view.channel?.status==='active'?(i%7===0?'#8db6b5':'#568f9c'):view.channel?.status==='abandoned'?'#968766':view.channel?.status==='idle'?'#aa966d':i%5===0?'#71674f':'#ac8d63';c.fillRect(x,y,1,1);}
}
