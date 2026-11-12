/**
 * Issue #47 B1a：植物13系統の原寸比較ギャラリー。PROTOTYPE ONLY — NOT HISTORY。
 * 本編の履歴・保存・RNG・描画を読まず、変更もしない。ビルド不要。
 *   node scripts/preview-plants.mjs  →  artifacts/biome47-b1a/
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Raster,difference} from './lib/pixel-raster.mjs';
import * as P from './lib/plant-prototype.mjs';

const out='artifacts/biome47-b1a';
await mkdir(out,{recursive:true});
const files={};
const save=async(name,raster,scale=4)=>{
 const png=raster.png();files[name]={png,width:raster.width,height:raster.height};
 await writeFile(`${out}/${name}_${raster.width}x${raster.height}.png`,png);
 await writeFile(`${out}/${name}_${scale}x.png`,raster.scale(scale).png());
};
const SKY='#c9cdb8',GROUND='#9a9a70',MONO='#3d4a40',PAPER='#e8e4d6';
const ids=Object.keys(P.archetypes);
// 本編の奥行き倍率（.45+(y-96)/160）に合わせた3段：手前・中景・遠景。
const depthScales=[{id:'near',label:'手前 k=1.0',k:1},{id:'middle',label:'中景 k=0.75',k:.75},{id:'far',label:'遠景 k=0.5',k:.5}];
const columns=[
 {label:'若齢・疎',stage:'young',density:'sparse',k:1},{label:'若齢・密',stage:'young',density:'dense',k:1},
 {label:'成熟・疎',stage:'mature',density:'sparse',k:1},{label:'成熟・密',stage:'mature',density:'dense',k:1},
 ...depthScales.slice(1).map(d=>({label:'成熟・密 '+d.label,stage:'mature',density:'dense',k:d.k})),
];
const CELL=46,ROW=46,GY=40;

// ---- 1. カタログ：行＝13系統、列＝若齢／成熟×疎／密、奥行き ----
function sheet(mono){
 const r=new Raster(CELL*columns.length,ROW*ids.length);
 ids.forEach((id,row)=>{
  if(mono)r.rect(0,row*ROW,r.width,ROW,PAPER);else{r.rect(0,row*ROW,r.width,GY,SKY);r.rect(0,row*ROW+GY,r.width,ROW-GY,GROUND);}
  columns.forEach((c,col)=>P.drawPlant(r,id,col*CELL+(CELL>>1),row*ROW+GY,{stage:c.stage,density:c.density,k:c.k,...(mono?{mono:MONO}:{})}));
 });
 return r;
}
await save('catalog_plants',sheet(false));
await save('silhouette_plants_mono',sheet(true));

// ---- 2. 個体差：同じ系統・同じ段階で variant だけを変える／草本3形・岩上の苔 ----
const VARIANTS=6;
const variants=new Raster(CELL*VARIANTS,ROW*ids.length);
ids.forEach((id,row)=>{variants.rect(0,row*ROW,variants.width,GY,SKY);variants.rect(0,row*ROW+GY,variants.width,ROW-GY,GROUND);
 for(let v=0;v<VARIANTS;v++)P.drawPlant(variants,id,v*CELL+(CELL>>1),row*ROW+GY,{variant:v});});
await save('variants_plants',variants);
const extras=[
 ...Object.keys(P.herbForms).map(form=>({id:'herb',label:'草本：'+P.herbForms[form],options:{form}})),
 {id:'moss',label:'苔・地衣類：岩の上',options:{substrate:'rock'}},{id:'moss',label:'苔・地衣類：岩の上（疎）',options:{substrate:'rock',density:'sparse'}},
];
const extraSheet=new Raster(CELL*extras.length,ROW);
extraSheet.rect(0,0,extraSheet.width,GY,SKY);extraSheet.rect(0,GY,extraSheet.width,ROW-GY,GROUND);
extras.forEach((e,i)=>P.drawPlant(extraSheet,e.id,i*CELL+(CELL>>1),GY,e.options));
await save('forms_herb_moss',extraSheet);

// ---- 3. 地表材6種（植物とは別カテゴリ） ----
const groundIds=Object.keys(P.groundMaterials),GW=52,GH=28;
const grounds=new Raster(GW*groundIds.length,GH+12);
grounds.rect(0,0,grounds.width,12,SKY);
groundIds.forEach((g,i)=>P.paintGround(grounds,g,i*GW,12,GW,GH));
await save('ground_materials',grounds);

// ---- 4. 原寸の並び（320×180）：大きさの目安として人物・小屋を置く。バイオームの景観ではない ----
const mixc=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
const depthK=y=>Math.round((.45+(y-96)/160)*100)/100;
const trees=ids.filter(id=>P.archetypes[id].layer==='canopy'),low=ids.filter(id=>P.archetypes[id].layer!=='canopy');
const lineupRows=[{y:112,ids:trees,x0:40,dx:48},{y:150,ids:trees,x0:24,dx:50},{y:174,ids:low,x0:26,dx:45}];
function lineup(){
 const r=new Raster(320,180);
 for(let y=0;y<96;y++)r.rect(0,y,320,1,mixc('#b3c2b4','#dfd3b1',Math.floor(y/8)/11));
 for(let x=0;x<320;x++){const t=x%128,h=6+Math.floor((t<64?t:128-t)/5)+((x>>4)%3);r.rect(x,96-h,1,h,'#8b9c85');}
 r.rect(0,96,320,84,GROUND);
 // 大きさの目安：本編と同寸の人物、平屋の小屋（D1住宅程度の大きさ）。歴史上の建物ではない。
 const person=(x,y)=>{r.rect(x,y-8,2,2,'#d2b894');r.rect(x-1,y-6,4,4,'#66594f');r.rect(x,y-2,1,2,'#454e48');r.rect(x+2,y-2,1,2,'#454e48');};
 const hut=(x,y)=>{r.rect(x,y-8,16,8,'#c9b48e');r.rect(x+6,y-5,4,5,'#70594b');for(let i=0;i<5;i++)r.rect(x-1+i,y-9-i,18-2*i,1,'#8c6655');};
 for(const row of lineupRows)row.ids.forEach((id,i)=>P.drawPlant(r,id,row.x0+i*row.dx,row.y,{k:depthK(row.y)}));
 hut(290,150);person(314,150);person(312,174);hut(2,112);
 return r;
}
const stage=lineup();await save('lineup_NOT_BIOME',stage,4);

// ---- 5. 機械的な指標（受入判定ではない） ----
const metric={};
for(const id of ids){
 const at=(o={})=>P.renderPlant(id,o),silhouette=o=>P.renderPlant(id,{...o,mono:MONO});
 const m={};
 for(const c of columns)m[`${c.stage}-${c.density}-k${c.k}`]=P.measure(at(c));
 metric[id]={no:P.archetypes[id].no,label:P.archetypes[id].label,layer:P.archetypes[id].layer,size:m,
  youngVsMatureSilhouette:difference(silhouette({stage:'young'}),silhouette({})).silhouette,
  sparseVsDenseSilhouette:difference(silhouette({density:'sparse'}),silhouette({})).silhouette,
  distinctVariantSilhouettes:new Set(Array.from({length:VARIANTS},(_,v)=>at({variant:v}).mask())).size};
}
// 最も近い他系統との輪郭差（根元を揃えた単色シルエット）。奥行きごと。
const nearest={};
for(const d of depthScales){
 const masks=Object.fromEntries(ids.map(id=>[id,P.renderPlant(id,{k:d.k,mono:MONO})]));
 nearest[d.id]={};
 for(const id of ids){let best=null;for(const o of ids)if(o!==id){const s=difference(masks[id],masks[o]).silhouette;if(!best||s<best.silhouette)best={against:o,silhouette:s};}nearest[d.id][id]=best;}
}
const clipped=[];
for(const id of ids)for(const st of P.stages)for(const de of P.densities)for(const d of depthScales)if(P.measure(P.renderPlant(id,{stage:st,density:de,k:d.k})).clipped)clipped.push(`${id}/${st}/${de}/${d.k}`);
if(clipped.length)throw Error('plant drawing touches the canvas edge: '+clipped.join(', '));
// 色だけを変えても輪郭は変わらない（色は系統の識別に数えない）。
for(const id of ids)if(P.renderPlant(id).mask()!==P.renderPlant(id,{mono:MONO}).mask())throw Error('mono silhouette differs from colour drawing: '+id);
// 再描画の決定性。
if(Buffer.compare(lineup().png(),stage.png())!==0||Buffer.compare(sheet(false).png(),files.catalog_plants.png)!==0)throw Error('gallery is not deterministic');

const sha=b=>createHash('sha256').update(b).digest('hex');
const minNear=Object.fromEntries(depthScales.map(d=>{const e=Object.entries(nearest[d.id]).sort((a,b)=>a[1].silhouette-b[1].silhouette)[0];return [d.id,{a:e[0],b:e[1].against,silhouette:e[1].silhouette}];}));
const report={status:'PROTOTYPE_NOT_HISTORY',prototypeId:P.PROTOTYPE_ID,issue:47,stage:'B1a',
 sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',
 boundary:{liveIntegration:false,saveSchemaChange:false,readsGameHistory:false,usesGameRng:false,productionDrawingChanged:false,biomeLandscape:false},
 limitations:['植物単体と平坦な仮の地面での比較。7バイオーム×3地区の景観比較はB1b','画素差は機械的指標で、視認性・世界観の受入判定を代替しない',
  '生育適性・年次状態・分布は未定義（B1c／B2）','季節・揺れのアニメーションは対象外（#36／#33）'],
 depthScales,columns:columns.map(c=>c.label),archetypes:metric,nearestSilhouette:nearest,minimumNearestSilhouette:minNear,
 groundMaterials:Object.fromEntries(groundIds.map(g=>[g,P.groundMaterials[g].label])),
 lineup:lineupRows.map(r=>({groundY:r.y,k:depthK(r.y),ids:r.ids})),
 pngSha256:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,sha(v.png)]))};
await writeFile(out+'/report.json',JSON.stringify(report,null,2));

// ---- 6. 自己完結HTMLギャラリー（原寸と4倍。ラベルは画像の外） ----
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const img=(name,scale)=>{const f=files[name];return `<img alt="${esc(name)}" width="${f.width*scale}" height="${f.height*scale}" src="data:image/png;base64,${f.png.toString('base64')}">`;};
const grid=(name,colLabels,rowLabels,cw,rh)=>`<div class="pair"><figure>${img(name,1)}<figcaption>原寸</figcaption></figure></div>
<div class="scroll"><div class="grid" style="grid-template-columns:170px ${files[name].width*4}px">
<div></div><div class="cols" style="grid-template-columns:repeat(${colLabels.length},${cw*4}px)">${colLabels.map(l=>`<div>${esc(l)}</div>`).join('')}</div>
<div class="rows">${rowLabels.map(l=>`<div style="height:${rh*4}px">${l}</div>`).join('')}</div>${img(name,4)}</div></div>`;
const rowLabels=ids.map(id=>`<span><b>${P.archetypes[id].no}.</b> ${esc(P.archetypes[id].label)}<br><small>${esc(P.archetypes[id].form)}</small></span>`);
const warn=n=>n<20?' class="warn"':'';
const table=`<table><tr><th>系統</th><th>成熟・密 手前（幅×高さ）</th><th>若齢↔成熟の輪郭差</th><th>疎↔密の輪郭差</th><th>個体差（6個体中の別輪郭）</th>${depthScales.map(d=>`<th>最も近い他系統（${esc(d.label)}）</th>`).join('')}</tr>
${ids.map(id=>{const m=metric[id],s=m.size['mature-dense-k1'];return `<tr><td>${m.no}. ${esc(m.label)}</td><td>${s.width}×${s.height}px</td><td>${m.youngVsMatureSilhouette}px</td><td>${m.sparseVsDenseSilhouette}px</td><td>${m.distinctVariantSilhouettes}</td>${depthScales.map(d=>{const n=nearest[d.id][id];return `<td${warn(n.silhouette)}>${esc(P.archetypes[n.against].label)}と ${n.silhouette}px</td>`;}).join('')}</tr>`;}).join('\n')}</table>`;
const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Issue #47 B1a 植物造形ギャラリー</title>
<style>
body{margin:0;padding:16px;background:#f4f0e6;color:#2f3a30;font:15px/1.6 system-ui,sans-serif}
main{max-width:1320px;margin:auto}h1{font-size:22px}h2{font-size:18px;margin:36px 0 4px;border-top:1px solid #c9c2ae;padding-top:20px}
img{image-rendering:pixelated;display:block;max-width:none}.scroll{overflow-x:auto;padding-bottom:6px}.pair{margin:8px 0}
figure{margin:0;display:inline-block}figcaption,.note{font-size:13px;color:#5d6657}
.banner{background:#e9dcc0;border:1px solid #b9a777;padding:10px 14px;border-radius:6px}
.grid{display:grid;align-items:start}.cols{display:grid;font-size:12px}.cols div{padding:0 4px}
.rows div{display:flex;align-items:center;font-size:13px;padding-right:8px;line-height:1.35}small{color:#5d6657}
table{border-collapse:collapse;font-size:13px;margin:10px 0}td,th{border:1px solid #c9c2ae;padding:3px 8px;text-align:left}th{background:#e7e1d0}td.warn{background:#f0d6b8}
</style><main>
<h1>Issue #47 / B1a　植物13系統の造形ギャラリー</h1>
<p class="banner"><b>PROTOTYPE ONLY — NOT HISTORY。</b>ゲーム本編の画面・履歴・保存形式・乱数には接続していません。植物単体を平坦な仮の地面に置いた比較で、バイオームの景観（B1b）ではありません。
色は系統の識別手段として数えないため、単色シルエットも併記しています。橙色の欄は「最も近い他系統との輪郭差が20px未満」の機械的な注意で、合否ではありません。</p>
<h2>原寸の並び（320×180）</h2>
<p class="note">上段＝高木6系統（遠景 k=${depthK(112)}）、中段＝同じ6系統（中景 k=${depthK(150)}）、下段＝低木・草本・地表の7系統（手前 k=${depthK(174)}）。左から系統番号順。人物と小屋は大きさの目安。</p>
<div class="pair"><figure>${img('lineup_NOT_BIOME',1)}<figcaption>原寸 320×180</figcaption></figure></div><div class="scroll">${img('lineup_NOT_BIOME',4)}</div>
<h2>カタログ：若齢／成熟 × 疎／密、奥行き</h2>
${grid('catalog_plants',columns.map(c=>c.label),rowLabels,CELL,ROW)}
<h2>単色シルエット（形だけの比較）</h2>
${grid('silhouette_plants_mono',columns.map(c=>c.label),rowLabels,CELL,ROW)}
<h2>個体差：同じ系統・成熟・密で個体番号だけを変える</h2>
${grid('variants_plants',Array.from({length:VARIANTS},(_,v)=>'個体 '+v),rowLabels,CELL,ROW)}
<h2>草本の3形・岩の上の苔</h2>
${grid('forms_herb_moss',extras.map(e=>e.label),[''],CELL,ROW)}
<h2>地表材6種（植物とは別カテゴリ）</h2>
${grid('ground_materials',groundIds.map(g=>P.groundMaterials[g].label),[''],GW,GH+12)}
<h2>機械的な指標</h2>
<p class="note">輪郭差は根元を揃えた単色シルエットの不一致画素数。値が小さいほど原寸で見分けにくい可能性がある。</p>
${table}
</main></html>`;
await writeFile(out+'/gallery.html',html);
console.log(JSON.stringify({type:'biome47-b1a',images:Object.keys(files).length,archetypes:ids.length,grounds:groundIds.length,minimumNearestSilhouette:minNear,galleryBytes:Buffer.byteLength(html)}));
