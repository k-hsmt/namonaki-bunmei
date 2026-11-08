import test from 'node:test';import assert from 'node:assert/strict';
import {emptyRecordRaster} from '../dist/terrain/terrain-record-raster-v1.js';
import {planWaterTracks,waterStrokeAt} from '../dist/scene/water-motion.js';
test('river strokes travel toward the saved outlet around an island and ignore disconnected pools',()=>{
 const r=emptyRecordRaster();for(let y=100;y<140;y++)for(let x=20;x<32;x++)r.surface[y*320+x]=2;
 for(let y=110;y<116;y++)for(let x=24;x<28;x++)r.surface[y*320+x]=1;
 for(let y=100;y<110;y++)for(let x=70;x<80;x++)r.surface[y*320+x]=2;
 const before=r.surface.slice(),tracks=planWaterTracks(r,[[26,139]],[{point:[26,107],phase:0},{point:[74,103],phase:1}]);assert.equal(tracks.length,1);
 const t=tracks[0];assert.equal(t.kind,'river');assert.ok(t.path.at(-1)[1]>107);assert.ok(t.path.some(([x])=>x<24||x>=28),'flow must curve around island');
 for(let n=0;n<t.path.length;n++){const [x,y]=t.path[n];assert.equal(r.surface[y*320+x],2);if(n)assert.equal(Math.abs(x-t.path[n-1][0])+Math.abs(y-t.path[n-1][1]),1);}
 assert.notDeepEqual(waterStrokeAt(t,0).point,waterStrokeAt(t,2).point);assert.deepEqual(r.surface,before);
});
test('sea crests approach the actual shoreline and fade before repeating',()=>{
 const r=emptyRecordRaster();for(let y=96;y<180;y++)for(let x=99;x<130;x++)r.surface[y*320+x]=x===99?1:3;
 const [t]=planWaterTracks(r,[],[{point:[112,120],phase:0}]);assert.equal(t.kind,'sea');assert.ok(t.path.at(-1)[0]<t.path[0][0]);
 const a=waterStrokeAt(t,0),b=waterStrokeAt(t,3);assert.equal(a.alpha,0);assert.ok(b.alpha>0);assert.ok(b.point[0]<a.point[0]);assert.equal(b.vertical,true);assert.deepEqual(waterStrokeAt(t,3),b);
 for(let x=90;x<100;x++)r.surface[120*320+x]=2;const [mouth]=planWaterTracks(r,[],[{point:[94,120],phase:0}]);assert.equal(mouth.kind,'river');assert.ok(mouth.path.at(-1)[0]>94,'hidden mouth drains into visible sea');
});
