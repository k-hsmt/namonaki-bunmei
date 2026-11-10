/**
 * Issue #35 / D1：建築ビジュアル試作の専用ギャラリー。PROTOTYPE ONLY — NOT HISTORY。
 * ゲーム本編の描画・履歴・保存・RNGを読まず、変更もしない。dist/ のビルドも不要。
 * 同じ位置・同じ用途の建物を、比較用の固定サンプル文化ごとに描き比べる。
 *   node scripts/preview-architecture.mjs  →  artifacts/architecture35-d1/
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Raster,difference} from './lib/pixel-raster.mjs';
import * as A from './lib/architecture-prototype.mjs';

const out='artifacts/architecture35-d1';
await mkdir(out,{recursive:true});
const files={};
const save=async(name,raster,scale=4)=>{
 const png=raster.png();files[name]={png,width:raster.width,height:raster.height};
 await writeFile(`${out}/${name}_${raster.width}x${raster.height}.png`,png);
 await writeFile(`${out}/${name}_${scale}x.png`,raster.scale(scale).png());
};
const SKY='#c9cdb8',GROUND='#9a9a70';

// ---- 1. カタログ：1軸だけを変え、他を固定した住宅と会堂 ----
const CELL=46,ROW=46,HOUSE_GY=40,HALL_GY=88;
const baseOf={
 roofs:{structure:'S01',roofing:'shingle'},
 structures:{roofing:'shingle'},
 wallMaterials:{roofing:'shingle'},
 roofMaterials:{structure:'S01'},
 foundations:{structure:'S02',roofing:'shingle'},
 windows:{structure:'S01',roofing:'shingle'},
 entrances:{structure:'S02',roofing:'shingle'},
 ornaments:{structure:'S01',roofing:'shingle',pitch:'high'},
 palettes:{structure:'S06',roofing:'tile',ornaments:['O5']},
};
const wallHost={log:'S02',plank:'S02',wattle:'S01',earth:'S03',rammed:'S03',rubble:'S04',ashlar:'S05',mixed:'S06',metal:'X3',composite:'X3'};
const variantsOf={
 roofs:Object.keys(A.roofs).map(id=>({id,label:A.roofs[id],spec:{roof:id}})),
 structures:[...Object.keys(A.structures).map(id=>({id,label:A.structures[id],spec:{structure:id,entrance:id==='S07'?'E5':'E1'}})),
  ...Object.keys(A.advancedStructures).map(id=>({id,label:A.advancedStructures[id]+'（高度）',spec:{structure:id,window:id==='X3'?'W7':'W1',roofing:id==='X3'?'metal':'shingle',roof:id==='X3'?'R04':'R01',pitch:id==='X3'?'low':'mid'}}))],
 wallMaterials:Object.keys(A.wallMaterials).map(id=>({id,label:A.wallMaterials[id],spec:{structure:wallHost[id],wall:id,
  ...(wallHost[id]==='X3'?{roofing:'metal',roof:'R04',pitch:'low'}:{})}})),
 roofMaterials:Object.keys(A.roofMaterials).map(id=>({id,label:A.roofMaterials[id],spec:{roofing:id,
  ...(id==='plaster'?{roof:'R05',structure:'S03'}:id==='metal'||id==='glazed'?{structure:'X3',roof:'R04',pitch:'low'}:{})}})),
 foundations:Object.keys(A.foundations).map(id=>({id,label:A.foundations[id],spec:{foundation:id,
  ...(id==='F5'?{structure:'S07',entrance:'E5'}:id==='F6'?{structure:'X3',roofing:'metal',roof:'R04',pitch:'low'}:id==='F1'?{}:{entrance:'E5'})}})),
 windows:[...Object.keys(A.windows).map(id=>({id,label:A.windows[id],spec:{window:id}})),
  {id:'W7',label:A.advancedWindows.W7,spec:{window:'W7',structure:'X1'}}],
 entrances:Object.keys(A.entrances).map(id=>({id,label:A.entrances[id],spec:{entrance:id,deepEaves:id==='E3',...(id==='E5'?{foundation:'F2'}:{})}})),
 ornaments:[{id:'なし',label:'比較基準',spec:{ornaments:[]}},...Object.keys(A.ornaments).map(id=>({id,label:A.ornaments[id],spec:{ornaments:[id]}}))],
 palettes:[...['P01','P02','P03','P04','P05'].map(id=>({id,label:A.palettes[id],spec:{palette:id}})),
  {id:'P06',label:A.palettes.P06+'（P02の例）',spec:{palette:'P02',faded:true}}],
};
const axisTitle={roofs:'屋根 R01〜R08',structures:'壁・支持構造 S01〜S07＋高度3',wallMaterials:'壁・骨組みの素材',roofMaterials:'屋根の素材',
 foundations:'基礎',windows:'窓 6系統＋高度1',entrances:'入口 7系統',ornaments:'装飾 8系統',palettes:'色 P01〜P06（色は系統に数えない）'};
const isolated=(spec,use)=>{const r=new Raster(CELL+18,ROW+10);A.drawBuilding(r,{...spec,use},(CELL+18)>>1,use==='hall'?44:40);return r;};
const catalog={};
for(const [axis,variants] of Object.entries(variantsOf)){
 const sheet=new Raster(CELL*variants.length+(64-CELL),ROW*2+4);
 sheet.rect(0,0,sheet.width,sheet.height,GROUND);sheet.rect(0,0,sheet.width,24,SKY);sheet.rect(0,ROW+2,sheet.width,18,SKY);
 const entries=[];
 variants.forEach((v,i)=>{
  const spec={...baseOf[axis],...v.spec};
  const cx=i*CELL+(CELL>>1)+((64-CELL)>>1);
  A.drawBuilding(sheet,{...spec,use:'house'},cx,HOUSE_GY);A.drawBuilding(sheet,{...spec,use:'hall'},cx,HALL_GY);
  entries.push({id:v.id,label:v.label,spec:A.normalizeSpec({...spec,use:'house'}),house:isolated(spec,'house'),hall:isolated(spec,'hall')});
 });
 // 最も近い他系統との画素差（機械的指標。視認性の受入判定ではない）
 for(const e of entries)for(const use of ['house','hall']){
  let nearest=null;
  for(const o of entries)if(o!==e){const d=difference(e[use],o[use]);if(!nearest||d.pixels<nearest.pixels)nearest={against:o.id,...d};}
  e[use+'Nearest']=nearest;
 }
 catalog[axis]={title:axisTitle[axis],cell:CELL,offset:(64-CELL)>>1,entries:entries.map(({house,hall,...rest})=>rest)};
 await save('catalog_'+axis,sheet);
}

// ---- 2. 用途横断：行=文化サンプル、列=用途（同じ用途を縦に比べる） ----
const useList=Object.keys(A.uses),colW=[32,48,44,28,44,46,62],cultureKeys=[...Object.keys(A.cultures),...Object.keys(A.advancedSamples)];
const matrixW=colW.reduce((a,b)=>a+b,0)+16,MR=46;
const matrix=new Raster(matrixW,MR*cultureKeys.length);
matrix.rect(0,0,matrix.width,matrix.height,GROUND);
const cell={};
cultureKeys.forEach((key,row)=>{
 matrix.rect(0,row*MR,matrixW,26,SKY);let x=8;cell[key]={};
 useList.forEach((use,i)=>{
  const spec=A.cultureSpec(key,use);A.drawBuilding(matrix,spec,x+(colW[i]>>1),row*MR+40);x+=colW[i];
  const r=new Raster(80,60);A.drawBuilding(r,spec,40,52);cell[key][use]={spec:A.normalizeSpec(spec),axes:A.formAxes(spec),raster:r};
 });
});
await save('matrix_use_by_culture',matrix);

// ---- 3. 同じ位置・同じ用途の舞台（320×180）。地形・敷地の検証は含まない ----
const places=[['granary',48,122],['hall',150,122],['workshop',258,122],['house',38,146],['market',110,146],['rowhouse',212,146],['house',288,146],['courtyard',84,170],['house',170,170],['house',250,170]];
const mixc=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
function stage(key){
 const r=new Raster(320,180);
 for(let y=0;y<96;y++)r.rect(0,y,320,1,mixc('#b3c2b4','#dfd3b1',Math.floor(y/8)/11)); // 本編の空色に合わせた段階的な空
 for(let x=0;x<320;x++){const t=x%128,h=6+Math.floor((t<64?t:128-t)/5)+((x>>4)%3);r.rect(x,96-h,1,h,'#8b9c85');}
 r.rect(0,96,320,84,GROUND);r.rect(0,176,320,4,'#76805b');
 for(const [use,cx,gy] of places)A.drawBuilding(r,A.cultureSpec(key,use),cx,gy);
 // 大きさの目安（人物）。本編の人物と同寸。歴史上の誰かではない。
 for(const [x,y,c] of [[136,150,'#66594f'],[196,174,'#667a70']]){r.rect(x,y-8,2,2,'#d2b894');r.rect(x-1,y-6,4,4,c);r.rect(x,y-2,1,2,'#454e48');r.rect(x+2,y-2,1,2,'#454e48');}
 return r;
}
const stages={};
for(const key of cultureKeys){stages[key]=stage(key);await save(`stage_${key}_NOT_HISTORY`,stages[key]);}
const contact=(keys,cols)=>{const s=new Raster(320*cols,180*Math.ceil(keys.length/cols));keys.forEach((k,i)=>s.blit(stages[k],(i%cols)*320,Math.floor(i/cols)*180));return s;};
await save('stages_cultures_six_NOT_HISTORY',contact(Object.keys(A.cultures),2),2);
await save('stages_advanced_three_NOT_HISTORY',contact(Object.keys(A.advancedSamples),1),2);

// ---- 4. A01の機械的な事前確認：色以外の軸が2つ以上違うか、輪郭が違うか ----
const pairs=[];
const six=Object.keys(A.cultures);
for(let i=0;i<six.length;i++)for(let j=i+1;j<six.length;j++){
 const perUse={};
 for(const use of useList){
  const a=cell[six[i]][use],b=cell[six[j]][use];
  const axes=Object.keys(a.axes).filter(k=>a.axes[k]!==b.axes[k]);
  perUse[use]={differingFormAxes:axes,...difference(a.raster,b.raster)};
 }
 pairs.push({a:six[i],b:six[j],minFormAxes:Math.min(...Object.values(perUse).map(v=>v.differingFormAxes.length)),
  minSilhouette:Math.min(...Object.values(perUse).map(v=>v.silhouette)),perUse});
}
const a01={scenario:'A01 同じ位置・同じ建物数・別文化（機械的事前確認のみ。合否はHumanの原寸評価）',
 allPairsDifferOnTwoOrMoreFormAxes:pairs.every(p=>p.minFormAxes>=2),minFormAxes:Math.min(...pairs.map(p=>p.minFormAxes)),
 minSilhouettePixels:Math.min(...pairs.map(p=>p.minSilhouette)),pairs};
if(!a01.allPairsDifferOnTwoOrMoreFormAxes)throw Error('A01 precheck failed: a culture pair differs on fewer than two non-colour axes');

// ---- 5. 再描画の決定性 ----
for(const key of cultureKeys)if(Buffer.compare(stage(key).png(),stages[key].png())!==0)throw Error('stage not deterministic: '+key);

const sha=b=>createHash('sha256').update(b).digest('hex');
const report={status:'PROTOTYPE_NOT_HISTORY',prototypeId:A.PROTOTYPE_ID,issue:35,stage:'D1',
 sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',
 boundary:{liveIntegration:false,saveSchemaChange:false,readsGameHistory:false,usesGameRng:false,productionDrawingChanged:false,terrainOrPlotReview:false},
 limitations:['文化・技術サンプルは比較用の固定指定で、自然進行の結果ではない','舞台は平坦な仮の地面で、地形適応・敷地占有・既存施設との衝突は未検証（D2/D5）',
  '画素差は機械的指標で、視認性・世界観の受入判定を代替しない','城・城塞・館は対象外（保留）','廃墟・損傷・褪色以外の経年表現はD4'],
 catalog,cultures:Object.fromEntries(cultureKeys.map(k=>[k,{label:(A.cultures[k]??A.advancedSamples[k]).label,advanced:!A.cultures[k],
  uses:Object.fromEntries(useList.map(u=>[u,cell[k][u].axes]))}])),
 stagePlaces:places.map(([use,x,groundY])=>({use,x,groundY})),a01,
 pngSha256:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,sha(v.png)]))};
await writeFile(out+'/report.json',JSON.stringify(report,null,2));

// ---- 6. 自己完結HTMLギャラリー（原寸と4倍を並べ、ラベルは画像の外に置く） ----
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const img=(name,scale)=>{const f=files[name];return `<img alt="${esc(name)}" width="${f.width*scale}" height="${f.height*scale}" src="data:image/png;base64,${f.png.toString('base64')}">`;};
const flag=n=>n.pixels<6?' class="warn"':'';
const catalogHtml=Object.entries(catalog).map(([axis,c])=>{
 const n=c.entries.length,name='catalog_'+axis;
 return `<section><h2>${esc(c.title)}</h2><p class="note">上段＝住宅、下段＝会堂。変えているのはこの軸だけ。</p>
<div class="pair"><figure>${img(name,1)}<figcaption>原寸</figcaption></figure></div>
<div class="scroll"><div class="strip" style="width:${files[name].width*4}px">${img(name,4)}
<div class="labels" style="padding-left:${c.offset*4}px;grid-template-columns:repeat(${n},${c.cell*4}px)">${c.entries.map(e=>`<div><b>${esc(e.id)}</b> ${esc(e.label)}</div>`).join('')}</div></div></div>
<table><tr><th>ID</th><th>名称</th><th>住宅：最も近い他系統との差</th><th>会堂：最も近い他系統との差</th></tr>
${c.entries.map(e=>`<tr><td>${esc(e.id)}</td><td>${esc(e.label)}</td><td${flag(e.houseNearest)}>${esc(e.houseNearest.against)}と ${e.houseNearest.pixels}px（輪郭 ${e.houseNearest.silhouette}px）</td><td${flag(e.hallNearest)}>${esc(e.hallNearest.against)}と ${e.hallNearest.pixels}px（輪郭 ${e.hallNearest.silhouette}px）</td></tr>`).join('\n')}</table></section>`;
}).join('\n');
const stageHtml=keys=>keys.map(k=>`<section class="stage"><h3>${esc(k)}｜${esc((A.cultures[k]??A.advancedSamples[k]).label)}</h3>
<div class="pair"><figure>${img(`stage_${k}_NOT_HISTORY`,1)}<figcaption>原寸 320×180</figcaption></figure></div><div class="scroll">${img(`stage_${k}_NOT_HISTORY`,4)}</div></section>`).join('\n');
const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Issue #35 D1 建築試作ギャラリー</title>
<style>
body{margin:0;padding:16px;background:#f4f0e6;color:#2f3a30;font:15px/1.6 system-ui,sans-serif}
main{max-width:1320px;margin:auto}h1{font-size:22px}h2{font-size:18px;margin:36px 0 4px;border-top:1px solid #c9c2ae;padding-top:20px}h3{font-size:16px;margin:24px 0 6px}
img{image-rendering:pixelated;display:block;max-width:none}.scroll{overflow-x:auto;padding-bottom:6px}.pair{margin:8px 0}
figure{margin:0;display:inline-block}figcaption,.note{font-size:13px;color:#5d6657}
.banner{background:#e9dcc0;border:1px solid #b9a777;padding:10px 14px;border-radius:6px}
.labels{display:grid;font-size:12px;line-height:1.35;margin-top:4px}.labels div{padding:0 4px;overflow-wrap:anywhere}
table{border-collapse:collapse;font-size:13px;margin:10px 0}td,th{border:1px solid #c9c2ae;padding:3px 8px;text-align:left}th{background:#e7e1d0}
td.warn{background:#f0d6b8}.matrix{display:grid;grid-template-columns:150px auto;align-items:start}
.rows div{height:${MR*4}px;font-size:13px;display:flex;align-items:center;padding-right:8px}
.cols{display:grid;font-size:12px;padding-left:${8*4}px}
</style><main>
<h1>Issue #35 / D1　建築ビジュアル試作ギャラリー</h1>
<p class="banner"><b>PROTOTYPE ONLY — NOT HISTORY。</b>ゲーム本編の画面・履歴・保存形式には接続していません。ここでの「文化」は比較用に固定指定したサンプルで、自然進行の結果ではありません。
地面は平坦な仮の舞台で、地形適応と敷地の検証は含みません。橙色の欄は「最も近い他系統との画素差が6px未満」の機械的な注意で、合否ではありません。</p>
<h2>代表文化6：同じ位置・同じ用途</h2>
<p class="note">全ての舞台で建物の位置・用途・棟数は同一（奥：穀物庫／会堂／仕事場、中：住宅／市場／連棟／住宅、手前：中庭街区／住宅／住宅）。人物2体は大きさの目安。</p>
${stageHtml(Object.keys(A.cultures))}
<h2>高度技術の3例：同じ位置・同じ用途</h2>
<p class="note">高度な構造は会堂・市場・仕事場にだけ現れ、住宅や穀物庫は別の在来構造のまま、という共存の例。技術の成立＝全建物の更新ではない。</p>
${stageHtml(Object.keys(A.advancedSamples))}
<h2>用途横断：同じ用途を縦に比べる</h2>
<div class="pair"><figure>${img('matrix_use_by_culture',1)}<figcaption>原寸</figcaption></figure></div>
<div class="scroll"><div style="width:${150+matrixW*4}px"><div class="matrix"><div></div><div class="cols" style="grid-template-columns:${colW.map(w=>w*4+'px').join(' ')}">${useList.map(u=>`<div>${esc(A.uses[u])}</div>`).join('')}</div>
<div class="rows">${cultureKeys.map(k=>`<div><span><b>${k}</b><br>${esc((A.cultures[k]??A.advancedSamples[k]).label)}</span></div>`).join('')}</div>${img('matrix_use_by_culture',4)}</div></div></div>
<p class="note">A01の機械的事前確認：代表文化6の全15組・全用途で、色以外の形の軸が最低 ${a01.minFormAxes} 軸異なり、輪郭の相違は最小 ${a01.minSilhouettePixels}px。</p>
${catalogHtml}
</main></html>`;
await writeFile(out+'/gallery.html',html);
console.log(JSON.stringify({type:'architecture35-d1',images:Object.keys(files).length,cultures:six.length,advanced:Object.keys(A.advancedSamples).length,
 a01MinFormAxes:a01.minFormAxes,a01MinSilhouettePixels:a01.minSilhouettePixels,galleryBytes:Buffer.byteLength(html)}));
