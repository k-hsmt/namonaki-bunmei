import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateWorldPrototype} from '../dist/terrain/world-prototype.js';
import {captureTerrainRecord} from '../dist/terrain/capture-terrain-record.js';
import {parseTerrainRecord,serializeTerrainRecord,validateTerrainRecord,readOwnedTerrainRecord,terrainRecordAt,sampleTerrainRecord,assertTerrainRecordActivationReady,TerrainRecordError,terrainRecordMaxBytes} from '../dist/terrain/terrain-record.js';
import {encodeRecordPhysics,decodeRecordPhysics,emptyRecordRaster} from '../dist/terrain/terrain-record-raster-v1.js';
import {rasterizeHill} from '../dist/terrain/hill-prototype.js';
import {rasterizeCoast} from '../dist/terrain/coast-prototype.js';
import {createCivilization,step,chooseAutomatically} from '../dist/story/engine.js';
const fixture=await readFile(new URL('./fixtures/terrain-record-v1-seed42.json',import.meta.url),'utf8');
const fresh=()=>JSON.parse(fixture);
test('owned terrain identity is reused only after strict validation; public validation stays detached',()=>{
 const raw=fresh(),owned=readOwnedTerrainRecord(raw);assert.notEqual(owned,raw);
 assert.equal(readOwnedTerrainRecord(owned),owned);assert.ok(Object.isFrozen(owned));
 assert.notEqual(validateTerrainRecord(owned),owned);
 raw.source.seed=123;assert.equal(owned.source.seed,42);
 const forged=fresh();forged.future=true;Object.freeze(forged);
 assert.throws(()=>readOwnedTerrainRecord(forged),TerrainRecordError);
 const broken=structuredClone(owned);delete broken.sites['river-bank'].physics;
 assert.throws(()=>readOwnedTerrainRecord(broken),TerrainRecordError);
});

test('terrain record fixture loads without regeneration and is deeply detached/frozen',()=>{
 const input=fresh(),before=structuredClone(input),r=validateTerrainRecord(input),s=serializeTerrainRecord(r);
 assert.deepEqual(input,before);assert.deepEqual(parseTerrainRecord(s),r);
 assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.sites['hill-side'].physics.rows[100]));
 input.source.seed=123;assert.equal(r.source.seed,42);
 assert.throws(()=>{r.sites['hill-side'].render.decals.push([0,0,1,1,'#000000']);},TypeError);
 for(const year of [0,100,1000,10000])assert.equal(terrainRecordAt(r,year),r);
 assert.throws(()=>terrainRecordAt(r,-1),TerrainRecordError);
 assert.throws(()=>assertTerrainRecordActivationReady(r),/PLACEMENT_NOT_APPROVED/);
 const reorder=x=>Array.isArray(x)?x.map(reorder):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,reorder(x[k])])):x;
 assert.deepEqual(validateTerrainRecord(reorder(fresh())),r);
});

test('result physics equals D1 geometry in canonical and mirrored screen coordinates',()=>{
 for(const seed of [1,3,6,29,85,131,7,198,10,12,21,24]){
  const w=generateWorldPrototype(seed).world,r=captureTerrainRecord(w,'test-v1');
  for(const [site,expected] of [['hill-side',rasterizeHill(w.hill)],['coast-inlet',rasterizeCoast(w.coast)]]){
   const decoded=decodeRecordPhysics(r.sites[site].physics);
   for(const key of ['grade','bearing','elevation'])assert.deepEqual(decoded[key],expected[key],site+' '+key);
   for(let y=96;y<180;y+=7)for(let x=0;x<320;x+=13){
    const canonical=sampleTerrainRecord(r,site,x,y,'canonical');
    const shown=sampleTerrainRecord(r,site,w.seaSide==='west'?319-x:x,y);
    assert.deepEqual(canonical,shown);
   }
  }
  assert.ok(Buffer.byteLength(serializeTerrainRecord(r))<=200*1024);
 }
});

const corruptions=[
 ['unknown schema',r=>r.schemaVersion=2],['unknown generator label',r=>r.generatorId='future-generator'],
 ['unknown renderer',r=>r.rendererId='future-renderer'],['unknown raster rule',r=>r.rasterRule='future-raster'],
 ['unexpected key',r=>r.unexpected=true],['missing site',r=>delete r.sites['coast-inlet']],
 ['wrong site identity',r=>r.sites['hill-side'].siteId='river-bank'],
 ['unapproved policy',r=>r.placementPolicy='terrain-placement-v1'],['inferred plan',r=>r.sites['hill-side'].initialPlan={}],
 ['seed out of range',r=>r.source.seed=2**32],['too many rows',r=>r.sites['hill-side'].physics.rows.push(r.sites['hill-side'].physics.rows[0])],
 ['zero run',r=>r.sites['hill-side'].physics.rows[0][0][0]=0],['huge run',r=>r.sites['hill-side'].physics.rows[0][0][0]=2**32],
 ['truncated row',r=>r.sites['hill-side'].physics.rows[0][0][0]=319],
 ['cell enum',r=>r.sites['hill-side'].physics.rows[0][0][1]=255],
 ['invalid background elevation',r=>r.sites['hill-side'].physics.rows[0][0][4]=1],
 ['duplicate shape id',r=>r.sites['hill-side'].shapes[1].id=r.sites['hill-side'].shapes[0].id],
 ['shape and physics disagree',r=>r.sites['hill-side'].shapes[1].elevation=31],
 ['self intersection',r=>r.sites['hill-side'].shapes[1].polygon=[[0,96],[40,130],[40,96],[0,130]]],
 ['negative vertex',r=>r.sites['hill-side'].shapes[0].polygon[0][0]=-1],
 ['profile reversed',r=>r.sites['hill-side'].shapes.find(s=>s.profile).profile.knots.reverse()],
 ['wrong mirror',r=>r.sites['hill-side'].render.mirrorX=!r.sites['hill-side'].render.mirrorX],
 ['different landmark projection',r=>r.sites['river-bank'].render.far[0][1][1]++],
 ['oversized decal',r=>r.sites['hill-side'].render.decals[0][2]=320],
 ['unsafe color',r=>r.sites['hill-side'].render.decals[0][4]='url(script)'],
 ['water color painted on hill',r=>r.sites['hill-side'].render.decals[0][4]='#6c999e'],
 ['orphan port',r=>r.geography.ports[0].streamId='missing'],['uphill flow',r=>r.geography.ports[0].relativeElevation=0],
 ['port off water',r=>r.geography.ports.find(p=>p.visible).point=[0,100]],
 ['unknown stream edge',r=>r.geography.streams[0].to='hill-side'],
 ['invented visible upstream',r=>r.geography.ports[0].visible=true],
];
for(const [name,mutate] of corruptions)test('terrain record rejects '+name,()=>{
 const r=fresh();mutate(r);const before=JSON.stringify(r);
 assert.throws(()=>validateTerrainRecord(r),TerrainRecordError);assert.equal(JSON.stringify(r),before);
});

test('JSON and allocation limits reject before decoding; RLE roundtrip preserves every cell',()=>{
 assert.throws(()=>parseTerrainRecord('{'),/JSON/);assert.throws(()=>parseTerrainRecord(' '.repeat(terrainRecordMaxBytes+1)),/SIZE_LIMIT/);
 const r=emptyRecordRaster();
 for(let i=0;i<57600;i++){r.surface[i]=1;r.elevation[i]=(i*17)%256;r.grade[i]=i%3;r.bearing[i]=0;}
 assert.deepEqual(decodeRecordPhysics(encodeRecordPhysics(r)),r);
 assert.throws(()=>decodeRecordPhysics({rows:Array.from({length:180},()=>[[999999,1,0,0,0]])}),/RLE/);
});

test('loader/verifier/frozen renderer import graph contains no prototype, capture or generator',async()=>{
 const seen=new Set();async function visit(file){
  if(seen.has(file.href))return;seen.add(file.href);const code=await readFile(file,'utf8');
  for(const m of code.matchAll(/from\s+['"]([^'"]+)['"]/g)){
   assert.ok(!/prototype|capture|engine|story/.test(m[1]),m[1]);if(m[1].startsWith('.'))await visit(new URL(m[1],file));
  }
 }
 await visit(new URL('../dist/terrain/terrain-record.js',import.meta.url));await visit(new URL('../dist/terrain/draw-terrain-record-v1.js',import.meta.url));
});

test('record capture/parse/past projection leaves pending choices and civilization unchanged',()=>{
 const a=createCivilization(42),b=createCivilization(42),r=parseTerrainRecord(fixture);
 for(let i=0;i<100;i++){
  terrainRecordAt(r,i);parseTerrainRecord(fixture);step(a);step(b);
  if(a.pending)chooseAutomatically(a);if(b.pending)chooseAutomatically(b);
 }assert.deepEqual(a,b);
});
