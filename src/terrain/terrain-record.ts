/** Strict JSON boundary; no generator, prototype, DOM, storage, or civilization imports. */
import {recordSites,type TerrainRecord,type RecordShape,type RecordPhysics,type RecordSite} from './terrain-record-types.js';
import {decodeRecordPhysics,rasterizeRecordShapes,sampleRecordPhysics} from './terrain-record-raster-v1.js';
export const terrainRecordMaxBytes=1024*1024;
declare const validated:unique symbol;
export type ValidatedTerrainRecord=TerrainRecord&{readonly [validated]:true};
const ownedRecords=new WeakSet<object>();
/** Internal immutable identity reuse; unknown wires still cross the full boundary.
 * The public validator below continues to return a detached frozen result.
 */
export function readOwnedTerrainRecord(raw:unknown):ValidatedTerrainRecord {
 if(raw&&typeof raw==='object'&&ownedRecords.has(raw))return raw as ValidatedTerrainRecord;
 return validateTerrainRecord(raw);
}
export class TerrainRecordError extends Error {
 constructor(public readonly code:string,public readonly path:string){super(code+' at '+path);this.name='TerrainRecordError';}
}
const fail=(code:string,path:string):never=>{throw new TerrainRecordError(code,path);};
const object=(v:unknown,path:string,keys:readonly string[]):Record<string,unknown>=>{
 if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))return fail('OBJECT',path);
 const r=v as Record<string,unknown>;if(Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k)))return fail('FIELDS',path);return r;
};
const array=(v:unknown,path:string,min:number,max:number):unknown[]=>{if(!Array.isArray(v)||v.length<min||v.length>max)return fail('ARRAY_LIMIT',path);return v;};
const integer=(v:unknown,path:string,min:number,max:number):number=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)return fail('INTEGER',path);return v;};
const one=(v:unknown,values:readonly unknown[],path:string):void=>{if(!values.includes(v))fail('UNSUPPORTED',path);};
const text=(v:unknown,path:string):string=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(v))return fail('IDENTIFIER',path);return v;};
function equivalent(a:unknown,b:unknown):boolean {
 if(a===b)return true;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equivalent(v,b[i]));
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 const x=a as Record<string,unknown>,y=b as Record<string,unknown>;
 return Object.keys(x).length===Object.keys(y).length&&Object.keys(x).every(k=>Object.hasOwn(y,k)&&equivalent(x[k],y[k]));
}
const equal=(a:unknown,b:unknown,path:string):void=>{if(!equivalent(a,b))fail('MISMATCH',path);};
function point(v:unknown,path:string,xmax=320,ymin=0,ymax=180):readonly [number,number]{
 const p=array(v,path,2,2);return [integer(p[0],path+'.x',0,xmax),integer(p[1],path+'.y',ymin,ymax)];
}
function polygon(v:unknown,path:string,max=256,ground=false):void {
 const p=array(v,path,3,max).map((q,i)=>point(q,path+'.'+i,320,ground?95:0));
 let area=0;const seen=new Set<string>();
 for(let i=0;i<p.length;i++){
  const a=p[i]!,b=p[(i+1)%p.length]!;const key=a.join(',');if(seen.has(key))fail('DUPLICATE_VERTEX',path);seen.add(key);area+=a[0]*b[1]-b[0]*a[1];
 }
 if(!area)fail('POLYGON_AREA',path);
 const turn=(a:readonly number[],b:readonly number[],c:readonly number[])=>(b[0]!-a[0]!)*(c[1]!-a[1]!)-(b[1]!-a[1]!)*(c[0]!-a[0]!);
 const between=(a:readonly number[],b:readonly number[],c:readonly number[])=>turn(a,b,c)===0&&c[0]!>=Math.min(a[0]!,b[0]!)&&c[0]!<=Math.max(a[0]!,b[0]!)&&c[1]!>=Math.min(a[1]!,b[1]!)&&c[1]!<=Math.max(a[1]!,b[1]!);
 for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){
  if(j===i+1||i===0&&j===p.length-1)continue;
  const a=p[i]!,b=p[(i+1)%p.length]!,c=p[j]!,d=p[(j+1)%p.length]!;
  if(turn(a,b,c)*turn(a,b,d)<0&&turn(c,d,a)*turn(c,d,b)<0||between(a,b,c)||between(a,b,d)||between(c,d,a)||between(c,d,b))fail('SELF_INTERSECTION',path);
 }
}
function shape(v:unknown,path:string):void {
 const s=object(v,path,['id','kind','polygon','elevation','applyTo','profile']);text(s.id,path+'.id');
 one(s.kind,['land','slope','cliff','freshwater','sea','island','sandbar'],path+'.kind');polygon(s.polygon,path+'.polygon',256,true);
 integer(s.elevation,path+'.elevation',0,255);one(s.applyTo,['all','land','freshwater'],path+'.applyTo');
 if(s.kind==='freshwater'||s.kind==='sea'||s.kind==='sandbar'||s.kind==='island')equal(s.elevation,0,path+'.elevation');
 if(s.kind==='slope'){
  equal(s.elevation,0,path+'.elevation');
  const p=object(s.profile,path+'.profile',['axis','knots']);one(p.axis,['x','y'],path+'.axis');
  const knots=array(p.knots,path+'.knots',2,32).map((x,i)=>point(x,path+'.knots.'+i,p.axis==='x'?320:180,0,255));
  for(let i=1;i<knots.length;i++)if(knots[i]![0]<=knots[i-1]![0])fail('PROFILE_ORDER',path);
  const axis=p.axis==='x'?0:1,coords=(s.polygon as number[][]).map(x=>x[axis]!);
  if(knots[0]![0]>Math.min(...coords)||knots[knots.length-1]![0]<Math.max(...coords))fail('PROFILE_COVERAGE',path);
 }else equal(s.profile,null,path+'.profile');
}
function physics(v:unknown,path:string):RecordPhysics {
 const p=object(v,path,['encoding','width','height','rows']);one(p.encoding,['row-rle-v1'],path+'.encoding');equal(p.width,320,path);equal(p.height,180,path);
 array(p.rows,path+'.rows',180,180).forEach((row,y)=>{
  let length=0,last:unknown=null;
  array(row,path+'.row.'+y,1,320).forEach((run,x)=>{
   const r=array(run,path+'.run.'+y+'.'+x,5,5);
   length+=integer(r[0],path+'.length',1,320);const s=integer(r[1],path+'.surface',0,3),g=integer(r[2],path+'.grade',0,2),b=integer(r[3],path+'.bearing',0,2),e=integer(r[4],path+'.elevation',0,255);
   if(s!==1&&(g||b||e)||b===2&&g!==2||b===1&&(g||e))fail('CELL_COMBINATION',path);
   const value=r.slice(1);if(last&&JSON.stringify(last)===JSON.stringify(value))fail('NONCANONICAL_RLE',path);last=value;
  });if(length!==320)fail('RLE_ROW_WIDTH',path+'.'+y);
 });return v as RecordPhysics;
}
const rivers=['straight-channel','narrow-meander','broad-bend','wide-meander','diagonal-crossing','island-channels','twin-islands','braided-channels','confluence','distributary'];
const hills=['H01','H02','H03','H04','H05','H06','H07','H08'],coasts=['C01','C02','C03','C04','C05','C06','C07','C08'],mountains=['M01','M02','M03','M04','M05','M06'];
function freeze<T>(v:T):T {if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
/** Validates semantic geometry/RLE agreement before exposing a detached frozen value. */
export function validateTerrainRecord(raw:unknown):ValidatedTerrainRecord {
 const top=object(raw,'record',['format','schemaVersion','status','generatorId','rasterRule','rendererId','establishedYear','placementPolicy','source','geography','sites']);
 for(const [key,value] of Object.entries({format:'initial-terrain-record',schemaVersion:1,status:'review-only',generatorId:'world-prototype-v1',rasterRule:'terrain-result-raster-v1',rendererId:'terrain-result-render-v1',establishedYear:0,placementPolicy:null}))one(top[key],[value],'record.'+key);
 const source=object(top.source,'source',['revision','seed']);text(source.revision,'source.revision');integer(source.seed,'source.seed',1,0xffffffff);
 const geo=object(top.geography,'geography',['seaSide','relief','landmarks','streams','ports']);one(geo.seaSide,['east','west'],'seaSide');one(geo.relief,['low','medium','high'],'relief');
 const ids=new Set<string>();let prior=-1;
 array(geo.landmarks,'landmarks',2,32).forEach((v,i)=>{const p=object(v,'landmark.'+i,['id','position','height']),id=text(p.id,'landmark.id');if(ids.has(id))fail('DUPLICATE_ID','landmark');ids.add(id);
  const pos=integer(p.position,'position',0,1024);if(pos<=prior)fail('LANDMARK_ORDER','position');prior=pos;integer(p.height,'height',2,42);
 });
 const reaches=new Set<string>();array(geo.streams,'streams',3,8).forEach((v,i)=>{
  const e=object(v,'stream.'+i,['id','from','to']);text(e.id,'stream.id');one(e.from,['hill-side','river-bank','coast-inlet'],'stream.from');one(e.to,['river-bank','coast-inlet','sea'],'stream.to');
  if(!['hill-side:river-bank','river-bank:coast-inlet','coast-inlet:sea'].includes(e.from+':'+e.to))fail('UPSTREAM_ORDER','stream');
  const key=e.id+':'+e.from;if(reaches.has(key))fail('DUPLICATE_REACH','stream');reaches.add(key);
 });
 const sites=object(top.sites,'sites',recordSites),allShapeIds=new Set<string>();let commonMountain:unknown=null,totalVertices=0;
 for(const id of recordSites){
  const s=object(sites[id],id,['siteId','variants','shapes','physics','render','initialPlan']);equal(s.siteId,id,id+'.siteId');equal(s.initialPlan,null,id+'.initialPlan');
  const v=object(s.variants,id+'.variants',['river','hills','coast','mountains']);one(v.river,id==='river-bank'?rivers:[null],id+'.river');one(v.hills,id==='hill-side'?hills:[null],id+'.hills');one(v.coast,id==='coast-inlet'?coasts:[null],id+'.coast');one(v.mountains,mountains,id+'.mountains');
  if(commonMountain===null)commonMountain=v.mountains;else equal(v.mountains,commonMountain,'world.mountains');
  array(s.shapes,id+'.shapes',1,128).forEach((q,i)=>{
   shape(q,id+'.shape.'+i);const sh=q as RecordShape;
   one(sh.kind,id==='hill-side'?['land','slope','cliff']:id==='river-bank'?['land','freshwater','island']:['land','freshwater','sea','sandbar','cliff'],id+'.shape.kind');
   equal(sh.applyTo,sh.kind==='island'?'freshwater':sh.kind==='cliff'&&id==='coast-inlet'?'land':'all',id+'.shape.applyTo');
   totalVertices+=sh.polygon.length;if(totalVertices>2048)fail('VERTEX_BUDGET','shapes');
   if(allShapeIds.has(sh.id))fail('DUPLICATE_ID',id+'.shape');allShapeIds.add(sh.id);
  });
  equal((s.shapes as RecordShape[])[0],{id:id+'-base',kind:'land',polygon:[[0,96],[320,96],[320,180],[0,180]],elevation:0,applyTo:'all',profile:null},id+'.base');
  const p=physics(s.physics,id+'.physics'),decoded=decodeRecordPhysics(p),expected=rasterizeRecordShapes(s.shapes as RecordShape[],id==='hill-side');
  for(const key of ['surface','grade','bearing','elevation'] as const)for(let i=0;i<57600;i++)if(decoded[key][i]!==expected[key][i])fail('SHAPE_RASTER_MISMATCH',id+'.'+key+'.'+i);
  const r=object(s.render,id+'.render',['mirrorX','far','middle','decals']);equal(r.mirrorX,geo.seaSide==='west',id+'.mirrorX');
  array(r.far,id+'.far',1,2).forEach((p,i)=>polygon(p,id+'.far.'+i,128));
  array(r.middle,id+'.middle',0,4).forEach((p,i)=>polygon(p,id+'.middle.'+i,128));
  if(id!=='hill-side')equal(r.middle,[],id+'.middle');
  array(r.decals,id+'.decals',0,4096).forEach((v,i)=>{
   const d=array(v,id+'.decal.'+i,5,5),x=integer(d[0],'decal.x',0,319),y=integer(d[1],'decal.y',95,179),w=integer(d[2],'decal.w',1,2),h=integer(d[3],'decal.h',1,1);
   if(x+w>320||y+h>180||typeof d[4]!=='string'||!/^#[0-9a-f]{6}$/.test(d[4]))fail('DECAL',id);
   const color=d[4],first=y*320+x,cells=Array.from({length:w},(_,n)=>first+n);
   if(id==='hill-side'){
    one(color,['#72776b','#959d72','#bdb58d'],'hill.decal.color');
    if(w!==2||cells.some(i=>decoded.surface[i]!==1)||color==='#72776b'&&decoded.bearing[first]!==2||color!=='#72776b'&&decoded.grade[first]===2)fail('DECAL_DOMAIN',id);
   }else if(id==='river-bank'){
    one(color,['#8b946a','#b2ab80'],'river.decal.color');if(w!==2||cells.some(i=>decoded.surface[i]!==1))fail('DECAL_DOMAIN',id);
   }else{
    one(color,['#a6b7ad','#91aeaa','#8aaab1','#959d72','#bdb58d'],'coast.decal.color');
    if(color==='#959d72'||color==='#bdb58d'){
     if(w!==2||cells.some(i=>decoded.surface[i]!==1||decoded.bearing[i]!==0))fail('DECAL_DOMAIN',id);
    }else if(w!==1||color==='#a6b7ad'&&decoded.surface[first]!==3||color==='#91aeaa'&&decoded.surface[first]!==2||color==='#8aaab1'&&decoded.surface[first]!<2)fail('DECAL_DOMAIN',id);
   }
  });
  const landmarks=(geo.landmarks as {id:string;position:number;height:number}[]),shift=id==='hill-side'?-10:id==='coast-inlet'?12:0,scale=id==='hill-side'?1.04:id==='coast-inlet'?.92:1;
  const points=landmarks.map(l=>[Math.round(16+l.position*288/1024+shift),Math.round(90-l.height*scale)]);
  const far=[[[0,90],...points,[320,90]]];if(v.mountains==='M05')far.push([[0,94],...points.map(p=>[Math.max(0,Math.min(320,p[0]!+19)),Math.round(91-(90-p[1]!)*.65)]),[320,94]]);
  equal(r.far,far,id+'.landmark-projection');
 }
 const rr=(sites['river-bank'] as unknown as TerrainRecord['sites'][RecordSite]).variants.river!,hh=(sites['hill-side'] as unknown as TerrainRecord['sites'][RecordSite]).variants.hills!,cc=(sites['coast-inlet'] as unknown as TerrainRecord['sites'][RecordSite]).variants.coast!;
 const ri=rivers.indexOf(rr),allowedH=['12345678','12345678','1347','12357','1367','1347','1347','347','2367','1347'],allowedC=['12345678','12345678','123467','123567','1246','12367','12367','1267','12356','13567'];
 if(!allowedH[ri]?.includes(hh.slice(2))||!allowedC[ri]?.includes(cc.slice(2))||hh==='H08'&&!['C01','C02','C04','C08'].includes(cc))fail('VARIANT_COMPATIBILITY','sites');
 const incoming=rr==='confluence'?['tributary-a','tributary-b']:['main'],outgoing=rr==='distributary'?['mouth-a','mouth-b']:['main'];
 const expectedEdges=[...incoming.map(id=>({id,from:'hill-side',to:'river-bank'})),...outgoing.map(id=>({id,from:'river-bank',to:'coast-inlet'})),...outgoing.map(id=>({id,from:'coast-inlet',to:'sea'}))];
 equal(geo.streams,expectedEdges,'geography.streams');
 array(geo.ports,'ports',incoming.length*2+outgoing.length*3,incoming.length*2+outgoing.length*3).forEach((v,i)=>{
  const p=object(v,'port.'+i,['site','flow','streamId','visible','point','relativeElevation']);one(p.site,recordSites,'port.site');one(p.flow,['in','out'],'port.flow');text(p.streamId,'port.streamId');one(p.visible,[true,false],'port.visible');integer(p.relativeElevation,'port.elevation',0,255);
  const site=p.site as RecordSite;
  equal(p.visible,site==='river-bank'||site==='coast-inlet'&&p.flow==='in'&&cc==='C06','port.visibility');
  equal(p.relativeElevation,site==='hill-side'?32:site==='river-bank'?(p.flow==='in'?24:16):(p.flow==='in'?8:0),'port.elevation');
  if(p.visible){const q=point(p.point,'port.point',319,0,179),s=(sites[site] as unknown as TerrainRecord['sites'][RecordSite]);if((sampleRecordPhysics(s.physics,q[0],q[1])?.surface??0)<2)fail('PORT_NOT_WATER','ports.'+i);}else equal(p.point,null,'port.point');
 });
 const record=raw as TerrainRecord;
 // Every reach has matching endpoint ports and non-increasing relative altitude.
 for(const e of record.geography.streams){
  const a=record.geography.ports.filter(p=>p.site===e.from&&p.flow==='out'&&p.streamId===e.id);
  const b=e.to==='sea'?[]:record.geography.ports.filter(p=>p.site===e.to&&p.flow==='in'&&p.streamId===e.id);
  if(a.length!==1||e.to!=='sea'&&b.length!==1||b[0]&&a[0]!.relativeElevation<b[0].relativeElevation)fail('STREAM_PORT_LINK','geography');
 }
 for(const p of record.geography.ports)if(!record.geography.streams.some(e=>e.id===p.streamId&&(p.flow==='out'?e.from===p.site:e.to===p.site)))fail('ORPHAN_PORT','geography');
 const json=JSON.stringify(raw);if(new TextEncoder().encode(json).length>terrainRecordMaxBytes)fail('SIZE_LIMIT','record');
 const result=freeze(JSON.parse(json)) as ValidatedTerrainRecord;ownedRecords.add(result);return result;
}
export function parseTerrainRecord(json:string):ValidatedTerrainRecord {
 if(typeof json!=='string'||new TextEncoder().encode(json).length>terrainRecordMaxBytes)fail('SIZE_LIMIT','record');
 let raw:unknown;try{raw=JSON.parse(json);}catch{return fail('JSON','record');}return validateTerrainRecord(raw);
}
export function serializeTerrainRecord(record:TerrainRecord):string{return JSON.stringify(validateTerrainRecord(record));}
export function terrainRecordAt(record:ValidatedTerrainRecord,year:number):ValidatedTerrainRecord {
 integer(year,'year',0,Number.MAX_SAFE_INTEGER);return record;
}
export function sampleTerrainRecord(record:ValidatedTerrainRecord,site:RecordSite,x:number,y:number,coordinates:'screen'|'canonical'='screen'){
 one(site,recordSites,'site');one(coordinates,['screen','canonical'],'coordinates');
 if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y))return null;
 return sampleRecordPhysics(record.sites[site].physics,coordinates==='screen'&&record.sites[site].render.mirrorX?319-x:x,y);
}
/** This draft is intentionally unusable as a live placement/save policy. */
export function assertTerrainRecordActivationReady(_record:ValidatedTerrainRecord):never{return fail('PLACEMENT_NOT_APPROVED','initialPlan');}
