/** Issue #47 B1a: isolated pixel-sprite review contract. No game history/RNG. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

// Small canvas adapter used solely to inspect deterministic pixels without a browser.
class Canvas {
  constructor(){this._width=300;this._height=150;this.data=Buffer.alloc(300*150*4)}
  get width(){return this._width} set width(n){this._width=n;this.data=Buffer.alloc(n*this._height*4)}
  get height(){return this._height} set height(n){this._height=n;this.data=Buffer.alloc(this._width*n*4)}
  getContext(){const canvas=this;return {
    fillStyle:'#000000',imageSmoothingEnabled:false,
    fillRect(x,y,w,h){const color=this.fillStyle;assert.match(color,/^#[0-9a-f]{6}$/);const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));for(let yy=Math.max(0,Math.floor(y));yy<Math.min(canvas.height,Math.ceil(y+h));yy++)for(let xx=Math.max(0,Math.floor(x));xx<Math.min(canvas.width,Math.ceil(x+w));xx++){const o=(yy*canvas.width+xx)*4;canvas.data[o]=rgb[0];canvas.data[o+1]=rgb[1];canvas.data[o+2]=rgb[2];canvas.data[o+3]=255}},
    drawImage(src,...a){const [sx,sy,sw,sh,dx,dy,dw,dh]=a.length===2?[0,0,src.width,src.height,a[0],a[1],src.width,src.height]:a;assert.equal(a.length===2||a.length===8,true);for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){const xx=dx+x,yy=dy+y;if(xx<0||yy<0||xx>=canvas.width||yy>=canvas.height)continue;const rx=Math.floor(sx+x*sw/dw),ry=Math.floor(sy+y*sh/dh),from=(ry*src.width+rx)*4,to=(yy*canvas.width+xx)*4;if(src.data[from+3])src.data.copy(canvas.data,to,from,from+4)}},
    getImageData(){return {data:canvas.data}}
  }}
}
const html=readFileSync(new URL('../docs/prototypes/issue47-b1a.html',import.meta.url),'utf8');
const match=html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match,'prototype source script exists');
const independent=match[1].split('const cards=document.querySelector')[0];
const ctx=vm.createContext({document:{createElement:t=>{assert.equal(t,'canvas');return new Canvas()}},console});
vm.runInContext(independent+'\n globalThis.exports={SPEC,renderPlant,contextPlate};',ctx,{timeout:2500});
const {SPEC,renderPlant,contextPlate}=ctx.exports;
const hash=c=>createHash('sha256').update(c.data).digest('hex');
const silhouette=c=>{const out=Buffer.alloc(c.width*c.height);for(let i=0;i<out.length;i++)out[i]=c.data[4*i+3]>0?1:0;return out.toString('hex')};
const coverage=c=>{let count=0;for(let i=3;i<c.data.length;i+=4)count+=c.data[i]!==0;return count};

test('13 fully named, unique plant archetypes',()=>{
 assert.equal(SPEC.length,13);assert.equal(new Set(SPEC.map(s=>s[0])).size,13);
 for(const s of SPEC){assert.equal(s.length,4);for(const word of s)assert.ok(word.length>0)}
});
test('all 13 adult and juvenile sprites have transparent 72x64 pixel art',()=>{
 for(const s of SPEC){const a=renderPlant(s[0]),y=renderPlant(s[0],true);
  assert.deepEqual([a.width,a.height,y.width,y.height],[72,64,72,64]);
  assert.ok(coverage(a)>100,s[0]);assert.ok(coverage(y)>30,s[0]);assert.ok(coverage(y)<coverage(a),s[0]);
  assert.ok(a.data.some((z,i)=>i%4===3&&z===0),s[0]);
  assert.equal(hash(renderPlant(s[0])),hash(a));assert.equal(hash(renderPlant(s[0],true)),hash(y));
 }
});
test('mature plant silhouettes are distinct, not only palette swaps',()=>{
 const shapes=SPEC.map(s=>silhouette(renderPlant(s[0])));
 assert.equal(new Set(shapes).size,13);
});
test('4 native-resolution 320x180 comparison plates are deterministic',()=>{
 const plates=[];for(let i=0;i<SPEC.length;i+=4){const group=SPEC.slice(i,i+4);const a=contextPlate(group),b=contextPlate(group);
  assert.deepEqual([a.width,a.height],[320,180]);assert.equal(hash(a),hash(b));plates.push(hash(a))}
 assert.equal(plates.length,4);assert.equal(new Set(plates).size,4);
});
test('no game imports or uncontrolled randomness in the prototype',()=>{
 assert.doesNotMatch(html,/\bimport\s*\(|\bfetch\s*\(|Math\.random\s*\(|Date\.now\s*\(/);
 assert.doesNotMatch(html,/<script\s+src=/);
});
