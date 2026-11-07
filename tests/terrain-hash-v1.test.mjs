import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainHash,terrainCoordinateHasher} from '../dist/terrain/terrain-hash-v1.js';
test('grid prefix hashing is bit-identical to the frozen UTF-8 hash at every ground coordinate',()=>{
 for(const prefix of [
  ['placement-search-review-v2',1,'house','river-bank','river-bank-1'],
  ['placement-search-review-v2',0xffffffff,'civic','hill-side','civic-hill-side-1000-great-hall'],
  ['文字🌊','e\u0301',12,NaN,Infinity],
 ]){
  const hash=terrainCoordinateHasher(prefix);
  for(let y=96;y<180;y++)for(let x=0;x<=320;x++)assert.equal(hash(x,y),terrainHash([...prefix,x,y]),`${x},${y}`);
  for(const [x,y] of [[-1,0],[321,0],[1.5,2],[NaN,Infinity],[-0,0],[320,320]])assert.equal(hash(x,y),terrainHash([...prefix,x,y]));
 }
});
test('a prepared prefix owns its values and preserves length-prefixed parts',()=>{
 const prefix=['ab','c'],hash=terrainCoordinateHasher(prefix);prefix[0]='changed';
 assert.equal(hash(10,100),terrainHash(['ab','c',10,100]));
 assert.notEqual(hash(10,100),terrainCoordinateHasher(['a','bc'])(10,100));
});
