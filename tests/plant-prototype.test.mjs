/** Issue #47 B1a：植物13系統の試作の語彙・整合・決定性・本編との境界。視覚の受入判定ではない。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Raster,difference} from '../scripts/lib/pixel-raster.mjs';
import * as P from '../scripts/lib/plant-prototype.mjs';

const ids=Object.keys(P.archetypes),MONO='#3d4a40';
const scales=[1,.75,.5];

test('B1a: 設計書§5の13系統と地表材6種を番号順に持つ',()=>{
 assert.deepEqual(ids.map(id=>P.archetypes[id].no),[1,2,3,4,5,6,7,8,9,10,11,12,13]);
 assert.deepEqual(ids.map(id=>P.archetypes[id].label),['落葉広葉樹','常緑広葉樹','針葉樹','熱帯高木','乾燥地の疎林木','河畔樹木','乾燥地の低木','寒冷地の低木','一般低木','草本','林床植物','湿地植物','苔・地衣類']);
 assert.deepEqual(Object.values(P.groundMaterials).map(g=>g.label),['砂','岩','裸土','落葉','湿った土','寒冷地表']);
 assert.deepEqual(Object.keys(P.herbForms),['short','tall','dry']);
});

test('B1a: 全系統・全段階・全密度・全奥行きで描画され、描画面の縁で切れない',()=>{
 for(const id of ids)for(const stage of P.stages)for(const density of P.densities)for(const k of scales)for(const variant of [0,1,5]){
  const m=P.measure(P.renderPlant(id,{stage,density,k,variant}));
  assert.ok(m.opaque>0,`${id}/${stage}/${density}/${k}/${variant} drew nothing`);
  assert.equal(m.clipped,false,`${id}/${stage}/${density}/${k}/${variant} is clipped`);
  assert.ok(m.bottom<=-1,`${id} draws below its ground line`);
 }
});

test('B1a: 成熟・密・手前の13系統は単色シルエットが互いに異なる（色に頼らない）',()=>{
 const masks=ids.map(id=>P.renderPlant(id,{mono:MONO}));
 for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)
  assert.ok(difference(masks[i],masks[j]).silhouette>=8,`${ids[i]} and ${ids[j]} share nearly the same silhouette`);
});

test('B1a: 高木6系統は遠景（k=0.5）でも輪郭が20px以上異なる',()=>{
 const trees=ids.filter(id=>P.archetypes[id].layer==='canopy'),masks=trees.map(id=>P.renderPlant(id,{k:.5,mono:MONO}));
 for(let i=0;i<trees.length;i++)for(let j=i+1;j<trees.length;j++)
  assert.ok(difference(masks[i],masks[j]).silhouette>=20,`${trees[i]}/${trees[j]} far`);
});

test('B1a: 色を変えても輪郭は変わらない＝色は系統に数えない',()=>{
 for(const id of ids)for(const density of P.densities)
  assert.equal(P.renderPlant(id,{density}).mask(),P.renderPlant(id,{density,mono:MONO}).mask(),id);
});

test('B1a: 若齢は成熟より小さく、疎と密は輪郭が異なる',()=>{
 for(const id of ids){
  const young=P.measure(P.renderPlant(id,{stage:'young'})),mature=P.measure(P.renderPlant(id));
  assert.ok(young.opaque<mature.opaque,id+' young is not smaller');
  assert.ok(young.height<=mature.height,id+' young is taller');
  assert.notEqual(P.renderPlant(id,{density:'sparse'}).mask(),P.renderPlant(id).mask(),id+' sparse equals dense');
 }
 assert.ok(['tropical','conifer','deciduous'].every(id=>P.measure(P.renderPlant(id)).height>=18),'canopy trees lost their height');
});

test('B1a: 個体番号で輪郭が変わり、同じ入力は同じ画素になる（乱数・時刻を使わない）',()=>{
 for(const id of ids){
  assert.ok(new Set([0,1,2,3,4,5].map(variant=>P.renderPlant(id,{variant}).mask())).size>=2,id+' has no individual variation');
  for(const o of [{},{variant:3,stage:'young',density:'sparse',k:.75}])
   assert.equal(Buffer.compare(P.renderPlant(id,o).png(),P.renderPlant(id,o).png()),0,id);
 }
 const a=new Raster(40,20),b=new Raster(40,20);P.paintGround(a,'rock',0,0,40,20);P.paintGround(b,'rock',0,0,40,20);
 assert.equal(Buffer.compare(a.png(),b.png()),0);
});

test('B1a: 未知の系統・段階・密度・倍率・個体番号・形は拒否する',()=>{
 assert.throws(()=>P.renderPlant('palm'),/unknown plant archetype/);
 assert.throws(()=>P.renderPlant('herb',{stage:'old'}),/unknown stage/);
 assert.throws(()=>P.renderPlant('herb',{density:'thick'}),/unknown density/);
 assert.throws(()=>P.renderPlant('herb',{k:3}),/scale/);
 assert.throws(()=>P.renderPlant('herb',{variant:-1}),/variant/);
 assert.throws(()=>P.renderPlant('conifer',{form:'dry'}),/herb only/);
 assert.throws(()=>P.renderPlant('herb',{substrate:'rock'}),/moss only/);
 assert.throws(()=>P.paintGround(new Raster(4,4),'snow',0,0,4,4),/unknown ground material/);
});

test('B1a: 試作は本編（src/・dist/）と相互に読み込まない',async()=>{
 for(const f of ['../scripts/lib/plant-prototype.mjs','../scripts/preview-plants.mjs']){
  const text=await readFile(new URL(f,import.meta.url),'utf8');
  assert.doesNotMatch(text,/from\s+['"][^'"]*(?:\/src\/|\/dist\/)/,f);
  assert.doesNotMatch(text,/Math\.random|Date\.now|new Date/,f);
 }
 const {spawnSync}=await import('node:child_process');
 const grep=spawnSync('git',['grep','-l','plant-prototype','--','src','index.html'],{encoding:'utf8',cwd:new URL('..',import.meta.url)});
 assert.equal(grep.status,1,'production code refers to the plant prototype: '+grep.stdout);
});
