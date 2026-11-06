/** One-way D1 capture adapter. Readers must never depend on this module. */
import type {WorldPrototype} from './world-prototype.js';
import {terrainHash} from './hill-prototype.js';
import {hash01} from '../engine/rng.js';
import {projectHillMiddle} from './draw-hill-prototype.js';
import {recordSites,type RecordSite,type RecordShape,type RecordDecal,type RecordSiteTerrain,type TerrainRecord} from './terrain-record-types.js';
import {encodeRecordPhysics,rasterizeRecordShapes} from './terrain-record-raster-v1.js';
import {validateTerrainRecord,type ValidatedTerrainRecord} from './terrain-record.js';
export function captureTerrainRecord(w:WorldPrototype,revision='local-unidentified'):ValidatedTerrainRecord {
 const sites={} as Record<RecordSite,RecordSiteTerrain>;
 for(const site of recordSites){
  const shapes:RecordShape[]=[{id:site+'-base',kind:'land',polygon:[[0,96],[320,96],[320,180],[0,180]],elevation:0,applyTo:'all',profile:null}];
  const add=(id:string,kind:RecordShape['kind'],polygon:RecordShape['polygon'],applyTo:RecordShape['applyTo']='all')=>shapes.push({id:site+'-'+id,kind,polygon,elevation:0,applyTo,profile:null});
  if(site==='hill-side')for(const s of w.hill.shapes)shapes.push({id:site+'-'+s.id,kind:s.kind==='plateau'?'land':s.kind,polygon:s.polygon,elevation:s.elevation,profile:s.profile,applyTo:'all'});
  else if(site==='river-bank'){
   w.river.water.forEach((p,i)=>add('water-'+i,'freshwater',p));w.river.islands.forEach((p,i)=>add('island-'+i,'island',p,'freshwater'));
  }else{
   w.coast.freshwater.forEach((f,i)=>add('freshwater-'+i,'freshwater',f.polygon));add('sea','sea',w.coast.sea);
   w.coast.sandbars.forEach((p,i)=>add('sandbar-'+i,'sandbar',p));
   w.coast.rocks.forEach((p,i)=>shapes.push({id:site+'-rock-'+i,kind:'cliff',polygon:p,elevation:24,profile:null,applyTo:'land'}));
  }
  const r=rasterizeRecordShapes(shapes,site==='hill-side'),decals:RecordDecal[]=[];
  if(site==='hill-side')for(let n=0;n<150;n++){
   const h=terrainHash([w.hill.generatorId,w.seed,'decoration',w.hill.variant,n]),x=h%318,y=98+(h>>>9)%80,i=y*320+x;
   if(r.bearing[i]===2)decals.push([x,y,2,1,'#72776b']);else if(r.grade[i]!==2)decals.push([x,y,2,1,n%3?'#959d72':'#bdb58d']);
  }
  else if(site==='river-bank')for(let n=0;n<100;n++){
   const x=Math.floor(hash01(w.seed,n,33)*318),y=97+Math.floor(hash01(w.seed,n,34)*80);
   if(r.surface[y*320+x]!==2&&r.surface[y*320+x+1]!==2)decals.push([x,y,2,1,n%3?'#8b946a':'#b2ab80']);
  }
  else{
   for(let y=97;y<179;y++)for(let x=1;x<319;x++){
    const i=y*320+x;if(r.surface[i]!<2)continue;
    if([i-1,i+1,i-320,i+320].some(j=>r.surface[j]===1))decals.push([x,y,1,1,r.surface[i]===3?'#a6b7ad':'#91aeaa']);
    else if(y%11===0&&(x+y)%27<7)decals.push([x,y,1,1,'#8aaab1']);
   }
   for(let n=0;n<130;n++){
    const h=terrainHash([w.coast.generatorId,w.seed,'decoration',w.coast.variant,n]),x=h%318,y=98+(h>>>9)%80,i=y*320+x;
    if(r.surface[i]===1&&r.surface[i+1]===1&&r.bearing[i]===0&&r.bearing[i+1]===0)decals.push([x,y,2,1,n%3?'#959d72':'#bdb58d']);
   }
  }
  sites[site]={siteId:site,variants:{river:site==='river-bank'?w.river.variant:null,hills:site==='hill-side'?w.hill.variant:null,coast:site==='coast-inlet'?w.coast.variant:null,mountains:w.mountains.variant},
   shapes,physics:encodeRecordPhysics(r),render:{mirrorX:w.views[site].mirrorX,far:w.views[site].mountains.layers.map(l=>l.contour),middle:site==='hill-side'?[projectHillMiddle(w.hill)]:[],decals},initialPlan:null};
 }
 const record:TerrainRecord={format:'initial-terrain-record',schemaVersion:1,status:'review-only',generatorId:'world-prototype-v1',rasterRule:'terrain-result-raster-v1',rendererId:'terrain-result-render-v1',establishedYear:0,placementPolicy:null,
  source:{revision,seed:w.seed},geography:{seaSide:w.seaSide,relief:w.relief,landmarks:w.mountains.landmarks,streams:w.streams,ports:w.ports},sites};
 return validateTerrainRecord(record);
}
