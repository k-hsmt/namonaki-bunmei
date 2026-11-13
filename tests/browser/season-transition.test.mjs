/** Issue #36 D3: season blends when a step changes the phase, and throttled redraws at fast auto-advance speeds. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {createNewArchitectureWorld} from '../../dist/story/new-world.js';
import {advanceArchitectureWorld} from '../../dist/architecture/production-v1.js';
import {architectureProductionSession,prepareWorldSessionSave} from '../../dist/story/world-session.js';
import {encodeWorldSave} from '../../dist/story/world-storage.js';

const port=process.env.SEASON_TRANSITION_TEST_PORT??'5245',origin='http://127.0.0.1:'+port;
let server,browser,json;
test.before(async()=>{
 json=(await encodeWorldSave(await prepareWorldSessionSave(architectureProductionSession(await advanceArchitectureWorld((await createNewArchitectureWorld(6)).architecture,130,'automatic'))))).json;
 server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:port},stdio:['ignore','pipe','inherit']});
 await once(server.stdout,'data',{signal:AbortSignal.timeout(10000)});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
});
test.after(async()=>{try{await browser?.close();}finally{server?.kill();}});

const playerPage=async(t,reducedMotion)=>{
 const p=await browser.newPage({reducedMotion});t.after(()=>p.close());const errors=[];p.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await p.route('**/season-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>season</title><canvas id="scene"></canvas><input id="motion" type="checkbox" checked>'}));
 await p.goto(origin+'/season-test');
 await p.evaluate(async json=>{const {decodeWorldSave}=await import('/story/world-storage.js'),{restoreWorldSession}=await import('/story/world-session.js'),{SceneMotionPlayer}=await import('/scene/motion-player.js');
  window.world=restoreWorldSession(await decodeWorldSave(json));window.player=new SceneMotionPlayer(document.getElementById('scene'),document.getElementById('motion'));},json);
 return p;
};

test('D3: a step that changes the season phase blends it; same phase, past observation, site changes and reduced motion do not',async t=>{
 const p=await playerPage(t,'no-preference');
 const step=(year,site,ms)=>p.evaluate(([y,s,m])=>{window.player.show(window.world,y,s,m);return window.player.isTransitioning;},[year,site,ms]);
 assert.equal(await step(20,0,0),false,'first view');
 assert.equal(await step(30,0,250),true,'phase 0 → 1 blends');
 await p.waitForFunction(()=>!window.player.isTransitioning,null,{timeout:3000});
 assert.equal(await step(40,0,250),false,'same phase (25–49): no blend');
 assert.equal(await step(60,1,250),false,'another site: no blend');
 assert.equal(await step(80,1,0),false,'the caller passes 0 for past observation and other jumps');
 assert.equal(await step(50,1,250),false,'an earlier year never blends');
 // A blend ends on its own.
 await step(100,1,250);await p.waitForFunction(()=>!window.player.isTransitioning,null,{timeout:3000});
 const reduced=await playerPage(t,'reduce');
 assert.equal(await reduced.evaluate(()=>{window.player.show(window.world,20,0);window.player.show(window.world,30,0,250);return window.player.isTransitioning;}),false,'reduced motion: immediate');
});

test('D3: at the rapid speed the scene and its year label are redrawn together at most every 1400 ms; stopping shows the latest year',async t=>{
 const p=await browser.newPage({reducedMotion:'no-preference'});t.after(()=>p.close());const errors=[];p.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await p.addInitScript(v=>{if(!sessionStorage.getItem('seeded')){localStorage.clear();localStorage.setItem('namonaki-story-v10',v);sessionStorage.setItem('seeded','1');}},json);
 await p.goto(origin);await p.waitForFunction(()=>!document.getElementById('save').disabled,{timeout:120000});
 await p.selectOption('#speed','rapid');await p.click('#play');
 const samples=await p.evaluate(async()=>{const out=[],t0=performance.now();while(performance.now()-t0<5600){out.push([Math.round(performance.now()-t0),document.getElementById('scene-year').textContent]);await new Promise(r=>setTimeout(r,40));}return out;});
 const changes=samples.filter((s,i)=>i&&s[1]!==samples[i-1][1]).map(s=>s[0]);
 assert.ok(changes.length>=2,'years advance: '+changes.length);
 for(let i=1;i<changes.length;i++)assert.ok(changes[i]-changes[i-1]>=1300,'redraws are at least ~1400 ms apart: '+changes.join(','));
 await p.click('#play');await p.waitForTimeout(300);
 const [scene,label]=await p.evaluate(()=>[document.getElementById('scene-year').textContent,document.getElementById('year').textContent]);
 const year=s=>Number(s.replace(/[^0-9]/g,' ').trim().split(/\s+/)[0]);
 assert.equal(year(scene),year(label),'after stopping, the scene shows the latest confirmed year: '+scene+' / '+label);
});
