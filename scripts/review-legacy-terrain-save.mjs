/** D2-B: compare old views and v5-draft views, including pinned baseline pixels. */
import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {once} from 'node:events';
import {mkdir,readFile,writeFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {chromium} from 'playwright';
import {parseHousingSave} from '../dist/story/housing-persistence.js';
import {parseLegacyCompatibleSave,serializeLegacySaveDraft} from '../dist/story/legacy-terrain-save.js';
import {auditLegacyTerrain} from './audit-legacy-terrain-save.mjs';
const root='tests/fixtures/legacy-terrain/',output='artifacts/terrain31-legacy';await mkdir(output,{recursive:true});
const manifest=JSON.parse(await readFile(root+'manifest.json','utf8')),longrun=await auditLegacyTerrain(output);
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'5301'},stdio:['ignore','pipe','inherit']});let browser;
try{
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 const source=await browser.newPage(),reader=await browser.newPage(),errors=[],blocked=[];
 for(const p of [source,reader]){p.on('pageerror',e=>errors.push(e.message));await p.route('**/legacy-review',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Legacy compatibility review</title>'}));}
 await reader.route('**/terrain/**',r=>{blocked.push(r.request().url());return r.abort();});
 await Promise.all([source.goto('http://127.0.0.1:5301/legacy-review'),reader.goto('http://127.0.0.1:5301/legacy-review')]);
 const cases=[],frames=[];
 for(const item of manifest.cases){
  const b=await readFile(root+item.file),raw=item.file.endsWith('.gz')?gunzipSync(b).toString():b.toString(),baseline=parseHousingSave(raw),draft=parseLegacyCompatibleSave(raw),json=serializeLegacySaveDraft(draft);
  await writeFile(output+'/'+item.id+'_source.json',raw);await writeFile(output+'/'+item.id+'_draft.json',json);
  const before=await source.evaluate(async({state,views})=>{
   const {snapshotAt}=await import('/scene/model.js'),{drawScene}=await import('/scene/draw.js'),out=[];
   for(const v of views){const c=document.createElement('canvas');drawScene(c,snapshotAt(state,v.year,v.site),state.seed,state.housing);out.push(c.toDataURL('image/png'));}return out;
  },{state:baseline,views:item.views});
  const after=await reader.evaluate(async({raw,json,item})=>{
   const {parseLegacyCompatibleSave,findLegacyDraftSave}=await import('/story/legacy-terrain-save.js');
   const {drawLegacySaveDraft,observeLegacySaveDraft}=await import('/scene/legacy-terrain-view.js');
   localStorage.clear();const key='namonaki-story-v'+item.sourceVersion;localStorage.setItem(key,raw);
   const beforeStorage=JSON.stringify(Object.entries(localStorage).sort()),selected=findLegacyDraftSave(k=>localStorage.getItem(k));
   if(JSON.stringify(Object.entries(localStorage).sort())!==beforeStorage||selected.key!==key)throw Error('reader mutated legacy storage');
   const d=parseLegacyCompatibleSave(json),beforeState=JSON.stringify(d),out=[];
   for(const v of item.views){
    const c=document.createElement('canvas');drawLegacySaveDraft(c,d,v.year,v.site);
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',c.getContext('2d').getImageData(0,0,320,180).data))].map(b=>b.toString(16).padStart(2,'0')).join('');
    if(hash!==v.rgbaSha256)throw Error('baseline RGBA mismatch '+item.id+' '+v.year+' '+v.site);
    const big=document.createElement('canvas');big.width=1280;big.height=720;const z=big.getContext('2d');z.imageSmoothingEnabled=false;z.drawImage(c,0,0,1280,720);
    out.push({raw:c.toDataURL('image/png'),large:big.toDataURL('image/png'),hash,evidence:observeLegacySaveDraft(d,v.year,v.site).constructionEvidence});
   }
   localStorage.setItem('namonaki-story-v5',json);
   const selectedV5=findLegacyDraftSave(k=>localStorage.getItem(k));
   if(selectedV5.key!=='namonaki-story-v5'||JSON.stringify(selectedV5.draft)!==JSON.stringify(d)||localStorage.getItem(key)!==raw||localStorage.getItem('namonaki-story-v5')!==json)throw Error('v5 candidate selection changed state or storage');
   for(const bad of ['{ broken',JSON.stringify({version:5,format:'unknown'})]){
    localStorage.setItem('namonaki-story-v5',bad);let rejected=false;
    try{findLegacyDraftSave(k=>localStorage.getItem(k));}catch{rejected=true;}
    if(!rejected||localStorage.getItem(key)!==raw||localStorage.getItem('namonaki-story-v5')!==bad)throw Error('corrupt v5 silently fell back or changed storage');
   }
   if(JSON.stringify(d)!==beforeState)throw Error('observation changed draft state');return out;
  },{raw,json,item});
  for(let i=0;i<item.views.length;i++){
   assert.equal(after[i].raw,before[i],item.id+' '+JSON.stringify(item.views[i]));const v=item.views[i],prefix=item.id+'_year'+v.year+'_site'+v.site;
   for(const [key,suffix] of [['raw','320x180'],['large','4x']])await writeFile(output+'/'+prefix+'_'+suffix+'.png',Buffer.from(after[i][key].split(',')[1],'base64'));
   if(v.year===item.confirmedYear)frames.push({label:item.id+' | year '+v.year+' | site '+v.site+' | '+item.housingStatus,raw:after[i].raw});
  }
  cases.push({id:item.id,sourceVersion:item.sourceVersion,year:item.year,confirmedYear:item.confirmedYear,pending:item.pending,housingStatus:item.housingStatus,views:item.views.length,pngEqual:true,pinnedRgbaEqual:true,readOnlyStorage:true});
 }
 const quota=await reader.evaluate(({v4,draft})=>{
  localStorage.clear();let firstWrite='saved',secondWrite='not-attempted';
  try{localStorage.setItem('namonaki-story-v4',v4);}catch(e){firstWrite=e.name;}
  const beforeOld=localStorage.getItem('namonaki-story-v4'),beforeNew=localStorage.getItem('namonaki-story-v5');
  if(firstWrite==='saved'){
   try{localStorage.setItem('namonaki-story-v5',draft);secondWrite='saved';}catch(e){secondWrite=e.name;}
   if(localStorage.getItem('namonaki-story-v4')!==beforeOld)throw Error('quota probe lost v4');
   if(secondWrite!=='saved'&&localStorage.getItem('namonaki-story-v5')!==beforeNew)throw Error('failed write changed v5');
  }
  return {firstWrite,secondWrite,oldKeyPreserved:localStorage.getItem('namonaki-story-v4')===beforeOld,scope:'Fresh localhost test context only; no application writer implemented'};
 },{v4:longrun.v4Json,draft:longrun.draftJson});
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
 const sheet=await reader.evaluate(async frames=>{
  const c=document.createElement('canvas');c.width=1024;c.height=106+Math.ceil(frames.length/3)*216;const z=c.getContext('2d');z.imageSmoothingEnabled=false;
  z.fillStyle='#f4f0e6';z.fillRect(0,0,c.width,c.height);z.fillStyle='#354333';z.font='24px sans-serif';z.fillText('D2-B | old saves keep their landscapes',16,35);z.font='14px sans-serif';
  z.fillText('v2 / v3 / v4 | normal and pending | fixed legacy terrain | no generated geography added',16,66);
  for(let i=0;i<frames.length;i++){const px=16+(i%3)*336,py=86+Math.floor(i/3)*216;z.fillStyle='#354333';z.font='13px sans-serif';z.fillText(frames[i].label,px,py+18);
   const im=new Image();im.src=frames[i].raw;await im.decode();z.drawImage(im,px,py+27);}return c.toDataURL('image/png');
 },frames);
 await writeFile(output+'/terrain31_legacy_comparison.png',Buffer.from(sheet.split(',')[1],'base64'));
 const report={status:'LEGACY_DRAFT_REVIEW_ONLY',sourceHead:process.env.REVIEW_SOURCE_SHA??'local-unidentified',baselineSource:manifest.baselineSource,
  cases,scenes:cases.reduce((n,c)=>n+c.views,0),newTerrainImports:blocked,quotaProbe:quota,
  limitations:['No live v5 key activation','No generated terrain assigned to old worlds','Quota coexistence requires D4 user-facing handling']};
 await writeFile(output+'/browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();server.kill();}
