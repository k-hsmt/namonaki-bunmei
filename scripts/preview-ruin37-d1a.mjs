/** Issue #37 D1a controlled comparison:
 * 7 naturally selected biome climates × 4 genuine architecture materials × 4 ages.
 * npm run build && node scripts/preview-ruin37-d1a.mjs
 * Produces 112 native 320×180 PNGs, gallery.html and report.json.
 * This generates NO civilization, terrain or flora history and writes NO save.
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BIOME_KINDS,generateClimateBaseline} from '../dist/climate/initial-climate-v1.js';
import {RULE_ID,YEARS,RUIN_CONFIRMED_AT,MATERIALS,BIOME_LABELS,WIDTH,HEIGHT,renderD1a} from './lib/ruin37-d1a.mjs';
const out='artifacts/ruin37-d1a',sha=b=>createHash('sha256').update(b).digest('hex');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const worlds=[];
for(const biome of BIOME_KINDS){
 let found=null;
 for(let seed=1;seed<=30000;seed++){
  const c=generateClimateBaseline(seed);
  if(c.dominantBiome===biome&&c.transition===null){found={seed,climate:c};break;}
 }
 assert.ok(found,'Cannot find natural non-transition biome: '+biome);
 worlds.push({biome,label:BIOME_LABELS[biome],...found});
}
await mkdir(out,{recursive:true});
const results=[];
for(const world of worlds)for(const material of MATERIALS)for(const years of YEARS){
 const rendered=renderD1a({materialId:material.id,climate:world.climate,years});
 const png=rendered.raster.png();
 const filename=[world.biome,material.id,String(years).padStart(3,'0')].join('_')+'.png';
 assert.equal(png.readUInt32BE(16),WIDTH);assert.equal(png.readUInt32BE(20),HEIGHT);
 assert.deepEqual(renderD1a({materialId:material.id,climate:world.climate,years}).raster.data,rendered.raster.data,'Nondeterminism: '+filename);
 await writeFile(out+'/'+filename,png);
 results.push({biome:world.biome,worldSeed:world.seed,material:material.id,years,state:rendered.appearance.state,filename,sha256:sha(png),
  spec:{use:rendered.spec.use,structure:rendered.spec.structure,wall:rendered.spec.wall,roofMaterial:rendered.spec.roofMaterial,foundation:rendered.spec.foundation},
  metrics:rendered.metrics,projection:{weathering:rendered.appearance.weathering,moss:rendered.appearance.moss,vines:rendered.appearance.vines,loss:rendered.appearance.loss}});
}
assert.equal(results.length,112);
for(const biome of BIOME_KINDS)for(const material of MATERIALS){
 const cases=results.filter(r=>r.biome===biome&&r.material===material.id);
 assert.deepEqual(cases.map(r=>r.years),YEARS);
 assert.ok(cases[0].metrics.visiblePixels>0);
 assert.equal(cases[0].metrics.mossPixels,0);assert.equal(cases[0].metrics.vinePixels,0);
 assert.ok(cases[2].metrics.visiblePixels<cases[1].metrics.visiblePixels,'Ruins not distinct: '+biome+'/'+material.id);
 assert.ok(cases[3].metrics.visiblePixels<=cases[2].metrics.visiblePixels,'Weathered structure gained pixels: '+biome+'/'+material.id);
 assert.ok(cases.every((r,i)=>i===0||r.projection.weathering>=cases[i-1].projection.weathering));
}
const report={
 issue:37,stage:'D1a',ruleId:RULE_ID,sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',
 status:'CONTROLLED_ART_ONLY_NOT_CONFIRMED_HISTORY',images:results.length,width:WIDTH,height:HEIGHT,
 fixtures:{vacancySince:0,ruinConfirmedAt:RUIN_CONFIRMED_AT,years:YEARS,
  building:{use:'hall',cx:160,groundY:145,width:72,height:27},
  climateSource:'generateClimateBaseline(real world seeds) baseline indices only',
  architectureSource:'drawArchitecture() and drawRuin() of existing production code',
  terrainSource:'Illustrative fixed background by biome, NOT terrain record',
  vineRootSource:'controlled climate-dependent visual proxy, NOT confirmed plant root'},
 boundaries:{modifiesProductionCode:false,modifiesWorld:false,writesSave:false,consumesCivilizationRng:false,
  physicallyDeletesBuilding:false,changesConstructionFootprint:false,
  usesRealSettlementEvents:false,testsRecordedFloraRoots:false,testsD1bGroundAccess:false,
  testsClimateHistoryCheckpoints:false,testsStaticMotionParity:false},
 caveats:[
  'Ruin at year 100 is an explicit fixture event, NOT an automatic collapse rule.',
  'Vegetation roots, spatial exposure, actual patch succession and repair/reuse belong to D1b.',
  'Background terrain is an illustrative stage, NOT the real game terrain.',
  'Surface moss/vine density and weathering are provisional display parameters.',
  'Climate change over centuries is not covered by an initial climate sample.',
 ],
 worlds:worlds.map(x=>({biome:x.biome,seed:x.seed,
  climate:{effectiveTemperature:x.climate.effectiveTemperature,effectiveMoisture:x.climate.effectiveMoisture}})),
 results,
};
await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');

const style=[
 '*{box-sizing:border-box}body{margin:0;background:#eaece5;color:#28362d;font:14px/1.6 system-ui,-apple-system,sans-serif}',
 'header{padding:26px max(16px,calc((100vw - 1350px)/2));background:#f4f2e9;border-bottom:1px solid #cacdc1}',
 'h1{font-size:25px;line-height:1.3;margin:0 0 8px}header p{max-width:850px}',
 'main{max-width:1350px;padding:16px 16px 70px;margin:auto}',
 'small{font-weight:normal;color:#607268;font-size:12px}',
 'label{display:inline-block;margin:12px 0;font-weight:600}',
 'select{font:inherit;padding:8px;border:1px solid #899887;border-radius:7px;background:#fff;color:inherit}',
 'h2{font-size:21px;margin:24px 0 20px}h3{font-size:15px;margin:0 0 6px}',
 '.material{margin:24px 0 30px}.cases{display:flex;gap:10px;overflow-x:auto;padding:4px 0 16px}',
 'figure{margin:0;flex:0 0 320px;max-width:320px}',
 'figure img{display:block;width:320px;height:180px;image-rendering:pixelated;background:#bbc3b7;border:1px solid #bdc3b5}',
 'figcaption{display:flex;justify-content:space-between;gap:4px;margin:6px 0 0}',
 '.note{background:#f4f2e9;border-left:3px solid #71846e;padding:12px 16px;margin:12px 0 22px}',
 '.biome{display:none}.biome.visible{display:block}',
 '@media(max-width:720px){header{padding:20px 16px}figure{flex-basis:280px}figure img{width:280px;height:158px}.cases{margin-right:-16px}}',
].join('');
const selector='<label for="biome">比較するバイオーム　</label><select id="biome">'+
 worlds.map(w=>'<option value="'+esc(w.biome)+'">'+esc(w.label)+'</option>').join('')+'</select>';
const notes='<div class="note"><strong>独立試作：本編の歴史ではありません。</strong>'+
 '<p>既存の建築描画を使い、見た目に風化・苔・蔦を追加。放棄から100年の廃墟化は比較用の明示イベントです。'+
 '気候は自然seedの初期指標ですが、背景はゲームの実地形ではありません。</p>'+
 '<p>苔・蔦の数値は仮値です。蔦の根元・外縁／内部地表・修繕・再利用はD1bで検証します。'+
 '画像をタップすると原寸PNGを開きます。</p></div>';
const sections=worlds.map(w=>{
 const rows=MATERIALS.map(m=>{
  const cells=results.filter(r=>r.biome===w.biome&&r.material===m.id).map(r=>
   '<figure><a href="'+r.filename+'" target="_blank"><img loading="lazy" src="'+r.filename+
   '" width="320" height="180" alt="'+esc(w.label+'・'+m.label+'・放棄から'+r.years+'年')+'"></a><figcaption>'+
   '<strong>'+(r.years===0?'放棄直後':'放棄から'+r.years+'年')+'</strong> <small>'+
   (r.state==='ruined'?'廃墟':'空き家')+'／苔'+r.metrics.mossPixels+'px・蔦'+r.metrics.vinePixels+'px</small></figcaption></figure>'
  ).join('');
  return '<div class="material"><h3>'+esc(m.label)+'</h3><div class="cases">'+cells+'</div></div>';
 }).join('');
 return '<section class="biome" data-biome="'+esc(w.biome)+'"><h2>'+esc(w.label)+
  ' <small>seed '+w.seed+' ／ 温度指標 '+w.climate.effectiveTemperature+
  ' ・湿潤指標 '+w.climate.effectiveMoisture+'</small></h2>'+rows+'</section>';
}).join('');
const script='const s=document.getElementById("biome");function show(){document.querySelectorAll(".biome").forEach(e=>e.classList.toggle("visible",e.dataset.biome===s.value));}s.addEventListener("change",show);show();';
const html='<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<title>Issue #37 D1a｜廃墟の風化</title><style>'+style+'</style>'+
 '<header><h1>Issue #37 D1a｜廃墟の経年変化</h1><p>同じ建物 × 4素材 × 放棄直後・50・200・500年。7バイオームの独立景観比較（112枚／320×180px）。</p></header>'+
 '<main>'+selector+notes+sections+'<p><a href="report.json">検証report.json</a> ／ Source '+esc(report.sourceHead)+'</p></main>'+
 '<script>'+script+'</script></html>';
await writeFile(out+'/gallery.html',html);
console.log(JSON.stringify({output:out,images:results.length,seeds:worlds.map(w=>[w.biome,w.seed]),file:'gallery.html'}));
