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
export const PRODUCTION_DRAW='rng.next() < (s.year < 30 ? .12 : .19)';

/** The copy's source: production with the draw probability replaced and relative imports resolved against `dir`. */
export function patchEngineSource(source,dir=DIST){
 const at=source.split(PRODUCTION_DRAW).length-1;
 if(at!==1)throw Error(`the production draw expression was found ${at} times in dist/story/engine.js (expected 1)`);
 const rewritten=source.replace(/from '(\.{1,2}\/[^']+)'/g,(_,rel)=>`from '${pathToFileURL(path.resolve(dir,rel)).href}'`)
  .replace(PRODUCTION_DRAW,'rng.next() < __history40DrawRate(s)');
 return `let __history40DrawRate=null;\nexport function setHistory40DrawRate(f){__history40DrawRate=f;}\n${rewritten}`;
}
export async function loadEngineVariant(outDir){
 const module=patchEngineSource(await readFile(path.join(DIST,'engine.js'),'utf8'));
 await mkdir(outDir,{recursive:true});const file=path.join(outDir,'engine-variant.mjs');await writeFile(file,module);
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
