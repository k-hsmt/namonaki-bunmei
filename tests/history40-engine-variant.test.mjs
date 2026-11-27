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
 assert.match(out,/rng\.next\(\) < __history40DrawRate\(s\)/);assert.ok(!out.includes(PRODUCTION_DRAW));
 assert.match(out,/from 'file:\/\/\/tmp\/d\/x\.js'/);
 assert.throws(()=>patchEngineSource('no draw here'),/found 0 times/);
 assert.throws(()=>patchEngineSource(`${PRODUCTION_DRAW};${PRODUCTION_DRAW}`),/found 2 times/);
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
