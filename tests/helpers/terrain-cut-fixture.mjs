/** Controlled gentle slope, not a naturally generated world. */
import {readFile} from 'node:fs/promises';
import {validateTerrainRecord} from '../../dist/terrain/terrain-record.js';
import {encodeRecordPhysics,rasterizeRecordShapes} from '../../dist/terrain/terrain-record-raster-v1.js';
import {createTerrainHistory,resolveTerrainAtYear} from '../../dist/terrain/terrain-revision-v1.js';
const template=JSON.parse(await readFile(new URL('../fixtures/terrain-record-v1-seed42.json',import.meta.url),'utf8'));
export const terrainCutPlot={x:26,y:110,width:26,depth:14};
export async function terrainCutFixture({height=1,extra=[],reservations=[],protectedPlots=[],cliff=false,year=100,root=[0,100]}={}){
 const raw=structuredClone(template),s=raw.sites['hill-side'];s.shapes=[s.shapes[0],{id:'controlled-gentle-slope',kind:'slope',polygon:[[0,96],[320,96],[320,180],[0,180]],elevation:0,applyTo:'all',profile:{axis:'x',knots:[[0,0],[80,height],[320,height]]}}];if(cliff)s.shapes.push({id:'controlled-cliff',kind:'cliff',polygon:[[20,100],[60,100],[60,140],[20,140]],elevation:1,applyTo:'all',profile:null});s.physics=encodeRecordPhysics(rasterizeRecordShapes(s.shapes,true));s.render.decals=[];
 const initial=validateTerrainRecord(raw),history=await createTerrainHistory(initial,year),field={id:'field-source',plot:{x:160,y:140,width:26,depth:14},builtYear:1,sourceRecordId:'field-birth-1'},ground={terrain:resolveTerrainAtYear(history,year),site:'hill-side',year,confirmedYear:year,historyStatus:'known',primaryRoot:root,occupancy:[{id:field.id,plot:field.plot,entrance:[172,154]},...extra],reservations};
 return {history,ground,field,causeRecordId:'terrain-review-'+year,protectedPlots};
}
