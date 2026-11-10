import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const config=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
const blocks=new Map();
for(const m of config.matchAll(/^  ([a-z][a-z0-9-]*):\n/gm)){
 if(!['push','pull_request','workflow_dispatch'].includes(m[1]))blocks.set(m[1],m.index);
}
const sorted=[...blocks.entries()].sort((a,b)=>a[1]-b[1]);
const getBlock=(name)=>{
 const pos=sorted.findIndex(([n])=>n===name);assert.notEqual(pos,-1,'Missing CI job '+name);
 return config.slice(sorted[pos][1],pos+1<sorted.length?sorted[pos+1][1]:config.length);
};
const heavy=[
 'visual-browser','h3-longrun','generated-housing','generated-scenes','generated-save',
 'generated-world-acceptance','organic-growth','environment','scene-motion','vegetation',
 'irrigation-acceptance','irrigation-production','coupled-baseline','coupled-effects',
 'coupled-storage','irrigation-economy','coupled-comparison','economic-production',
 'terrain-change-trial','terrain-production',
];
test('CI: core jobs remain present, all heavy jobs are conservatively full-only',()=>{
 assert.equal(sorted.length,22,'The current full suite must not silently lose a job');
 for(const name of heavy){
  const block=getBlock(name);
  assert.match(block,/^    needs: scope$/m,name+' has no dependency on the classifier');
  assert.match(block,/^    if: needs.scope.outputs.mode == 'full'$/m,name+' runs on lighter scopes');
 }
 const matrix=getBlock('generated-housing');
 assert.match(matrix,/seed: \[1, 21, 198\]/);
 assert.match(matrix,/reservation: \[wide, field-only, none\]/);
});
test('CI: classifier is the fail-closed gate and PR superseded runs are cancelled',()=>{
 const classifier=getBlock('scope');
 assert.match(classifier,/fetch-depth: 0/);
 assert.match(classifier,/node --test tests\/ci-scope.test.mjs/);
 assert.match(classifier,/node scripts\/ci-scope.mjs/);
 assert.match(config,/cancel-in-progress: \$\{\{ github.event_name == 'pull_request' \}\}/);
 assert.match(config,/CI_FORCE_FULL: \$\{\{ contains\(github.event.pull_request.labels.\*\.name, 'ci:full'\) \}\}/);
 assert.match(config,/^  workflow_dispatch:$/m);
});
test('CI: original test remains required for all non-doc PRs; prototype has independent gate',()=>{
 const block=getBlock('test');
 assert.match(block,/^    needs: scope$/m);
 assert.match(block,/^    if: needs.scope.outputs.mode != 'docs'$/m);
 assert.match(block,/npm test\n        if: needs.scope.outputs.mode == 'full'/);
 assert.match(block,/node --test tests\/architecture-prototype.test.mjs/);
 assert.match(block,/node scripts\/preview-architecture.mjs/);
 assert.match(block,/if: \$\{\{ always\(\) && needs.scope.outputs.mode == 'full' \}\}/);
});
