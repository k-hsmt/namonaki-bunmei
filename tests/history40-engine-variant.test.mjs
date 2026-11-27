import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import * as production from '../dist/story/engine.js';
import {patchEngineSource,loadEngineVariant,DRAW_VARIANTS,PRODUCTION_DRAW} from '../scripts/lib/history40-engine-variant.mjs';

// Issue #40 D1b: the review-only engine copy for the draw-rate experiment.
test('engine copy: exactly one draw expression is replaced; anything else fails closed', () => {
 const src=`import { a } from './x.js';\nif (${PRODUCTION_DRAW}) {}`;
 const out=patchEngineSource(src,'/tmp/d');
 assert.match(out,/rng\.next\(\) < __history40\.drawRate\(s\)/);assert.ok(!out.includes(PRODUCTION_DRAW));
 assert.match(out,/from 'file:\/\/\/tmp\/d\/x\.js'/);
 assert.throws(()=>patchEngineSource('no draw here'),/found 0 times/);
 assert.throws(()=>patchEngineSource(`${PRODUCTION_DRAW};${PRODUCTION_DRAW}`),/found 2 times/);
 // several patches: every one must be found exactly once
 assert.throws(()=>patchEngineSource(src,'/tmp/d',[{find:PRODUCTION_DRAW,replace:'x'},{find:'missing',replace:'y'}]),/"missing" was found 0 times/);
});

test('engine copy: the production rate reproduces production exactly; a variant changes only what follows a different draw', async t => {
 const dir=await mkdtemp(path.join(os.tmpdir(),'history40-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const copy=await loadEngineVariant(dir);
 const run=(engine,seed,years)=>{const s=engine.createCivilization(seed);while(s.year<years){engine.step(s);if(s.pending)engine.chooseAutomatically(s);}return s;};
 copy.setHistory40DrawRate(DRAW_VARIANTS.production.rate);
 for(const seed of [3,4,6])assert.equal(JSON.stringify(run(copy,seed,600)),JSON.stringify(run(production,seed,600)));
 copy.setHistory40DrawRate(DRAW_VARIANTS['fixed-half'].rate);
 const half=run(copy,6,600),base=run(production,6,600);
 assert.notEqual(JSON.stringify(half.history),JSON.stringify(base.history));
 assert.equal(half.history[0].title,base.history[0].title);// the founding is drawn before any yearly draw
 for(const v of Object.values(DRAW_VARIANTS))for(const s of [half,base]){const p=v.rate(s);assert.ok(p>0&&p<1);}
});

test('engine copy: several patches (draw, capacity, food knowledge, pressure) with production hooks reproduce production', async t => {
 const dir=await mkdtemp(path.join(os.tmpdir(),'history40-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const {DRAW_PATCH}=await import('../scripts/lib/history40-engine-variant.mjs');
 const copy=await loadEngineVariant(dir,[DRAW_PATCH,
  {find:'const carrying = 14000 + s.knowledge * 560 + s.exchange * 220 + waterways * 5500 + trade * 2500;',replace:'const carrying = __history40.carrying(s, waterways, trade);'},
  {find:'(s.knowledge - 35) * .025',replace:'(__history40.foodKnowledge(s) - 35) * .025'},
  {find:'pressure * 2.6',replace:'pressure * __history40.pressureFood(s)'}],'engine-population');
 copy.setHistory40Hooks({drawRate:s=>s.year<30?.12:.19,carrying:(s,w,tr)=>14000+s.knowledge*560+s.exchange*220+w*5500+tr*2500,foodKnowledge:s=>s.knowledge,pressureFood:()=>2.6});
 const run=(engine,seed)=>{const s=engine.createCivilization(seed);while(s.year<800){engine.step(s);if(s.pending)engine.chooseAutomatically(s);}return JSON.stringify(s);};
 for(const seed of [1,18])assert.equal(run(copy,seed),run(production,seed));
});
