import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createHousingCivilization,parseHousingSave,serializeHousingSave} from '../../dist/story/housing-persistence.js';
import {step,chooseAutomatically} from '../../dist/story/engine.js';
import {siteAt} from '../../dist/story/settlement-history.js';
import {housingAt} from '../../dist/story/housing-history.js';
import {snapshotAt} from '../../dist/scene/model.js';
import {reviewPublicSpaceFoundation,appendConfirmedPublicSpace} from '../../dist/story/public-space-history.js';
const PNG=src=>Buffer.from(src.split(',')[1],'base64');

test('H4-D7-A: 自然史の背景と、手動で確定した公共空地のデザイン試作を区別',async()=>{
 const seed=42,year=160;
 const state=createHousingCivilization(seed);
 while(state.year<year){step(state);if(state.pending)chooseAutomatically(state);}
 const baseline=parseHousingSave(serializeHousingSave(state));
 const buildings=siteAt(state.observation.sites,0,year).buildings;
 const housing=housingAt(state.housing,year,'river-bank');
 assert.equal(housing.status,'known');
 const anchors=buildings.filter(b=>['hall','market'].includes(b.kind)&&b.condition==='intact');
 const recordId=year+'-visual-fixture';
 let choice,record;
 for(const anchor of anchors){
  for(const y of [119,126,133,140,147,154,160]){
   for(const x of [5,17,29,41,53,65,77,89,101,210,222,234,246,258,270,282]){
    const candidate={
     id:'public-river-bank-visual-160',siteId:'river-bank',establishedYear:year,
     anchorBuildingId:anchor.id,kind:anchor.kind==='market'?'market-yard':'assembly-ground',
     footprint:{x,y,width:24,depth:10},foundationRecordId:recordId,condition:'used',
    };
    const event={id:recordId,year,kind:'public-space-established',publicSpaceId:candidate.id};
    const gate=reviewPublicSpaceFoundation({
     siteIndex:0,year,candidate,buildings,housingBlocks:housing.blocks,
     existing:[],housingStatus:'known',records:[event],
    });
    if(gate.status==='clear'){choice=candidate;record=event;break;}
   }
   if(choice)break;
  }
  if(choice)break;
 }
 assert.ok(choice,'安全な手動試作敷地が存在すること');
 // 演出のためだけに自然進行の歴史を書き換えない。別の試作コピーに明示イベントを付与。
 const hypothetical=parseHousingSave(serializeHousingSave(state));
 hypothetical.history.push({...record,tag:'地域',title:'設計試作として共同の空地が定められる',
  body:'この画像は正式な自然進行による歴史ではない。',
  causes:['描画と土地履歴の回帰試験'],relatedIds:[]});
 hypothetical.publicSpaces=appendConfirmedPublicSpace({
  history:{schemaVersion:1,introducedYear:0,legacyUntracked:false,events:[]},
  year,candidate:choice,buildings,housingBlocks:housing.blocks,records:hypothetical.history,
 });
 const restored=parseHousingSave(serializeHousingSave(hypothetical));
 const base=snapshotAt(baseline,year,0);
 const staged=snapshotAt(hypothetical,year,0);
 const earlier=snapshotAt(hypothetical,year-1,0);
 assert.equal(base.publicSpaces,undefined);
 assert.equal(earlier.publicSpaces,undefined);
 assert.deepEqual(staged.publicSpaces,[choice]);
 assert.deepEqual(snapshotAt(restored,year,0),staged);
 const server=spawn(process.execPath,['scripts/serve.mjs'],{
  env:{...process.env,PORT:'5292'},stdio:['ignore','pipe','inherit']});
 let browser;
 try{
  await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  const page=await browser.newPage({viewport:{width:1024,height:768}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5292');
  const result=await page.evaluate(async({base,staged,earlier,housing,seed})=>{
   const {drawScene}=await import('/scene/draw.js');
   const paint=(snap)=>{
    const canvas=document.createElement('canvas');
    drawScene(canvas,snap,seed,housing);
    if(canvas.width!==320||canvas.height!==180)throw Error('unexpected canvas resolution');
    return canvas.toDataURL('image/png');
   };
   const present=paint(staged),repeat=paint(staged);
   if(present!==repeat)throw Error('nondeterministic graphics');
   const original=paint(base),previous=paint(earlier);
   if(present===original)throw Error('historical public space does not change the pixels');
   const canvas=document.createElement('canvas');
   canvas.width=1280;canvas.height=720;
   const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
   const image=new Image();image.src=present;
   await image.decode();ctx.drawImage(image,0,0,1280,720);
   return {present,original,previous,large:canvas.toDataURL('image/png')};
  },{base,staged,earlier,housing:state.housing,seed});
  assert.deepEqual(errors,[]);
  await mkdir('artifacts/h4d7a-design',{recursive:true});
  await Promise.all([
   writeFile('artifacts/h4d7a-design/baseline_ACTUAL_seed42_year160.png',PNG(result.original)),
   writeFile('artifacts/h4d7a-design/concept_MANUAL_FIXTURE_NOT_NATURAL_seed42_year160.png',PNG(result.present)),
   writeFile('artifacts/h4d7a-design/concept_MANUAL_FIXTURE_NOT_NATURAL_4x.png',PNG(result.large)),
   writeFile('artifacts/h4d7a-design/preYear159_ACTUAL_without_public_space.png',PNG(result.previous)),
   writeFile('artifacts/h4d7a-design/provenance.json',JSON.stringify({
    note:'MANUAL FIXTURE ONLY: public space was not formed by natural progression; baseline and prior-year are actual natural history.',
    seed,year,candidate:choice,constructionRecordId:recordId,
    expectedDifference:'only at/after explicit establishment, not retroactively',
   },null,2)),
  ]);
 }finally{await browser?.close();server.kill();}
});
