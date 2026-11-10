/** 試作ギャラリー用の最小ラスタとPNG書き出し。ブラウザ・Canvasに依存しない。 */
import {deflateSync} from 'node:zlib';
const table=new Uint32Array(256).map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc=b=>{let c=0xffffffff;for(const v of b)c=table[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
const chunk=(type,data)=>{const out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);out.write(type,4,'latin1');data.copy(out,8);
 out.writeUInt32BE(crc(out.subarray(4,8+data.length)),8+data.length);return out;};
export class Raster{
 constructor(width,height){this.width=width;this.height=height;this.data=new Uint8Array(width*height*4);}
 rect(x,y,w,h,color){
  if(![x,y,w,h].every(Number.isInteger))throw Error('non-integer pixel rect');
  const r=parseInt(color.slice(1,3),16),g=parseInt(color.slice(3,5),16),b=parseInt(color.slice(5,7),16);
  if(!/^#[0-9a-f]{6}$/.test(color))throw Error('invalid color '+color);
  for(let yy=Math.max(0,y);yy<Math.min(this.height,y+h);yy++)for(let xx=Math.max(0,x);xx<Math.min(this.width,x+w);xx++){
   const i=(yy*this.width+xx)*4;this.data[i]=r;this.data[i+1]=g;this.data[i+2]=b;this.data[i+3]=255;}
 }
 /** 不透明画素だけを重ねる。 */
 blit(src,dx,dy){
  for(let y=0;y<src.height;y++)for(let x=0;x<src.width;x++){const i=(y*src.width+x)*4;if(!src.data[i+3])continue;
   const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=this.width||Y>=this.height)continue;const j=(Y*this.width+X)*4;this.data.set(src.data.subarray(i,i+4),j);}
 }
 scale(n){const out=new Raster(this.width*n,this.height*n);
  for(let y=0;y<out.height;y++)for(let x=0;x<out.width;x++){const i=((y/n|0)*this.width+(x/n|0))*4;out.data.set(this.data.subarray(i,i+4),(y*out.width+x)*4);}
  return out;}
 mask(){let s='';for(let i=3;i<this.data.length;i+=4)s+=this.data[i]?'1':'0';return s;}
 png(){
  const raw=Buffer.alloc((this.width*4+1)*this.height);
  for(let y=0;y<this.height;y++)Buffer.from(this.data.buffer,y*this.width*4,this.width*4).copy(raw,y*(this.width*4+1)+1);
  const head=Buffer.alloc(13);head.writeUInt32BE(this.width,0);head.writeUInt32BE(this.height,4);head[8]=8;head[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
 }
}
/** 2枚の同寸ラスタの相違：輪郭（不透明域）と全画素。 */
export function difference(a,b){
 if(a.width!==b.width||a.height!==b.height)throw Error('size mismatch');
 let silhouette=0,pixels=0;
 for(let i=0;i<a.data.length;i+=4){
  if(!!a.data[i+3]!==!!b.data[i+3])silhouette++;
  if(a.data[i]!==b.data[i]||a.data[i+1]!==b.data[i+1]||a.data[i+2]!==b.data[i+2]||a.data[i+3]!==b.data[i+3])pixels++;
 }
 return {silhouette,pixels};
}
