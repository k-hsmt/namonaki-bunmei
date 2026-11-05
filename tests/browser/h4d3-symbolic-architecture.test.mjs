/**
 * H4-D3: 象徴建築4案の試作画像（コンセプト限定）。
 * 確定済み施設hallを表示上だけ差し替える。自然建設・保存・施設の種類には一切反映しない。
 * baselineのみ自然進行の史実。concept_で始まる画像は実際の歴史ではない。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createHousingCivilization} from '../../dist/story/housing-persistence.js';
import {step,chooseAutomatically} from '../../dist/story/engine.js';
import {snapshotAt} from '../../dist/scene/model.js';
import {composeScene} from '../../dist/scene/composition.js';

const seed=42,year=958;
const concepts=[
 {id:'large-hall',name:'大きな集会所・会堂',premise:'existing hall only',
  groundStatus:'requires plot and roof-overhang review'},
 {id:'courtyard-civic',name:'中庭を囲む共同建築',premise:'future construction or recorded renovation',
  groundStatus:'new footprint required'},
 {id:'earthwork-manor',name:'土塁と木柵を持つ館',premise:'new authority and land-use history',
  groundStatus:'larger plot and terrain verification required'},
 {id:'small-fortress',name:'小規模な城塞・防御拠点',premise:'new defense/conflict motivation and history',
  groundStatus:'large new plot and conflict history required'},
];
const toBytes=data=>Buffer.from(data.split(',')[1],'base64');

test('H4-D3: 4候補を同じ自然都市の同じ集会所位置にコンセプト合成し、履歴を保全',async()=>{
 const state=createHousingCivilization(seed);
 for(let y=1;y<=year;y++){step(state);if(state.pending)chooseAutomatically(state);}
 const before=JSON.stringify(state);
 const original=snapshotAt(state,year,0);
 assert.equal(original.visual?.scale,3,'この年の都市規模は自然到達の事実である');
 const hall=original.objects.find(o=>o.kind==='hall');
 assert.ok(hall,'自然都市に確定済み集会所のアンカーが必要');
 const originalComposition=composeScene(original,state.housing);
 assert.equal(originalComposition.structures.find(o=>o.id===hall.id)?.kind,'hall');
 // 史実との比較にはbase画像を使用。conceptには実在hallを一時的に描画から隠して
 // その固定アンカーで仮想建築案を示す。実物の履歴・建物IDは変更しない。
 const hypothetical={...original,objects:original.objects.filter(o=>o.id!==hall.id)};
 const originalObjects=original.objects.map(o=>({...o}));
 const port='5288';
 const server=spawn(process.execPath,['scripts/serve.mjs'],{
  env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
 let browser;
 try{
  await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  const page=await browser.newPage({viewport:{width:1024,height:768}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port);
  await mkdir('artifacts/h4d3-concepts',{recursive:true});
  const images=await page.evaluate(async ({original,hypothetical,housing,seed,hall,ids})=>{
   const {drawScene}=await import('/scene/draw.js');
   const rect=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
   const polygon=(c,coords,color)=>{c.fillStyle=color;c.beginPath();c.moveTo(coords[0],coords[1]);
    for(let k=2;k<coords.length;k+=2)c.lineTo(coords[k],coords[k+1]);
    c.closePath();c.fill();};
   const wood='#70594b',roof='#886f5a',light='#c8b69a',earth='#a59b76',stone='#a8a08d',dark='#454e48';
   const draw=(c,id,x,y)=>{
    if(id==='large-hall'){
     // 既存の集会所の拡張方向。高屋根と柱は既存施設の建築言語を継承。
     rect(c,x-21,y-16,43,18,'#b7a88b');
     polygon(c,[x-24,y-16,x,y-32,x+24,y-16],'#79786b');
     rect(c,x-22,y-18,45,4,roof);
     rect(c,x-3,y-11,7,13,dark);
     for(const dx of [-16,-10,10,16])rect(c,x+dx,y-10,3,11,light);
     rect(c,x-23,y+1,47,2,wood);
    }else if(id==='courtyard-civic'){
     // 低い中庭と左右の屋根。王権を感じさせず共同建築のまとまりを表す。
     rect(c,x-23,y-9,47,11,'#ae9c7d');
     polygon(c,[x-25,y-9,x-16,y-20,x-7,y-9],roof);
     polygon(c,[x+7,y-9,x+16,y-20,x+25,y-9],roof);
     rect(c,x-25,y-11,18,3,'#8d7967');
     rect(c,x+7,y-11,18,3,'#8d7967');
     rect(c,x-8,y-12,17,4,'#c1b294');
     rect(c,x-6,y-7,13,7,earth);
     rect(c,x-2,y-5,5,5,'#8b9b7d');
     rect(c,x-25,y+1,50,2,wood);
    }else if(id==='earthwork-manor'){
     // 土塁・柵・非対称の木造館。低い防御性に留める。
     rect(c,x-27,y-3,55,6,earth);
     rect(c,x-24,y-7,49,3,'#86775e');
     for(let dx=-24;dx<=24;dx+=5)rect(c,x+dx,y-14,2,9,wood);
     rect(c,x-17,y-20,34,17,'#b1a084');
     polygon(c,[x-19,y-20,x-3,y-30,x+19,y-20],roof);
     rect(c,x+13,y-26,5,7,stone);
     rect(c,x-3,y-11,7,10,dark);
     rect(c,x-27,y+2,55,2,'#756c55');
    }else if(id==='small-fortress'){
     // 非ヨーロッパ式の低い土塁・左右監視所と木の門。高い尖塔なし。
     rect(c,x-30,y-6,61,9,'#938b73');
     rect(c,x-28,y-13,57,8,stone);
     rect(c,x-29,y-19,10,13,'#9b967f');
     rect(c,x+20,y-19,10,13,'#9b967f');
     for(const dx of [-30,-22,19,27])rect(c,x+dx,y-22,4,4,'#777765');
     rect(c,x-10,y-18,21,14,'#b3a185');
     polygon(c,[x-12,y-18,x,y-26,x+13,y-18],'#777466');
     rect(c,x-4,y-12,9,15,dark);
     rect(c,x-32,y+2,65,2,wood);
    }else throw Error('unknown concept '+id);
   };
   const render=(snapshot,id)=>{
    const canvas=document.createElement('canvas');
    drawScene(canvas,snapshot,seed,housing);
    if(id)draw(canvas.getContext('2d'),id,hall.x,hall.y);
    if(canvas.width!==320||canvas.height!==180)throw Error('invalid image dimensions');
    return canvas.toDataURL('image/png');
   };
   const originalFrame=render(original,null);
   if(render(original,null)!==originalFrame)throw Error('baseline not deterministic');
   const results={baseline:originalFrame,scenes:{},isolated:{},masks:{}};
   for(const id of ids){
    const first=render(hypothetical,id),again=render(hypothetical,id);
    if(first!==again)throw Error('concept not deterministic');
    results.scenes[id]=first;
    const icon=document.createElement('canvas');icon.width=88;icon.height=72;
    draw(icon.getContext('2d'),id,44,49);
    results.isolated[id]=icon.toDataURL('image/png');
    const rgba=icon.getContext('2d').getImageData(0,0,88,72).data;
    let mask='';
    for(let i=3;i<rgba.length;i+=4)mask+=rgba[i]?'1':'0';
    results.masks[id]=mask;
   }
   const paintSheet=async()=>{
    const sheet=document.createElement('canvas');sheet.width=640;sheet.height=360;
    const ctx=sheet.getContext('2d');ctx.imageSmoothingEnabled=false;
    const load=url=>new Promise((resolve,reject)=>{
     const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=url;});
    for(let i=0;i<ids.length;i++){
     const img=await load(results.scenes[ids[i]]);
     ctx.drawImage(img,i%2*320,Math.floor(i/2)*180);
    }
    const native=sheet.toDataURL('image/png');
    const large=document.createElement('canvas');large.width=2560;large.height=1440;
    const lc=large.getContext('2d');lc.imageSmoothingEnabled=false;
    lc.drawImage(sheet,0,0,2560,1440);
    return {native,enlarged:large.toDataURL('image/png')};
   };
   results.sheet=await paintSheet();
   return results;
  },{original,hypothetical,housing:state.housing,seed,hall,ids:concepts.map(x=>x.id)});
  assert.equal(new Set(Object.values(images.masks)).size,4,'候補のシルエットが同一になっている');
  assert.equal(new Set(Object.values(images.scenes)).size,4,'全候補を同一描画してはいけない');
  assert.ok(Object.values(images.scenes).every(src=>src!==images.baseline));
  await writeFile('artifacts/h4d3-concepts/baseline_ACTUAL_seed42_year958.png',toBytes(images.baseline));
  for(const c of concepts){
   await writeFile('artifacts/h4d3-concepts/concept_'+c.id+'_320x180_NOT_HISTORY.png',toBytes(images.scenes[c.id]));
   await writeFile('artifacts/h4d3-concepts/silhouette_'+c.id+'_88x72.png',toBytes(images.isolated[c.id]));
  }
  await writeFile('artifacts/h4d3-concepts/concepts_four_640x360_NOT_HISTORY.png',toBytes(images.sheet.native));
  await writeFile('artifacts/h4d3-concepts/concepts_four_4x_NOT_HISTORY.png',toBytes(images.sheet.enlarged));
  await writeFile('artifacts/h4d3-concepts/provenance.json',JSON.stringify({
   purpose:'DESIGN ONLY - HYPOTHETICAL OVERLAY, NOT A GAME HISTORY OR CONFIRMED BUILDING',
   reference:{seed,year,site:'river-bank',observedScale:'city',
    historicalAnchorId:hall.id,historicalAnchorKind:hall.kind,
    historicalCondition:hall.condition,location:{x:hall.x,y:hall.y},
    actualFacilities:original.objects.map(o=>({id:o.id,kind:o.kind,builtYear:o.builtYear,condition:o.condition})),
    actualHousingBlockCount:originalComposition.residentialBlocks.length},
   composition:'Each concept picture omits the documented hall in the visual ONLY, drawing a hypothetical design at the same location. Baseline is the actual recorded scene. NO building placement or land-use approval is implied.',
   galleryOrder:concepts.map(c=>c.id),concepts,
  },null,2));
  assert.deepEqual(original.objects,originalObjects,'snapshot objects changed');
  assert.equal(JSON.stringify(state),before,'production state was mutated by concept preview');
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill();}
});
