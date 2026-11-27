/**
 * Issue #40 D1b (Human decision 2a): a review-only copy of story/engine for the draw-rate experiment.
 *
 * The copy is generated mechanically from the built production module (dist/story/engine.js) at run time, never kept
 * in src/ and never loaded by the game. Exactly one expression is replaced: the yearly event-draw probability
 * `s.year < 30 ? .12 : .19`. Its RNG use is kept (one rng.next() per year, compared with the given probability), so
 * a variant consumes the stream exactly as production until the outcomes differ. Generation fails if the expression
 * is not found exactly once (production changed: the experiment must be revisited, not silently adapted).
 * The caller proves the copy faithful by running the production rate through it and comparing with production.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

const DIST=fileURLToPath(new URL('../../dist/story/',import.meta.url));
// The production probability (when no review-only event policy is passed). D2a moved it into one expression of step().
export const PRODUCTION_DRAW='probability = policy ? policy.drawProbability(s) : (s.year < 30 ? .12 : .19)';
export const DRAW_PATCH=Object.freeze({find:PRODUCTION_DRAW,replace:'probability = policy ? policy.drawProbability(s) : __history40.drawRate(s)'});

/**
 * The copy's source: production with each patch's `find` replaced by its `replace` (each must occur exactly once) and
 * relative imports resolved against `dir`. Patched code calls hooks on `__history40` (set with setHistory40Hooks).
 */
export function patchEngineSource(source,dir=DIST,patches=[DRAW_PATCH]){
 let rewritten=source.replace(/from '(\.{1,2}\/[^']+)'/g,(_,rel)=>`from '${pathToFileURL(path.resolve(dir,rel)).href}'`);
 for(const {find,replace} of patches){
  const at=rewritten.split(find).length-1;
  if(at!==1)throw Error(`the production expression "${find}" was found ${at} times in dist/story/engine.js (expected 1)`);
  rewritten=rewritten.replace(find,replace);
 }
 return `let __history40={};\nexport function setHistory40Hooks(h){__history40={...h};}\nexport function setHistory40DrawRate(f){__history40={...__history40,drawRate:f};}\n${rewritten}`;
}
/** Generates and imports one copy. `name` keeps copies with different patches apart. */
export async function loadEngineVariant(outDir,patches=[DRAW_PATCH],name='engine-variant'){
 const module=patchEngineSource(await readFile(path.join(DIST,'engine.js'),'utf8'),DIST,patches);
 await mkdir(outDir,{recursive:true});const file=path.join(outDir,`${name}.mjs`);await writeFile(file,module);
 return import(pathToFileURL(file).href);
}

/** The experimental rates (illustrative settings for isolating the hypothesis, not proposals for the game). */
const hardship=s=>((s.food<40?1:s.food<55?.5:0)+(s.cohesion<40?1:s.cohesion<55?.5:0)+(s.drought>2?1:s.drought>0?.5:0)+(s.epidemic>0?1:0))/4;
const lastEvent=s=>Math.max(-Infinity,...Object.values(s.lastKind));
export const DRAW_VARIANTS=Object.freeze({
 production:{rate:s=>s.year<30?.12:.19,description:'現行：29年まで12%、以後19%（状態によらない）'},
 'fixed-half':{rate:s=>s.year<30?.06:.095,description:'対照：現行の半分の固定率（件数だけの効果を分ける）'},
 'hardship-linked':{rate:s=>.07+.40*hardship(s),description:'困難に連動：7%＋40%×困難度（food・cohesionの低さ、干ばつ、疫病の4項目の平均）'},
 momentum:{rate:s=>{const d=s.year-lastEvent(s);return .09+.30*Math.exp(-(Number.isFinite(d)?d:1e9)/6);},description:'直前の出来事に連動：9%＋30%×exp(−経過年/6)（出来事が続きやすい）'},
});
