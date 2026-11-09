import {canonicalWire} from '../dist/irrigation/wire-v1.js';
function clean(value){if(Array.isArray(value))return value.map(clean);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!/(recordids?|eventids?)$/i.test(k)).map(([k,v])=>[k,clean(v)]));return value;}
export function timeline(t,kind){const w=t.world,r=w.review,map=new Map(),add=(y,v)=>{const a=map.get(y)??[];a.push(canonicalWire(v));map.set(y,a);};
 if(kind==='land'){
  for(const p of r.placements)add(p.builtYear,{objectId:p.objectId,site:p.site,kind:p.kind,plot:p.plot,entrance:p.entrance});
  for(const e of r.state.housing.events)add(e.year,{kind:'housing/'+e.kind,after:clean(e.after)});
  for(const e of r.state.publicSpaces.events)add(e.year,{kind:'space/'+e.kind,after:clean(e.after)});
  for(const [site,s]of r.state.observation.sites.entries()){for(const e of s.buildingChanges)add(e.year,{site,building:clean(e.building)});for(const e of s.changes)add(e.year,{site,view:e.view});}
 }else if(kind==='water'){
  for(const s of w.irrigation.systems)add(s.geometry.year,{id:s.id,geometry:clean(s.geometry)});
  for(const e of w.irrigation.events)add(e.year,{kind:e.kind,systemId:e.systemId,status:e.after.status,lastMaintainedYear:e.after.lastMaintainedYear,abandonedYear:e.after.abandonedYear});
 }else if(kind==='rng'){for(const p of t.phases)add(p.year,{phase:p.phase,before:p.rngBefore,after:p.rngAfter,draws:p.draws});}
 else if(kind==='choice'){for(const p of t.phases)if(p.choice)add(p.year,{phase:p.phase,...p.choice});}
 else {const records=new Map(r.state.history.map(e=>[e.id,e]));for(const e of r.state.history){if(kind==='disaster'&&!['flood','storm','earthquake','eruption','drought','famine','fire','disease','cold','landslide'].includes(e.kind))continue;add(e.year,{year:e.year,tag:e.tag,kind:e.kind??null,title:e.title,body:e.body,buildingId:e.buildingId??null,publicSpaceId:e.publicSpaceId??null,causes:e.causes,related:(e.relatedIds??[]).map(id=>{const s=records.get(id);return s?{year:s.year,kind:s.kind??null,title:s.title,buildingId:s.buildingId??null}:id;})});}}
 for(const [y,a]of map)map.set(y,a.sort().join('\n'));return map;
}
export function firstTimeline(a,b,kind){const x=a,y=timeline(b,kind);for(const year of [...new Set([...x.keys(),...y.keys()])].sort((a,b)=>a-b))if(x.get(year)!==y.get(year))return year;return null;}
