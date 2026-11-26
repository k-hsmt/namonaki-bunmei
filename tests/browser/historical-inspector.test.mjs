/** Issue #39 D2: "調べる" — picking recorded targets from the real visible pixels of the still scene (D0 §5, §6, §10 D2). */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {chromium} from 'playwright';
import {createNewArchitectureWorld} from '../../dist/story/new-world.js';
import * as P from '../../dist/architecture/production-v1.js';
import {architectureProductionSession,prepareWorldSessionSave} from '../../dist/story/world-session.js';
import {serializeWorldSave} from '../../dist/story/world-save.js';

const port=process.env.BROWSER_TEST_PORT??'5368',origin=`http://127.0.0.1:${port}`,END=1200;
let server,browser;const saves={};

test.before(async()=>{
 server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 const dir=await mkdtemp(path.join(tmpdir(),'issue39-'));
 // seed 42: no mirrored site, a waterway built in 575 and backfilled in 675; seed 1: every site mirrored
 for(const seed of [42,1]){
  const world=await P.advanceArchitectureWorld((await createNewArchitectureWorld(seed)).architecture,END,'automatic');
  saves[seed]=path.join(dir,`world-${seed}.json`);await writeFile(saves[seed],serializeWorldSave(await prepareWorldSessionSave(architectureProductionSession(world))));
 }
 // D3: seed 42 stopped at its first choice (the pending year is not confirmed)
 const pending=await P.advanceArchitectureWorld((await createNewArchitectureWorld(42)).architecture,END,'stop');
 assert.ok(pending.terrain.review.state.pending,'seed 42 reaches a choice before '+END);
 saves.pending=path.join(dir,'world-42-pending.json');await writeFile(saves.pending,serializeWorldSave(await prepareWorldSessionSave(architectureProductionSession(pending))));
});
test.after(async()=>{try{await browser?.close();}finally{server?.kill();}});

async function open(t,seed,options={}){
 const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1280,height:1100},...options});t.after(()=>page.close());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.goto(origin);await page.waitForFunction(()=>!document.getElementById('import').disabled,null,{timeout:120000});
 await page.setInputFiles('#import-file',saves[seed]);
 await page.waitForFunction(()=>document.getElementById('feedback').textContent.includes('記録ファイルを開きました'),null,{timeout:120000});
 return page;
}
const observe=(page,year)=>page.evaluate(y=>{const s=document.getElementById('rewind-year');s.value=String(y);s.dispatchEvent(new Event('input'));},year);
const site=(page,index)=>page.selectOption('#site-select',String(index));
/** The same mask the page builds, computed by the root modules over the same save (read-only). */
const maskInfo=async(page,seed,year,si)=>page.evaluate(async([json,year,si])=>{
 const S=await import('/story/world-session.js'),WS=await import('/story/world-save.js'),M=await import('/scene/historical-pick-mask.js'),H=await import('/story/historical-records.js');
 const session=window.__issue39??=S.restoreWorldSession(await WS.parseWorldSaveAsync(json));
 const m=M.buildPickMask(session,year,si),src=H.historicalSourceOf(session);
 const still=document.createElement('canvas');S.drawWorldSession(still,session,year,si);
 const a=still.getContext('2d').getImageData(0,0,320,180).data,b=m.composed.getContext('2d').getImageData(0,0,320,180).data;let differing=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])differing++;
 const targets=m.targets.map((ref,i)=>{
  const s=H.historicalSubjectAt(src,ref,year),pixels=M.targetPixels(m,i);
  // the pixel nearest the middle of the target's visible pixels (a pixel of the target itself)
  let best=null;if(pixels.length){const cx=pixels.reduce((n,p)=>n+p%320,0)/pixels.length,cy=pixels.reduce((n,p)=>n+Math.floor(p/320),0)/pixels.length;
   for(const p of pixels){const d=(p%320-cx)**2+(Math.floor(p/320)-cy)**2;if(!best||d<best.d)best={d,x:p%320,y:Math.floor(p/320)};}}
  return {ref,title:s.title,presence:s.presence,siteId:s.siteId,visible:m.visiblePixels[i],point:best&&[best.x,best.y]};
 });
 const records=H.historicalTargetsAt(src,H.historicalSiteIds[si],year).map(s=>({ref:s.ref,title:s.title}));
 return {differing,targets,records,conflicts:m.conflicts.size,mirror:session.review.review.terrain.sites[H.historicalSiteIds[si]].render.mirrorX===true};
},[await readFile(saves[seed],'utf8'),year,si]);
async function clickScene(page,[x,y],how='mouse'){
 // mouse and touch events only reach what is inside the viewport
 await page.evaluate(()=>document.getElementById('scene').scrollIntoView({block:'center'}));
 const box=await page.locator('#scene').boundingBox(),border=await page.evaluate(()=>document.getElementById('scene').clientLeft);
 const view=page.viewportSize();assert.ok(box.y>=0&&box.y+box.height<=view.height,'the scene is fully in view');
 const px=box.x+border+(x+.5)*(box.width-2*border)/320,py=box.y+border+(y+.5)*(box.height-2*border)/180;
 if(how==='touch')await page.touchscreen.tap(px,py);else await page.mouse.click(px,py);
}
const openRecords=page=>page.evaluate(()=>{document.getElementById('inspector-records').open=true;});
const sceneRGBA=page=>page.evaluate(()=>Array.from(document.getElementById('scene').getContext('2d').getImageData(0,0,320,180).data));

test('D2: the mask is of the real still frame; every visible target is picked by clicking its own pixels (normal and mirrored sites)',async t=>{
 for(const seed of [42,1]){
  const page=await open(t,seed);await page.click('#inspect-toggle');
  let mirrored=false;
  for(const [year,si] of [[600,0],[1000,0],[1000,1],[1200,2]]){
   await observe(page,year);await site(page,si);
   const info=await maskInfo(page,seed,year,si);mirrored||=info.mirror;
   assert.equal(info.differing,0,`${seed}/${year}/${si}: the mask's layers recompose the live still frame exactly`);
   assert.equal(info.conflicts,0);
   const listed=new Set(info.records.map(r=>JSON.stringify(r.ref)));
   for(const target of info.targets){
    assert.equal(target.presence,'recorded',`${target.title} is a recorded target of ${year}`);
    assert.ok(listed.has(JSON.stringify(target.ref)),`${target.title} is in the land record`);
    if(!target.visible)continue;
    await clickScene(page,target.point);
    assert.equal(await page.locator('#inspector-name').textContent(),target.title,`${seed}/${year}/${si}: click at ${target.point}`);
   }
  }
  assert.equal(mirrored,seed===1,'seed 1 exercises the mirrored drawing');
 }
});

test('D2: a covered target is never picked from the landscape and is read from the land record only',async t=>{
 const page=await open(t,42);await page.click('#inspect-toggle');
 // the waterway was backfilled in 675: recorded, not drawn
 await observe(page,1000);
 let info=await maskInfo(page,42,1000,0);
 assert.ok(!info.targets.some(x=>x.ref.kind==='waterway'));
 const water=info.records.find(r=>r.ref.kind==='waterway');assert.ok(water);
 await openRecords(page);
 await page.locator('#inspector-hidden button',{hasText:water.title}).click();
 assert.equal(await page.locator('#inspector-name').textContent(),water.title);
 assert.match(await page.locator('#inspector-state').textContent(),/記録はありますが.*見えていません.*埋め戻されている/);
 assert.equal(await page.evaluate(()=>document.getElementById('scene-pick').getContext('2d').getImageData(0,0,320,180).data.some(v=>v!==0)),false,'nothing is outlined for a target that is not visible');
 // a housing block covered by plants (seed 42, coast, 1000)
 await site(page,2);info=await maskInfo(page,42,1000,2);
 const covered=info.targets.find(x=>x.visible===0);assert.ok(covered,'a drawn but fully covered target exists');
 assert.ok(await page.locator('#inspector-hidden button',{hasText:covered.title}).count());
 assert.equal(await page.locator('#inspector-visible button',{hasText:covered.title}).count(),0);
 // clicking every pixel the block is drawn at never selects it
 for(const x of info.targets.filter(x=>x.visible))await clickScene(page,x.point);
 assert.notEqual(await page.locator('#inspector-name').textContent(),covered.title);
});

test('D2: investigating reads only — the world, its save and the scene canvas are unchanged; turning it off restores the scene',async t=>{
 const page=await open(t,42);await observe(page,1000);
 const exported=async()=>{const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);return readFile(await d.path(),'utf8');};
 const before=await exported(),pixels=await sceneRGBA(page);
 await page.click('#inspect-toggle');
 assert.deepEqual(await sceneRGBA(page),pixels,'the scene canvas is not drawn on');
 const info=await maskInfo(page,42,1000,0);
 for(const x of info.targets.filter(x=>x.visible).slice(0,6))await clickScene(page,x.point);
 assert.ok(await page.evaluate(()=>document.getElementById('scene-pick').getContext('2d').getImageData(0,0,320,180).data.some(v=>v!==0)),'the outline is on its own layer');
 await openRecords(page);await page.locator('#inspector-hidden button').first().click();
 assert.deepEqual(await sceneRGBA(page),pixels);
 await page.click('#inspector-close');
 assert.equal(await page.locator('#inspector').isVisible(),false);
 assert.equal(await page.evaluate(()=>document.getElementById('scene-pick').getContext('2d').getImageData(0,0,320,180).data.some(v=>v!==0)),false);
 assert.deepEqual(await sceneRGBA(page),pixels);
 assert.equal(await exported(),before,'the exported history is byte-identical');
 assert.match(await page.locator('#past-note').textContent(),/1,000年/,'the observed year did not move');
});

test('D2: a touch reaches a small target nearby, offers close candidates, and keyboard users read the land record',async t=>{
 const page=await open(t,42,{viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
 await observe(page,1000);await page.click('#inspect-toggle');
 // a pixel where no target is drawn but one lies within the touch reach (12 CSS px; 1 CSS px per scene pixel here)
 const near=await page.evaluate(async json=>{
  const S=await import('/story/world-session.js'),WS=await import('/story/world-save.js'),M=await import('/scene/historical-pick-mask.js');
  const session=window.__issue39??=S.restoreWorldSession(await WS.parseWorldSaveAsync(json)),m=M.buildPickMask(session,1000,0);
  const radius=Math.max(1,Math.min(8,Math.round(12/(document.getElementById('scene').clientWidth/320))));
  let one=null,many=null;
  for(let y=100;y<175&&!(one&&many);y++)for(let x=0;x<320;x++){
   if(m.owners[y*320+x]!==M.PICK_NONE)continue;const found=M.pickAt(m,x,y,radius);
   if(found.length===1&&!one)one={point:[x,y],target:m.targets[found[0]]};
   if(found.length>1&&!many)many={point:[x,y],count:found.length};
  }
  return {one,many,radius};
 },await readFile(saves[42],'utf8'));
 assert.ok(near.one&&near.many,'the frame has both cases');
 await clickScene(page,near.one.point,'touch');
 assert.ok(await page.locator('#inspector-subject').isVisible(),'a touch beside a small target still reaches it');
 await clickScene(page,near.many.point,'touch');
 const candidates=page.locator('#inspector-candidates button');
 assert.equal(await candidates.count(),near.many.count);
 const first=await page.locator('#inspector-name').textContent();
 await candidates.nth(1).click();
 assert.notEqual(await page.locator('#inspector-name').textContent(),first,'the other candidate can be chosen');
 // the scene keeps its 16:9 ratio; the panel is outside the canvas
 const box=await page.locator('#scene').boundingBox();assert.ok(Math.abs(box.width/box.height-16/9)<.02);
 assert.equal(await page.evaluate(()=>document.getElementById('scene-canvas').contains(document.getElementById('inspector'))),false);
 // keyboard: the toggle, the land record and its buttons
 await page.click('#inspector-close');
 await page.focus('#inspect-toggle');await page.keyboard.press('Enter');
 await page.evaluate(()=>{document.getElementById('inspector-records').open=false;});
 await page.focus('#inspector-records summary');await page.keyboard.press('Enter');
 assert.equal(await page.evaluate(()=>document.getElementById('inspector-records').open),true,'the land record opens from the keyboard');
 await page.focus('#inspector-visible button');await page.keyboard.press('Enter');
 assert.ok(await page.locator('#inspector-subject').isVisible());
 await page.locator('#inspector-subject').focus().catch(()=>{});await page.keyboard.press('Escape');
});

test('D2: a choice is checked again for each year and site; a new world clears it; the moving view holds still while investigating',async t=>{
 const page=await open(t,42,{reducedMotion:'no-preference'});
 await page.evaluate(()=>{const c=document.getElementById('scene-motion');if(!c.checked)c.click();});
 assert.equal(await page.locator('#scene-motion').isChecked(),true);
 await observe(page,1000);await page.click('#inspect-toggle');
 assert.equal(await page.locator('#scene-motion').isChecked(),false,'the still frame is investigated');
 assert.equal(await page.locator('#scene-motion').isDisabled(),true);
 // choose the bridge built in 777, then look at 700 and 1135 (damaged)
 await openRecords(page);
 await page.locator('#inspector-records button',{hasText:'橋'}).first().click();
 assert.match(await page.locator('#inspector-name').textContent(),/^川辺の橋（777年建設）$/);
 await observe(page,700);
 assert.equal(await page.locator('#inspector-name').textContent(),'川辺の橋','no construction year from the future');
 assert.equal(await page.locator('#inspector-state').textContent(),'この年にはまだ建てられていません。');
 assert.equal(await page.locator('#inspector-history li').count(),0);
 await observe(page,1135);
 assert.match(await page.locator('#inspector-state').textContent(),/損傷して渡れない/);
 await site(page,1);
 assert.equal(await page.locator('#inspector-subject').isVisible(),false,'a river-bank choice is cleared on the hill side');
 await page.click('#inspector-close');
 assert.equal(await page.locator('#scene-motion').isChecked(),true,'the viewer preference comes back');
 await page.click('#inspect-toggle');await openRecords(page);await page.locator('#inspector-visible button').first().click();
 await page.setInputFiles('#import-file',saves[1]);
 await page.waitForFunction(()=>document.getElementById('feedback').textContent.includes('記録ファイルを開きました'),null,{timeout:120000});
 assert.equal(await page.locator('#inspector-subject').isVisible(),false,'another world clears the choice');
});

// ---- D3: from a recorded change to its year ----
const rows=page=>page.evaluate(()=>[...document.querySelectorAll('#inspector-history li')].map(li=>({text:li.textContent,chronicle:li.querySelector('.chronicle')?.textContent.replace(/^年代記：/,'')??null,source:li.querySelector('button').dataset.source,disabled:li.querySelector('button').getAttribute('aria-disabled')==='true'})));
const stillAt=async(page,seed,year,si)=>page.evaluate(async([json,year,si])=>{
 const S=await import('/story/world-session.js'),WS=await import('/story/world-save.js');
 const session=window.__issue39??=S.restoreWorldSession(await WS.parseWorldSaveAsync(json)),c=document.createElement('canvas');S.drawWorldSession(c,session,year,si);
 const a=c.getContext('2d').getImageData(0,0,320,180).data,b=document.getElementById('scene').getContext('2d').getImageData(0,0,320,180).data;let d=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])d++;return d;
},[await readFile(saves[seed],'utf8'),year,si]);

test('D3: a recorded change opens its own year in the scene, chronicle, status, graph and panel together',async t=>{
 const page=await open(t,42);
 await page.click('.civ-metric[data-metric="population"]');
 await page.click('#inspect-toggle');await openRecords(page);
 await page.locator('#inspector-records button',{hasText:'橋'}).first().click();
 for(const [year,state] of [[1135,'損傷して渡れない'],[777,'渡ることができる']]){
  const row=(await rows(page)).find(r=>r.source.startsWith(`river-bank-7@${year}#`));assert.ok(row&&row.chronicle,`the ${year} change has its chronicle entry`);
  await page.locator(`#inspector-history button[data-source="${row.source}"]`).click();
  const label=new Intl.NumberFormat('ja-JP').format(year);
  assert.match(await page.locator('#past-note').textContent(),new RegExp(`世界暦 ${label}年の風景を観測中`));
  assert.equal(await page.locator('#rewind-year').inputValue(),String(year));
  assert.equal(await page.locator('#headline').textContent(),row.chronicle,'the chronicle shows the entry of that change');
  assert.match(await page.locator('#civ-status-year').textContent(),new RegExp(`^世界暦 ${label}年の確定値（当時）`));
  assert.match(await page.locator('#civ-graph-summary').textContent(),new RegExp(`観測中の${label}年`));
  assert.equal(await stillAt(page,42,year,0),0,'the scene is the still frame of that confirmed year');
  assert.equal(await page.locator('#inspector-state').textContent(),`世界暦 ${label}年の状態：${state}`);
  const after=await rows(page);
  assert.ok(after.every(r=>Number(r.source.split('@')[1].split('#')[0])<=year),'the panel lists nothing after the observed year');
  assert.deepEqual([after.at(-1).source,after.at(-1).chronicle,after.at(-1).disabled],[row.source,row.chronicle,true],'the observed change is the last row, its button disabled');
  assert.equal(await page.locator('#inspector-history button[aria-disabled=true]').textContent(),'この年を観測中');
 }
 // keyboard: Enter on a row moves there and keeps focus on that row
 const first=(await rows(page))[0];
 await page.evaluate(()=>document.getElementById('return-now').click());
 await page.focus(`#inspector-history button[data-source="${first.source}"]`);await page.keyboard.press('Enter');
 assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.source),first.source);
 assert.equal(await page.locator('#rewind-year').inputValue(),first.source.split('@')[1].split('#')[0]);
});

test('D3: moving to a year stops automatic progress and keeps the choice and the investigation',async t=>{
 const page=await open(t,42);
 await page.click('#inspect-toggle');await openRecords(page);
 await page.locator('#inspector-records button',{hasText:'共同会堂'}).first().click();
 await page.click('#play');assert.match(await page.locator('#play').textContent(),/停止/);
 const row=(await rows(page))[0];
 await page.locator(`#inspector-history button[data-source="${row.source}"]`).click();
 assert.match(await page.locator('#play').textContent(),/自動で見守る/,'automatic progress stopped');
 assert.equal(await page.locator('#inspector').isVisible(),true);
 assert.match(await page.locator('#inspector-name').textContent(),/共同会堂/,'the same target stays chosen');
 const year=await page.locator('#rewind-year').inputValue();
 await page.waitForTimeout(1200);assert.equal(await page.locator('#rewind-year').inputValue(),year,'nothing moved it afterwards');
});

test('D3: with a choice pending, the records end at the last confirmed year and the choice is kept',async t=>{
 const page=await open(t,'pending');
 assert.equal(await page.locator('#choice').isVisible(),true);
 const confirmed=Number(await page.locator('#rewind-year').getAttribute('max'));
 await page.click('#inspect-toggle');await openRecords(page);
 const buttons=page.locator('#inspector-records button');const n=await buttons.count();assert.ok(n>0);
 let moved=false;
 for(let i=0;i<n;i++){
  await openRecords(page);await buttons.nth(i).click();
  for(const r of await rows(page))assert.ok(Number(r.source.split('@')[1].split('#')[0])<=confirmed,'no unconfirmed year');
  const target=(await rows(page)).find(r=>!r.disabled);
  if(!moved&&target){await page.locator(`#inspector-history button[data-source="${target.source}"]`).click();moved=true;
   assert.equal(await page.locator('#choice').isVisible(),false,'the past view hides the choice');
   await page.click('#return-now');assert.equal(await page.locator('#choice').isVisible(),true,'and the choice is still waiting');}
 }
 assert.ok(moved);
});

// ---- D4: two confirmed years side by side ----
const canvasDiff=async(page,seed,id,year,si)=>page.evaluate(async([json,id,year,si])=>{
 const S=await import('/story/world-session.js'),WS=await import('/story/world-save.js');
 const session=window.__issue39??=S.restoreWorldSession(await WS.parseWorldSaveAsync(json)),c=document.createElement('canvas');S.drawWorldSession(c,session,year,si);
 const a=c.getContext('2d').getImageData(0,0,320,180).data,b=document.getElementById(id).getContext('2d').getImageData(0,0,320,180).data;let d=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])d++;return d;
},[await readFile(saves[seed],'utf8'),id,year,si]);
const painted=(page,id)=>page.evaluate(id=>document.getElementById(id).getContext('2d').getImageData(0,0,320,180).data.some(v=>v!==0),id);
async function openHallComparison(page){
 await page.click('#inspect-toggle');await openRecords(page);
 await page.locator('#inspector-records button',{hasText:'共同会堂'}).first().click();
 await page.evaluate(()=>{document.getElementById('inspector-records').open=false;});
 await page.click('#compare-open');
}

test('D4: both images are the real still frames of their own years; changing the comparison year moves nothing else',async t=>{
 const page=await open(t,42);await observe(page,1000);
 await page.click('.civ-metric[data-metric="food"]');
 const before={scene:await sceneRGBA(page),past:await page.locator('#past-note').textContent(),graph:await page.locator('#civ-graph-summary').textContent(),headline:await page.locator('#headline').textContent()};
 await openHallComparison(page);
 assert.equal(await page.locator('#compare-ref-year').textContent(),'比較元 · 世界暦 1,000年','the reference is the observed year');
 assert.equal(await page.locator('#compare-cmp-year').textContent(),'比較先 · 世界暦 800年','the default is the target\'s first record, not a guessed peak');
 const set=async how=>{await how();return Number(await page.locator('#compare-year').inputValue());};
 const years=[];
 years.push(await set(()=>page.selectOption('#compare-event',{label:'世界暦 799年 · 建設の前年'})));
 years.push(await set(async()=>{await page.fill('#compare-year','450');await page.locator('#compare-year').dispatchEvent('change');}));
 years.push(await set(()=>page.click('#compare-plus')));
 years.push(await set(()=>page.click('#compare-minus')));
 years.push(await set(async()=>{await page.evaluate(()=>{const r=document.getElementById('compare-range');r.value='1150';r.dispatchEvent(new Event('change'));});}));
 years.push(await set(async()=>{await page.fill('#compare-year','99999');await page.locator('#compare-year').dispatchEvent('change');}));
 years.push(await set(async()=>{await page.fill('#compare-year','-5');await page.locator('#compare-year').dispatchEvent('change');}));
 assert.deepEqual(years,[799,450,451,450,1150,END,0],'event year, typed, ±1, slider, and clamped to the confirmed range');
 for(const year of [799,0,END,1135]){
  await page.fill('#compare-year',String(year));await page.locator('#compare-year').dispatchEvent('change');
  assert.equal(await canvasDiff(page,42,'compare-cmp',year,0),0,`comparison ${year} is the normal still frame`);
  assert.equal(await canvasDiff(page,42,'compare-ref',1000,0),0,'the reference stays the normal still frame of 1000');
 }
 assert.deepEqual({scene:await sceneRGBA(page),past:await page.locator('#past-note').textContent(),graph:await page.locator('#civ-graph-summary').textContent(),headline:await page.locator('#headline').textContent()},before,
  'the main scene, observed year, graph and chronicle do not move');
 // each side is described from its own year; the mark is off by default and never drawn where the target is absent
 await page.selectOption('#compare-event',{label:'世界暦 799年 · 建設の前年'});
 assert.match(await page.locator('#compare-cmp-state').textContent(),/^川辺の大きな共同会堂：この年にはまだ建てられていません。$/);
 assert.match(await page.locator('#compare-ref-state').textContent(),/世界暦 1,000年の状態：建っている/);
 assert.equal(await painted(page,'compare-ref-mark'),false);
 await page.check('#compare-mark');
 assert.equal(await painted(page,'compare-ref-mark'),true);assert.equal(await painted(page,'compare-cmp-mark'),false);
 assert.equal(await canvasDiff(page,42,'compare-ref',1000,0),0,'the mark is a separate layer');
 // only the explicit action moves the observed year; the reference stays
 await page.click('#compare-observe');
 assert.match(await page.locator('#past-note').textContent(),/世界暦 799年の風景を観測中/);
 assert.equal(await page.locator('#compare-ref-year').textContent(),'比較元 · 世界暦 1,000年');
 assert.equal(await page.locator('#compare-observe').textContent(),'この年を観測中');
});

test('D4: progress never moves the fixed years; layouts are side by side on a PC and stacked on a phone; leaving closes it',async t=>{
 const page=await open(t,42);
 await openHallComparison(page);
 assert.match(await page.locator('#play').textContent(),/自動で見守る/,'opening the comparison holds automatic progress');
 const pc=[await page.locator('#compare-ref').boundingBox(),await page.locator('#compare-cmp').boundingBox()];
 assert.ok(Math.abs(pc[0].y-pc[1].y)<1&&pc[1].x>pc[0].x+pc[0].width-1,'side by side');
 for(const b of pc)assert.ok(Math.abs(b.width/b.height-16/9)<.02,'each keeps 16:9');
 // the viewer advances the world by hand: both years stay where they were
 const year=await page.locator('#year').textContent();await page.click('#step');
 await page.waitForFunction(y=>document.getElementById('year').textContent!==y&&!document.getElementById('play').disabled,year,{timeout:60000});
 assert.equal(await page.locator('#compare-ref-year').textContent(),'比較元 · 世界暦 1,200年');
 assert.equal(await page.locator('#compare-cmp-year').textContent(),'比較先 · 世界暦 800年');
 assert.equal(await canvasDiff(page,42,'compare-ref',END,0),0,'the confirmed year draws the same after progress');
 // leaving the site, the investigation or the world closes it
 await page.selectOption('#site-select','1');assert.equal(await page.locator('#compare').isVisible(),false);
 await page.selectOption('#site-select','0');await page.click('#compare-open');assert.equal(await page.locator('#compare').isVisible(),true);
 await page.click('#inspector-close');await page.click('#inspect-toggle');assert.equal(await page.locator('#compare').isVisible(),false);
 await page.click('#compare-open');
 await page.setInputFiles('#import-file',saves[1]);
 await page.waitForFunction(()=>document.getElementById('feedback').textContent.includes('記録ファイルを開きました'),null,{timeout:120000});
 assert.equal(await page.locator('#compare').isVisible(),false,'another world discards the comparison');
 // a phone stacks the two images, each at full width and 16:9
 const phone=await open(t,42,{viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
 await openHallComparison(phone);
 const sp=[await phone.locator('#compare-ref').boundingBox(),await phone.locator('#compare-cmp').boundingBox()];
 assert.ok(sp[1].y>=sp[0].y+sp[0].height&&Math.abs(sp[0].x-sp[1].x)<1,'stacked');
 for(const b of sp)assert.ok(Math.abs(b.width/b.height-16/9)<.02);
 assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'no sideways scroll');
});
