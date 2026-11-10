/** Issue #35 / D1：試作ギャラリーの語彙・整合・決定性・本編からの隔離。視覚の受入判定ではない。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Raster,difference} from '../scripts/lib/pixel-raster.mjs';
import * as A from '../scripts/lib/architecture-prototype.mjs';

const render=(spec,use=spec.use??'house')=>{const r=new Raster(96,72);A.drawBuilding(r,{...spec,use},48,60);return r;};
const useList=Object.keys(A.uses);

test('D1: 設計書§3のカタログ数を満たす',()=>{
 const count=o=>Object.keys(o).length;
 assert.deepEqual([count(A.roofs),count(A.structures),count(A.windows),count(A.entrances),count(A.ornaments),count(A.palettes),count(A.cultures),count(A.advancedSamples)],[8,7,6,7,8,6,6,3]);
 assert.ok(count(A.wallMaterials)>=9&&count(A.roofMaterials)>=6&&count(A.foundations)>=5);
});

test('D1: 形の各系統は同じ住宅・会堂で互いに異なる画素になる',()=>{
 const axes={
  roof:Object.keys(A.roofs).map(roof=>({roof,structure:'S01'})),
  structure:Object.keys(A.structures).map(structure=>({structure,entrance:structure==='S07'?'E5':'E1'})),
  window:Object.keys(A.windows).map(window=>({window,structure:'S01'})),
  entrance:Object.keys(A.entrances).map(entrance=>({entrance,deepEaves:entrance==='E3',...(entrance==='E5'?{foundation:'F2'}:{})})),
  ornament:[[],...Object.keys(A.ornaments).map(o=>[o])].map(ornaments=>({ornaments,structure:'S01',pitch:'high'})),
 };
 for(const [axis,list] of Object.entries(axes))for(const use of ['house','hall']){
  const frames=list.map(spec=>render(spec,use));
  for(let i=0;i<frames.length;i++){
   assert.ok(frames[i].mask().includes('1'),axis+' '+i+' drew nothing');
   for(let j=i+1;j<frames.length;j++)assert.ok(difference(frames[i],frames[j]).pixels>0,`${axis} ${use}: ${i} and ${j} are identical`);
  }
 }
});

test('D1: 屋根8系統は輪郭そのものが互いに異なる',()=>{
 const masks=Object.keys(A.roofs).map(roof=>render({roof,structure:'S01'}).mask());
 assert.equal(new Set(masks).size,8);
});

test('D1: 色（P01〜P05）だけを変えても輪郭は変わらない＝色は系統に数えない',()=>{
 const masks=['P01','P02','P03','P04','P05'].map(palette=>render({palette,structure:'S06',roofing:'tile'}).mask());
 assert.equal(new Set(masks).size,1);
 assert.deepEqual(A.formAxes({palette:'P01'}),A.formAxes({palette:'P03',faded:true}));
});

test('D1/A01: 代表文化6は全用途・全組で色以外に2軸以上異なり、輪郭も異なる',()=>{
 const keys=Object.keys(A.cultures);
 for(const use of useList)for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++){
  const a=A.cultureSpec(keys[i],use),b=A.cultureSpec(keys[j],use),x=A.formAxes(a),y=A.formAxes(b);
  const differing=Object.keys(x).filter(k=>x[k]!==y[k]);
  assert.ok(differing.length>=2,`${keys[i]}/${keys[j]} ${use}: ${differing}`);
  assert.ok(difference(render(a),render(b)).silhouette>0,`${keys[i]}/${keys[j]} ${use}: same silhouette`);
 }
});

test('D1: 同じ文化の中では用途ごとに輪郭が異なる（住宅を伸ばしただけにしない）',()=>{
 for(const key of [...Object.keys(A.cultures),...Object.keys(A.advancedSamples)]){
  const masks=useList.map(use=>render(A.cultureSpec(key,use)).mask());
  assert.equal(new Set(masks).size,useList.length,key);
 }
});

test('D1/A07: 高度技術サンプルでも住宅は高度構造にならない',()=>{
 for(const key of Object.keys(A.advancedSamples)){
  assert.match(A.formAxes(A.cultureSpec(key,'hall')).structure,/^X/);
  assert.match(A.formAxes(A.cultureSpec(key,'house')).structure,/^S/);
 }
});

test('D1: 支持・屋根・入口が成立しない組み合わせは描かずに拒否',()=>{
 const g=new Raster(96,72);
 for(const bad of [
  {structure:'S07',entrance:'E1'},{structure:'S04',foundation:'F5',entrance:'E5'},{entrance:'E3'},{entrance:'E5'},
  {roofing:'thatch',roof:'R05'},{roofing:'thatch',pitch:'low'},{roofing:'plaster',roof:'R01'},
  {wall:'metal'},{roofing:'metal'},{window:'W7'},{storeys:2},{structure:'X3',storeys:3},
  {roof:'R99'},{use:'castle'},{use:'fortress'},{ornaments:['O9']},
 ])assert.throws(()=>A.drawBuilding(g,bad,48,60),JSON.stringify(bad));
 assert.ok(!g.mask().includes('1'),'a rejected prototype painted pixels');
});

test('D1: 再描画・仕様の往復で画素が一致し、入力を書き換えない',()=>{
 for(const key of Object.keys(A.cultures))for(const use of useList){
  const spec=A.cultureSpec(key,use),frozen=JSON.stringify(spec);
  const a=render(spec),b=render(JSON.parse(frozen));
  assert.deepEqual(difference(a,b),{silhouette:0,pixels:0});
  assert.equal(JSON.stringify(spec),frozen);
 }
});

test('D1: 試作は本編から隔離されている',async()=>{
 const lib=await readFile('scripts/lib/architecture-prototype.mjs','utf8'),gallery=await readFile('scripts/preview-architecture.mjs','utf8');
 for(const source of [lib,gallery])assert.ok(!/from\s+'[^']*(dist|src)\//.test(source),'prototype must not import the game');
 assert.ok(!/Math\.random|Date\.now/.test(lib+gallery));
 const walk=async dir=>(await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?walk(dir+'/'+e.name):[dir+'/'+e.name]))).flat();
 for(const file of await walk('src'))assert.ok(!(await readFile(file,'utf8')).includes('architecture-prototype'),file);
 assert.ok(!(await readFile('index.html','utf8')).includes('architecture'));
});
