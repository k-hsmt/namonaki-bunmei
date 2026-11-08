/** Explicit geometry fixture, not naturally generated irrigation history. */
import {generateWorldPrototype} from '../../dist/terrain/world-prototype.js';
import {captureTerrainRecord} from '../../dist/terrain/capture-terrain-record.js';
import {validateTerrainRecord} from '../../dist/terrain/terrain-record.js';
import {rasterizeRecordShapes,encodeRecordPhysics} from '../../dist/terrain/terrain-record-raster-v1.js';
import {captureRiverReaches} from '../../dist/terrain/river-reaches-review.js';
import {southEntrance} from '../../dist/terrain/ground-access-review.js';
const template=captureTerrainRecord(generateWorldPrototype(6).world,'irrigation-controlled');
export const plot=(x,y,width=10,depth=8)=>({x,y,width,depth});
export function fixture({field=plot(130,120),extra=[],reservations=[],shapes=[],mirror=false,root=[0,140],riverPolygon=[[150,95],[170,95],[170,180],[150,180]],riverOut=[160,179]}={}){
 const wire=structuredClone(template),s=wire.sites['river-bank'];s.shapes=[s.shapes[0],{id:'controlled-river',kind:'freshwater',polygon:riverPolygon,elevation:0,applyTo:'all',profile:null},...shapes];s.physics=encodeRecordPhysics(rasterizeRecordShapes(s.shapes,false));s.render.decals=[];
 wire.geography.ports.filter(p=>p.site==='river-bank').forEach(p=>p.point=p.flow==='in'?[160,95]:riverOut);
 wire.geography.seaSide=mirror?'west':'east';for(const v of Object.values(wire.sites))v.render.mirrorX=mirror;
 const terrain=validateTerrainRecord(wire),f={id:'controlled-field',plot:field,builtYear:1,sourceRecordId:'controlled-field-birth'},ground={terrain,site:'river-bank',year:10,confirmedYear:10,historyStatus:'known',primaryRoot:root,occupancy:[{id:f.id,plot:field,entrance:southEntrance(field)},...extra],reservations};
 return {ground,hydrology:captureRiverReaches(terrain),roots:[root],fields:[f],cause:{recordId:'controlled-irrigation',year:10}};
}
export const land=(id,x,y,width,depth,elevation=0)=>({id,kind:'land',polygon:[[x,y],[x+width,y],[x+width,y+depth],[x,y+depth]],elevation,applyTo:'all',profile:null});
