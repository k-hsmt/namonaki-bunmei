/** Issue #29 S2/S3: the civilization-wide status bar and the one-metric history graph in the live page. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import test from 'node:test';
import {chromium} from 'playwright';
import {createNewArchitectureWorld} from '../../dist/story/new-world.js';
import {advanceWorldSessionAsync,chooseWorldSessionAsync} from '../../dist/story/world-session.js';
import {lastObservedYear} from '../../dist/story/engine.js';
import {civilizationStatusView,graphWindow,yearAtFraction} from '../../dist/story/civilization-status-view.js';

const port=process.env.BROWSER_TEST_PORT??'5367',origin=`http://127.0.0.1:${port}`,format=new Intl.NumberFormat('ja-JP');
const STEPS=40,PLOT={left:52,right:632,width:640};
let server,browser,world;

test.before(async()=>{
 server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 // The same world the page reaches below: seed 42, STEPS presses of "時を進める", a pending choice resolved with the first option.
 world=await createNewArchitectureWorld(42);
 for(let i=0;i<STEPS;i++)world=world.state.pending?await chooseWorldSessionAsync(world,0):await advanceWorldSessionAsync(world);
});
test.after(async()=>{try{await browser?.close();}finally{server?.kill();}});

async function open(t,options={}){
 const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1280,height:1000},...options});t.after(()=>page.close());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.goto(origin);await page.waitForFunction(()=>!document.getElementById('restart').disabled,null,{timeout:60000});
 await page.fill('#seed','42');await page.click('#restart');
 await page.waitForFunction(()=>document.getElementById('feedback').textContent.includes('新しい文明が生まれました'),null,{timeout:60000});
 for(let i=0;i<STEPS;i++){
  const year=await page.locator('#year').textContent();
  if(await page.locator('#choice').isVisible())await page.locator('#options button').first().click();else await page.click('#step');
  await page.waitForFunction(y=>document.getElementById('year').textContent!==y&&!document.getElementById('play').disabled,year,{timeout:30000});
 }
 return page;
}
const barTexts=page=>page.evaluate(()=>['population','food','cohesion','knowledge','culture'].map(k=>[document.getElementById(k).textContent,document.getElementById(k+'-change').textContent]));
const expectedBar=(state,year,population)=>civilizationStatusView(state,year,population).rows.map(r=>[r.valueText,r.change.text]);
async function clickPlotAtYear(page,win,year,pointerType){
 const box=await page.locator('#civ-graph-plot').boundingBox(),vx=PLOT.left+(year-win.from)/(win.to-win.from)*(PLOT.right-PLOT.left);
 const x=box.x+vx/PLOT.width*box.width,y=box.y+box.height/2;
 if(pointerType==='mouse'){await page.mouse.click(x,y);return;}
 for(const type of ['pointerdown','pointerup'])await page.locator('#civ-graph-plot').dispatchEvent(type,{pointerType,pointerId:7,isPrimary:true,button:0,clientX:x,clientY:y,bubbles:true});
}

test('S2: the status bar shows the five confirmed civilization-wide values under the scene, the same for every site',async t=>{
 const page=await open(t),state=world.state,year=lastObservedYear(state);
 assert.deepEqual(await page.evaluate(()=>{const c=document.getElementById('scene');return [c.width,c.height];}),[320,180]);
 const order=await page.evaluate(()=>{const c=document.getElementById('scene'),bar=document.getElementById('civ-status');return Boolean(c.compareDocumentPosition(bar)&Node.DOCUMENT_POSITION_FOLLOWING)&&!c.contains(bar);});
 assert.ok(order,'the bar is outside and after the 320×180 scene');
 const population=await page.evaluate(()=>document.getElementById('population').textContent);
 const expected=expectedBar(state,year);
 assert.deepEqual(await barTexts(page),expected);assert.equal(population,expected[0][0]);
 assert.match(await page.locator('#civ-status-year').textContent(),new RegExp(`^世界暦 ${format.format(year)}年の確定値`));
 for(const site of ['1','2','0']){await page.selectOption('#site-select',site);assert.deepEqual(await barTexts(page),expected,'site '+site);}
 assert.equal(await page.locator('.stats').count(),0,'the duplicated lower figures are gone');
 assert.equal(await page.locator('#civ-graph').isVisible(),false,'the graph starts closed');
});

test('S3: one metric graph opens and closes; mouse observes a year at once and keeps the window',async t=>{
 const page=await open(t),state=world.state,last=lastObservedYear(state);
 await page.click('.civ-metric[data-metric="food"]');
 assert.equal(await page.locator('#civ-graph').isVisible(),true);
 assert.equal(await page.getAttribute('.civ-metric[data-metric="food"]','aria-pressed'),'true');
 await page.click('.civ-metric[data-metric="culture"]');
 assert.match(await page.locator('#civ-graph-title').textContent(),/^文化の推移/);
 assert.equal(await page.getAttribute('.civ-metric[data-metric="food"]','aria-pressed'),'false');
 await page.click('.civ-graph-ranges [data-range="50"]');
 const win=graphWindow(last,50,last),target=win.from+17;
 const ticks=await page.locator('#civ-graph-plot .tick').allTextContents();
 await clickPlotAtYear(page,win,target,'mouse');
 const observed=yearAtFraction(win,(target-win.from)/(win.to-win.from));
 assert.equal(await page.locator('#scene-year').textContent(),`世界暦 ${format.format(observed)}年`);
 assert.equal(await page.locator('#past-notice').isVisible(),true);
 assert.equal(await page.inputValue('#rewind-year'),String(observed));
 assert.deepEqual(await barTexts(page),expectedBar(state,observed));
 assert.deepEqual(await page.locator('#civ-graph-plot .tick').allTextContents(),ticks,'the window did not re-center on the observed year');
 // A right click does not observe anything.
 const box=await page.locator('#civ-graph-plot').boundingBox();
 await page.mouse.click(box.x+box.width*.2,box.y+box.height/2,{button:'right'});
 assert.equal(await page.locator('#scene-year').textContent(),`世界暦 ${format.format(observed)}年`);
 await page.click('#return-now');
 assert.equal(await page.locator('#past-notice').isVisible(),false);
 assert.deepEqual(await barTexts(page),expectedBar(state,last));
 // Observing the last confirmed year is the live view, as on the slider.
 await clickPlotAtYear(page,graphWindow(last,50,last),last,'mouse');
 assert.equal(await page.locator('#past-notice').isVisible(),false);
 await page.click('#civ-graph-close');assert.equal(await page.locator('#civ-graph').isVisible(),false);
});

test('S3: touch only proposes a year until "この年を観測"; the year input and ±1 reach the same confirmed year',async t=>{
 const page=await open(t,{hasTouch:true}),state=world.state,last=lastObservedYear(state);
 await page.click('.civ-metric[data-metric="population"]');
 const win=graphWindow(last,200,last),target=win.from+Math.round((win.to-win.from)/3),before=await page.locator('#scene-year').textContent();
 await clickPlotAtYear(page,win,target,'touch');
 const proposed=yearAtFraction(win,(target-win.from)/(win.to-win.from));
 assert.match(await page.locator('#civ-graph-candidate').textContent(),new RegExp(`^候補：世界暦 ${format.format(proposed)}年`));
 assert.equal(await page.locator('#scene-year').textContent(),before,'a touch does not move the scene');
 assert.equal(await page.locator('#past-notice').isVisible(),false);
 await page.click('#civ-graph-observe');
 assert.equal(await page.locator('#scene-year').textContent(),`世界暦 ${format.format(proposed)}年`);
 await page.fill('#civ-graph-year','12');await page.locator('#civ-graph-year').dispatchEvent('change');
 await page.click('#civ-graph-plus');
 assert.match(await page.locator('#civ-graph-candidate').textContent(),/^候補：世界暦 13年/);
 await page.click('#civ-graph-observe');
 assert.equal(await page.locator('#scene-year').textContent(),'世界暦 13年');
 assert.deepEqual(await barTexts(page),expectedBar(state,13));
 // An empty year field is ignored (not year 0).
 await page.fill('#civ-graph-year','');await page.locator('#civ-graph-year').dispatchEvent('change');
 assert.match(await page.locator('#civ-graph-candidate').textContent(),/^マウスでは/);
 // Observing a year outside the current window moves the window just enough to show it.
 await page.click('.civ-graph-ranges [data-range="50"]');
 await page.fill('#civ-graph-year','3');await page.locator('#civ-graph-year').dispatchEvent('change');await page.click('#civ-graph-observe');
 assert.equal(await page.locator('#scene-year').textContent(),'世界暦 3年');
 assert.equal(await page.locator('#civ-graph-plot line.observed').count(),1,'the observed year is drawn');
 // A year beyond the last confirmed one is clamped, never observed as unconfirmed.
 await page.fill('#civ-graph-year',String(last+500));await page.locator('#civ-graph-year').dispatchEvent('change');
 assert.match(await page.locator('#civ-graph-candidate').textContent(),new RegExp(`^候補：世界暦 ${format.format(last)}年`));
 // Moving the history on discards an unconfirmed proposal.
 await page.click('#return-now');await page.fill('#civ-graph-year','5');await page.locator('#civ-graph-year').dispatchEvent('change');
 const year=await page.locator('#year').textContent();
 if(await page.locator('#choice').isVisible())await page.locator('#options button').first().click();else await page.click('#step');
 await page.waitForFunction(y=>document.getElementById('year').textContent!==y,year,{timeout:30000});
 assert.doesNotMatch(await page.locator('#civ-graph-candidate').textContent(),/^候補/);
});
