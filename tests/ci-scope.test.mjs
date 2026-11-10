import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseCiScope} from '../scripts/ci-scope.mjs';

const cases=[
 ['markdown design', ['docs/issue35-architecture-design.md'],'docs'],
 ['readme', ['README.md'],'docs'],
 ['docs with image', ['docs/issue35-d1-visual-prototype.md','docs/review.png'],'docs'],
 ['architecture experiment', ['scripts/preview-architecture.mjs'],'prototype'],
 ['architecture catalog', ['scripts/lib/architecture-prototype.mjs','tests/architecture-prototype.test.mjs'],'prototype'],
 ['architecture plus docs', ['scripts/preview-architecture.mjs','docs/issue35-d1-visual-prototype.md'],'prototype'],
 ['shared raster helper', ['scripts/lib/pixel-raster.mjs'],'full'],
 ['story history', ['src/story/engine.ts'],'full'],
 ['saved world', ['src/story/world-save.ts'],'full'],
 ['scene drawing', ['src/scene/draw.ts'],'full'],
 ['terrain', ['src/terrain/model.ts'],'full'],
 ['environment', ['src/environment/progression-v1.ts'],'full'],
 ['irrigation', ['src/irrigation/progression-v1.ts'],'full'],
 ['unknown script', ['scripts/audit-generated-longrun.mjs'],'full'],
 ['other unit tests', ['tests/world-save.test.mjs'],'full'],
 ['GitHub CI changes', ['.github/workflows/ci.yml'],'full'],
 ['Pages changes', ['.github/workflows/pages.yml'],'full'],
 ['package manifests', ['package-lock.json'],'full'],
 ['mixed prototype and core', ['scripts/preview-architecture.mjs','src/story/engine.ts'],'full'],
 ['mixed docs and workflow', ['docs/issue35-d1-visual-prototype.md','.github/workflows/ci.yml'],'full'],
 ['mixed docs and shared source', ['README.md','scripts/lib/pixel-raster.mjs'],'full'],
 ['unknown extension under docs', ['docs/executable.mjs'],'full'],
 ['unrecognized top-level file', ['newfile'],'full'],
 ['empty list', [],'full'],
 ['invalid path', ['../README.md'],'full'],
 ['newline in filename', ['docs/file\nbad.md'],'full'],
];
test('PR classifier: only explicitly safe paths lower the scope',()=>{
 for(const [name,files,expected]of cases)assert.equal(chooseCiScope(files),expected,name);
});
test('main push, manual dispatch and PR full override always run full',()=>{
 for(const event of ['push','workflow_dispatch','schedule'])
  assert.equal(chooseCiScope(['docs/issue35-architecture-design.md'],{event}),'full',event);
 assert.equal(chooseCiScope(['scripts/preview-architecture.mjs'],{forceFull:true}),'full','label ci:full');
 assert.equal(chooseCiScope(['docs/readme.md'],{forceFull:true}),'full');
});
test('unknown / malformed changed-path list fails closed',()=>{
 for(const paths of [null,undefined,'docs/abc.md',[null],[3],[{}],[''],['/abs/path'],['docs\\readme.md']])
  assert.equal(chooseCiScope(paths),'full');
});
test('a rename must be treated as both removal and addition, never silently ignored',()=>{
 assert.equal(chooseCiScope(['scripts/preview-architecture.mjs','src/story/world-save.ts']),'full');
});
