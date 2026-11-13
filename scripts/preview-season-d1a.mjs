/**
 * Issue #36 D1a: the same real scene in the 4 season phases (development input only, never saved or history).
 *
 *   npm run build && node scripts/preview-season-d1a.mjs  →  artifacts/season36-d1a/{report.json,gallery.html,*.png}
 *
 * 7 biomes (representative seeds) × 3 sites × 4 phases = 84 frames at native 320×180, plus the live frame of each
 * scene (no season) to prove the game's own drawing is unchanged by the prototype.
 * Env: CHROMIUM_PATH, SEASON_D1A_YEAR (default 1000), SEASON_D1A_PORT.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {generateClimateBaseline,BIOME_KINDS} from '../dist/climate/initial-climate-v1.js';
import {PLANT_ARCHETYPES} from '../dist/flora/local-flora-v1.js';
import {seasonalViewOf,plantSeasonLook,groundSeasonLook,SEASON_PARAMETERS} from '../dist/season/season-presentation-v1.js';
import {createNewArchitectureWorld} from '../dist/story/new-world.js';
import {advanceArchitectureWorld} from '../dist/architecture/production-v1.js';
import {architectureProductionSession,prepareWorldSessionSave} from '../dist/story/world-session.js';
import {encodeWorldSave} from '../dist/story/world-storage.js';

const out='artifacts/season36-d1a',year=Number(process.env.SEASON_D1A_YEAR??1000);
await mkdir(out,{recursive:true});
const LABEL={desert:'砂漠',steppe:'ステップ',grassland:'草原・サバンナ',temperate_forest:'温帯林',tropical_rainforest:'熱帯雨林',boreal_forest:'亜寒帯林',tundra:'ツンドラ'};
const PHASE=['芽吹き（位相0）','繁茂（位相1）','衰退・紅葉（位相2）','休眠（位相3）'];
const firstSeed=b=>{for(let s=1;s<20000;s++){const c=generateClimateBaseline(s);if(c.dominantBiome===b&&!c.transition)return s;}throw Error('no seed');};
const worlds=[];
for(const biome of BIOME_KINDS){
 const seed=firstSeed(biome),climate=generateClimateBaseline(seed);
 const world=architectureProductionSession(await advanceArchitectureWorld((await createNewArchitectureWorld(seed)).architecture,year,'automatic'));
 worlds.push({biome,seed,climate,views:[0,1,2,3].map(p=>seasonalViewOf(p,climate)),json:(await encodeWorldSave(await prepareWorldSessionSave(world))).json});
 console.log(biome,seed,JSON.stringify(worlds.at(-1).views.map(v=>[v.cold,v.dry])[0]));
}
const PORT=Number(process.env.SEASON_D1A_PORT??5371);
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(PORT)},stdio:['ignore','pipe','pipe']});
let browser;const frames=[];
try{
 await Promise.race([once(server.stdout,'data'),once(server,'exit').then(()=>{throw Error('server exited');})]);
 browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
 const page=await browser.newPage();page.setDefaultTimeout(900000);
 await page.route('**/__season__',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>season</title>'}));
 await page.goto('http://127.0.0.1:'+PORT+'/__season__');
 for(const w of worlds){
  const rows=await page.evaluate(async({json,year,views})=>{
   const {decodeWorldSave}=await import('/story/world-storage.js'),S=await import('/story/world-session.js'),D=await import('/scene/draw-generated-review.js');
   const session=S.restoreWorldSession(await decodeWorldSave(json)),painter=S.worldStructurePainter(session),out=[];
   for(let si=0;si<3;si++){
    const o=S.observeGeneratedWorldSession(session,year,si),live=document.createElement('canvas');S.drawWorldSession(live,session,year,si);
    const plain=document.createElement('canvas');D.drawGeneratedSceneReview(plain,o,undefined,undefined,painter);
    out.push({site:si,phase:null,png:live.toDataURL('image/png'),liveUnchanged:live.toDataURL()===plain.toDataURL()});
    for(const v of views){const c=document.createElement('canvas');D.drawGeneratedSceneReview(c,o,undefined,undefined,{...painter,flora:x=>({...painter.flora(x),season:v})});out.push({site:si,phase:v.phase,png:c.toDataURL('image/png')});}
   }
   return out;
  },{json:w.json,year,views:w.views});
  for(const r of rows)frames.push({biome:w.biome,...r});
 }
}finally{await browser?.close();server.kill();}
if(!frames.filter(f=>f.phase===null).every(f=>f.liveUnchanged))throw Error('The live drawing changed');
const assets=[];
for(const f of frames){const name=`${f.biome}_site${f.site}_${f.phase===null?'live':'phase'+f.phase}`,raw=Buffer.from(f.png.slice(f.png.indexOf(',')+1),'base64');f.name=name;await writeFile(`${out}/${name}.png`,raw);assets.push({name,sha256:createHash('sha256').update(raw).digest('hex')});}
const looks=Object.fromEntries(worlds.map(w=>[w.biome,Object.fromEntries(w.views.map(v=>[v.phase,{plants:Object.fromEntries(PLANT_ARCHETYPES.map(id=>[id,plantSeasonLook(id,v)])),ground:groundSeasonLook(w.biome,v)}]))]));
const report={issue:36,stage:'D1a',status:'PROTOTYPE — development season input; never saved, never history',year,parameters:SEASON_PARAMETERS,
 worlds:worlds.map(w=>({biome:w.biome,seed:w.seed,climate:{effectiveTemperature:w.climate.effectiveTemperature,effectiveMoisture:w.climate.effectiveMoisture,annualTemperatureRangeIndex:w.climate.annualTemperatureRangeIndex,rainfallConcentrationIndex:w.climate.rainfallConcentrationIndex},cold:w.views[0].cold,dry:w.views[0].dry})),
 liveUnchanged:true,looks,assets};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
const SITE=['川辺','丘陵','入り江'],img=(n,w=320)=>`<img src="${n}.png" width="${w}" height="${w*180/320}" loading="lazy" alt="${n}">`;
const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Issue 36 D1a 季節の比較</title>
<style>body{font:14px/1.6 system-ui,sans-serif;background:#eceee8;color:#263028;margin:0;padding:20px}main{max-width:1500px;margin:auto}.scroll{overflow-x:auto}table{border-spacing:6px}th{font-size:12px;text-align:left;white-space:nowrap}img{display:block;image-rendering:pixelated}small{color:#5d6a5f}</style>
<main><h1>Issue #36 D1a｜同じ景観×4つの季節位相</h1><p>PROTOTYPE。各世界の${year}年の実際の景観に、開発用に季節の位相だけを与えて描いた比較（保存・歴史ではない）。雪はD1b。</p>
${worlds.map(w=>`<section><h2>${LABEL[w.biome]} <small>seed ${w.seed}／寒さ ${w.views[0].cold}・乾季 ${w.views[0].dry}</small></h2><div class="scroll"><table><tr><th></th>${PHASE.map(p=>`<th>${p}</th>`).join('')}</tr>${[0,1,2].map(i=>`<tr><th>${SITE[i]}</th>${[0,1,2,3].map(p=>`<td>${img(`${w.biome}_site${i}_phase${p}`)}</td>`).join('')}</tr>`).join('')}</table></div></section>`).join('')}</main></html>`;
await writeFile(`${out}/gallery.html`,html);
console.log(JSON.stringify({type:'issue36-d1a',frames:frames.filter(f=>f.phase!==null).length,live:frames.filter(f=>f.phase===null).length,out}));
