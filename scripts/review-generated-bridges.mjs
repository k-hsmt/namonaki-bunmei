/** D3-C diagnostic footprints, not the final D4 gameplay scenery. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';import {once} from 'node:events';
import {chromium} from 'playwright';
import {generateWorldPrototype} from '../dist/terrain/world-prototype.js';
import {captureTerrainRecord} from '../dist/terrain/capture-terrain-record.js';
import {captureRiverReaches} from '../dist/terrain/river-reaches-review.js';
import {createGeneratedBridgeReview,advanceGeneratedBridgeReview} from '../dist/story/generated-bridge-review.js';
const out='artifacts/terrain31-bridge-visual';await mkdir(out,{recursive:true});
const terrain=captureTerrainRecord(generateWorldPrototype(6).world,process.env.REVIEW_SOURCE_SHA??'local-unidentified');
const initial=createGeneratedBridgeReview(terrain,captureRiverReaches(terrain),'field-only');assert.equal(initial.status,'review-only');
const {review}=advanceGeneratedBridgeReview(initial,2000,'automatic'),years=[755,756,1096,1104,1289,2000];
await writeFile(out+'/review-state.json',JSON.stringify(review));
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'5298'},stdio:['ignore','pipe','inherit']});let browser;
try{
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 const page=await browser.newPage();await page.route('**/bridge-review',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>D3-C bridge diagnostics</title>'}));
 await page.goto('http://127.0.0.1:5298/bridge-review');const cases=[];
 for(const year of years){
  const result=await page.evaluate(async ({review:r,year})=>{
   const {validateTerrainRecord}=await import('/terrain/terrain-record.js');const {drawTerrainRecord}=await import('/terrain/draw-terrain-record-v1.js');
   const {siteAt}=await import('/story/settlement-history.js');const {housingAt}=await import('/story/housing-history.js');const {publicSpacesAt}=await import('/story/public-space-history.js');
   const {withGeneratedBridgeAccess}=await import('/story/generated-bridge-history-review.js');const {southEntrance,groundContextWindows,groundDistances}=await import('/terrain/ground-access-review.js');
   const {decodeRecordPhysics}=await import('/terrain/terrain-record-raster-v1.js');
   const site='river-bank',canvas=document.createElement('canvas');drawTerrainRecord(canvas,validateTerrainRecord(r.terrain),site);
   const c=canvas.getContext('2d'),terrainPng=canvas.toDataURL(),homes=housingAt(r.state.housing,year,site).blocks,spaces=publicSpacesAt(r.state.publicSpaces,year,'generated-review-only').spaces.filter(p=>p.siteId===site);
   const facilities=r.placements.filter(p=>p.site===site&&p.builtYear<=year),view=siteAt(r.state.observation.sites,0,year),bridge=view.buildings.find(b=>b.kind==='bridge');
   const occupancy=[...facilities.map(p=>({id:p.objectId,plot:p.plot,entrance:p.entrance})),...homes.map(b=>({id:b.blockId,plot:b.footprint,entrance:southEntrance(b.footprint)})),...spaces.map(p=>({id:p.id,plot:p.footprint,entrance:southEntrance(p.footprint)}))];
   const ctx=withGeneratedBridgeAccess(r,{terrain:r.terrain,site,year,confirmedYear:2000,historyStatus:'known',primaryRoot:r.plans[site].primaryRoot,occupancy,reservations:[]});
   const distance=groundDistances(groundContextWindows(decodeRecordPhysics(r.terrain.sites[site].physics),ctx),ctx.primaryRoot);
   c.save();if(r.terrain.sites[site].render.mirrorX){c.translate(320,0);c.scale(-1,1);}
   const paint=(p,color)=>{c.fillStyle=color;c.fillRect(p.x,p.y,p.width,p.depth);};
   for(const p of facilities)paint(p.plot,'#ad8f62');for(const b of homes)paint(b.footprint,'#8a5960');for(const p of spaces)paint(p.footprint,'#b5b095');
   const saved=r.bridgeReview.bridges.find(b=>b.builtYear<=year);let portals=[];
   if(saved){const g=saved.geometry;for(const p of g.bankSupports)paint(p,'#77674b');
    if(bridge.condition==='intact')paint(g.deck,'#b99559');else for(const x of [g.deck.x,g.deck.x+g.deck.width-8])paint({...g.deck,x,width:8},'#685541');
    portals=[g.bankA,g.bankB].map(point=>({point,connected:distance[point[1]*320+point[0]]>=0}));
    for(const p of portals){c.fillStyle=p.connected?'#baf48e':'#e86057';c.fillRect(p.point[0],p.point[1],2,2);}
   }
   c.fillStyle='#ffffff';c.fillRect(ctx.primaryRoot[0],ctx.primaryRoot[1],2,2);c.restore();
   const large=document.createElement('canvas');large.width=1280;large.height=720;const z=large.getContext('2d');z.imageSmoothingEnabled=false;z.drawImage(canvas,0,0,1280,720);
   return {terrain:terrainPng,raw:canvas.toDataURL(),large:large.toDataURL(),condition:bridge?.condition??'unbuilt',crossings:ctx.crossings.length,portals};
  },{review,year});
  for(const kind of ['terrain','raw','large'])await writeFile(`${out}/seed6_year${year}_${kind}.png`,Buffer.from(result[kind].split(',')[1],'base64'));
  cases.push({year,condition:result.condition,crossings:result.crossings,portals:result.portals});
 }
 const legend='D3-C diagnostic footprints only. Brown: ordinary facilities; red: housing; gold: intact deck; dark stubs: damaged or ruined deck. Green/red dots: connected/disconnected portals. White: primary root. These are not final gameplay sprites.';
 await writeFile(out+'/index.html','<!doctype html><meta charset="utf-8"><title>D3-C bridge diagnostics</title><style>body{background:#eee8da;font:16px sans-serif;color:#354333}img{image-rendering:pixelated;max-width:100%}section{margin-bottom:32px}</style><h1>Seed 6, field-only reservation</h1><p>'+legend+'</p>'+cases.map(c=>`<section><h2>Year ${c.year}: ${c.condition}, active crossings ${c.crossings}</h2><img width="320" height="180" src="seed6_year${c.year}_raw.png"><br><img src="seed6_year${c.year}_large.png"></section>`).join(''));
 await writeFile(out+'/report.json',JSON.stringify({status:'D3C_DIAGNOSTIC_ONLY',sourceSHA:process.env.REVIEW_SOURCE_SHA??'local-unidentified',legend,cases},null,2));
 console.log(JSON.stringify({status:'D3C_DIAGNOSTIC_ONLY',scenes:cases.length}));
}finally{await browser?.close();server.kill();}
