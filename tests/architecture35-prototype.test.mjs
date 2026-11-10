import test from 'node:test';
import assert from 'node:assert/strict';
import {
 ROOFS,STRUCTURES,WINDOWS,ENTRANCES,DECORATIONS,WALL_MATERIALS,ROOF_MATERIALS,USES,TECHNOLOGIES,
 CULTURES,allArchitectureD1Cases,auditArchitectureD1Catalog,
} from '../dist/architecture/visual-prototype.js';
test('Issue35 D1: every catalog item has an explicit non-historical frame',()=>{
 const cases=allArchitectureD1Cases();
 auditArchitectureD1Catalog(cases);
 assert.equal(cases.length,68);
 for(const [family,catalog]of Object.entries({
  roof:ROOFS,structure:STRUCTURES,window:WINDOWS,entrance:ENTRANCES,
  decoration:DECORATIONS,'wall-material':WALL_MATERIALS,'roof-material':ROOF_MATERIALS,
  technology:TECHNOLOGIES,use:USES,
 })){
  assert.deepEqual(cases.filter(x=>x.family===family).map(x=>x.id),catalog.map(s=>family+'-'+s));
 }
 assert.equal(cases.filter(x=>x.family==='culture'&&x.compareFiveUses).length,6);
 assert.equal(new Set(CULTURES.map(x=>x.style.roof)).size,6);
 assert.equal(new Set(cases.map(x=>x.id)).size,68);
});
test('Issue35 D1: repeatable preview data and explicit controlled-label guard',()=>{
 const first=allArchitectureD1Cases(),second=allArchitectureD1Cases();
 assert.deepEqual(first,second);
 const mutated={...first[0],premise:'actual-history'};
 assert.throws(()=>auditArchitectureD1Catalog([mutated,...first.slice(1)]),/historical prototype/);
 assert.throws(()=>auditArchitectureD1Catalog(first.slice(1)),/Missing D1 catalog/);
});
