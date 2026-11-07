/** Strict generated-state boundary for the v5 draft; no migrations or inference. */
import {checkStateHeader} from './legacy-terrain-save.js';
import {validateHousingHistory} from './housing-save.js';
import {lastObservedYear,type CivilizationState} from './engine.js';
import {siteAt} from './settlement-history.js';
export const wireObject=(v:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>=>{
 if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v))||required.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>![...required,...optional].includes(k)))throw Error('Invalid generated object fields');return v as Record<string,unknown>;
};
export function sameWire(a:unknown,b:unknown):boolean {
 if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 if(Array.isArray(a)&&Array.isArray(b)&&a.length!==b.length)return false;
 const x=a as Record<string,unknown>,y=b as Record<string,unknown>,keys=Object.keys(x);return keys.length===Object.keys(y).length&&keys.every(k=>Object.hasOwn(y,k)&&sameWire(x[k],y[k]));
}
export function assertJsonWire(value:unknown,ancestors=new Set<object>()):void {
 if(value===null||typeof value==='string'||typeof value==='boolean')return;
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Nonfinite JSON value');return;}
 if(!value||typeof value!=='object'||ancestors.has(value))throw Error('Non-JSON or cyclic value');
 if(Object.getOwnPropertySymbols(value).length)throw Error('Symbol JSON property');
 if(Array.isArray(value)){const keys=Object.keys(value);if(keys.length!==value.length||keys.some((key,index)=>key!==String(index))||Object.getOwnPropertyNames(value).length!==value.length+1)throw Error('Sparse or decorated JSON array');}
 else if(![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.getOwnPropertyNames(value).length!==Object.keys(value).length)throw Error('Non-JSON object');
 ancestors.add(value);for(const v of Object.values(value))assertJsonWire(v,ancestors);ancestors.delete(value);
}
const nat=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const numeric=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
const strings=(v:unknown)=>Array.isArray(v)&&v.every(x=>typeof x==='string');
const kinds=['granary','waterworks','trade_network','archive','council','care','migration','fracture'];
const practiceKinds=['granary','council','archive'];
export function validateGeneratedState(raw:unknown,seed:number):CivilizationState {
 checkStateHeader(raw,[4]);wireObject(raw,['version','seed','rngState','year','name','homeland','trait','population','food','cohesion','knowledge','exchange','culture','drought','epidemic','lastKind','history','pending','decisions','samples','housing','publicSpaces','observation','memory'],['lastDecisionId','economy','society']);
 const s=structuredClone(raw) as unknown as CivilizationState,year=lastObservedYear(s);
 if(year>0&&(!s.economy||!s.society))throw Error('Missing established generated subsystems');
 if(s.seed!==seed||s.population<60||!Number.isSafeInteger(s.population)||!nat(s.drought)||!nat(s.epidemic)||!['川沿いの農耕','高原の放牧','沿岸の漁撈','森林の採集'].includes(s.trait)||year!==(s.pending?s.year-1:s.year))throw Error('Invalid generated state header');
 for(const key of ['food','cohesion','knowledge','exchange','culture'] as const)if(s[key]<0||s[key]>100)throw Error('Invalid generated dimension');
 if(s.lastDecisionId!==undefined&&(!Number.isSafeInteger(s.lastDecisionId)||s.lastDecisionId< -1))throw Error('Invalid decision cursor');
 let previousYear=-1;const records=new Map(s.history.map((r,index)=>{
  wireObject(r,['id','year','tag','title','body','causes'],['kind','buildingId','publicSpaceId','relatedIds','important']);
  if(r.id!==r.year+'-'+index||r.year<previousYear||r.relatedIds!==undefined&&!strings(r.relatedIds)||r.important!==undefined&&typeof r.important!=='boolean')throw Error('Invalid generated source order');
  for(const key of ['kind','buildingId','publicSpaceId'] as const)if(r[key]!==undefined&&typeof r[key]!=='string')throw Error('Invalid generated source attributes');previousYear=r.year;return [r.id,r] as const;
 }));
 for(const list of [s.samples,s.decisions]){let previous=-1;for(const e of list){if(e.year<previous||e.year>year)throw Error('Future or unordered generated observation');previous=e.year;}}
 const known=(v:unknown,at:number)=>typeof v==='string'&&Boolean(records.get(v)&&records.get(v)!.year<=at);
 const practices=(v:unknown,at:number)=>{
  if(!Array.isArray(v)||v.length>3)throw Error('Invalid generated practices');const seen=new Set();
  for(const p of v){const o=wireObject(p,['kind','originId','recordId','active']);if(!practiceKinds.includes(o.kind as string)||seen.has(o.kind)||typeof o.active!=='boolean'||!known(o.originId,at)||!known(o.recordId,at))throw Error('Invalid practice source');seen.add(o.kind);}
 };
 const observation=wireObject(s.observation,['people','sites','blocks','lastYear','legacy']);
 if(observation.lastYear!==year)throw Error('Missing generated confirmed year');
 if(observation.legacy!==null||!Array.isArray(observation.people)||observation.people.length!==4||!observation.people.every(nat)||observation.people[3]!==0||observation.people.reduce((a,b)=>a+b,0)!==s.population||!Array.isArray(observation.blocks)||observation.blocks.length!==Math.floor(year/100)+1||!Array.isArray(observation.sites)||observation.sites.length!==3)throw Error('Invalid generated observation boundary');
 let last:number[]=[];
 for(let i=0;i<observation.blocks.length;i++){
  const b=wireObject(observation.blocks[i],['year','population','changes']);if(b.year!==i*100||!Array.isArray(b.population)||b.population.length!==4||!b.population.every(nat)||!Array.isArray(b.changes)||b.changes.length!==Math.min(99,year-i*100))throw Error('Invalid generated population block');
  last=[...b.population];if(last[3]!==0)throw Error('Invented unknown residents');
  for(const row of b.changes){if(!Array.isArray(row)||row.length!==4||!row.every(Number.isSafeInteger))throw Error('Invalid population delta');last=last.map((n,j)=>n+row[j]);if(last.some(n=>!nat(n))||last[3]!==0)throw Error('Invalid reconstructed population');}
 }
 if(!s.pending&&!sameWire(last,observation.people))throw Error('Population view disagrees with history');
 for(const [index,rawSite] of observation.sites.entries()){
  const site=wireObject(rawSite,['view','changes','buildingChanges','practiceChanges','growthYears','shrinkYears','lastWork'],['reorganizeUntil','repairYears']);
  for(const key of ['growthYears','shrinkYears','lastWork','reorganizeUntil','repairYears'])if(site[key]!==undefined&&!nat(site[key]))throw Error('Invalid generated site counter');
  for(const key of ['growthYears','shrinkYears','repairYears'])if(site[key]!==undefined&&Number(site[key])>year)throw Error('Future local counter');
  if(Number(site.lastWork)>year)throw Error('Future local work');
  for(const key of ['changes','buildingChanges','practiceChanges']){const list=site[key];if(!Array.isArray(list)||!list.length||list[0].year!==0)throw Error('Missing generated year-zero site history');let prior=-1;for(const c of list){if(!nat(c.year)||c.year<prior||c.year>year)throw Error('Invalid generated site chronology');prior=c.year;}}
  const view=wireObject(site.view,['scale','trend','inhabited','communityId','practices','buildings']);
  const summary=(v:unknown)=>{const o=wireObject(v,['scale','trend','inhabited','communityId']);if(![0,1,2,3].includes(o.scale as number)||!['stable','expanding','contracting','reorganizing'].includes(o.trend as string)||typeof o.inhabited!=='boolean'||typeof o.communityId!=='string')throw Error('Invalid generated site summary');};
  summary(Object.fromEntries(Object.entries(view).filter(([k])=>!['practices','buildings'].includes(k))));practices(view.practices,year);
  for(const c of site.changes as {year:number;view:unknown}[]){wireObject(c,['year','view']);summary(c.view);}
  for(const c of site.practiceChanges as {year:number;practices:unknown}[]){wireObject(c,['year','practices']);practices(c.practices,c.year);}
  const seen=new Map<string,{year:number;building:Record<string,unknown>}>();
  for(const c of site.buildingChanges as {year:number;building:unknown}[]){
   wireObject(c,['year','building']);const b=wireObject(c.building,['id','kind','x','y','builtYear','condition'],['reused','recordId','civic']),id=b.id as string,prior=seen.get(id);
   if(typeof id!=='string'||!['house','field','hall','workshop','market','bridge','granary'].includes(b.kind as string)||![b.x,b.y,b.builtYear].every(nat)||Number(b.builtYear)>c.year||!['intact','damaged','ruined'].includes(b.condition as string)||b.reused!==undefined&&b.reused!==true)throw Error('Invalid generated building');
   if(prior){for(const key of ['kind','x','y','builtYear','civic'])if(!sameWire(b[key],prior.building[key]))throw Error('Generated facility moved');if(c.year<=prior.year)throw Error('Duplicate building change');}
   const initial=c.year===0&&!prior&&id===['river-bank','hill-side','coast-inlet'][index]+'-0';
   if(initial){if(b.kind!=='house'||b.builtYear!==0||b.condition!=='intact'||b.recordId!==undefined)throw Error('Invalid initial house');}
   else {const source=records.get(b.recordId as string),expected:Record<string,string>={'building-built':'intact','building-damaged':'damaged','building-abandoned':'ruined','building-repaired':'intact','building-reused':'intact'};
    if(!source||source.year!==c.year||source.buildingId!==id||b.condition!==expected[source.kind??'']||!prior&&(source.kind!=='building-built'||b.builtYear!==c.year)||prior&&source.kind==='building-built'||source.kind==='building-damaged'&&prior?.building.condition!=='intact'||source.kind==='building-repaired'&&prior?.building.condition!=='damaged'||source.kind==='building-reused'&&prior?.building.condition!=='ruined')throw Error('Invalid generated building source');
    if(prior&&(prior.building.condition===b.condition||prior.building.reused===true&&b.reused!==true)||b.reused===true&&!prior?.building.reused&&source.kind!=='building-reused')throw Error('Invalid generated reuse transition');
   }seen.set(id,{year:c.year,building:b});
  }
  if(!sameWire(view,siteAt(s.observation!.sites,index,year)))throw Error('Generated site view disagrees with history');
 }
 s.housing=validateHousingHistory(s.housing,year);if(s.housing.legacyUntracked||s.housing.introducedYear!==0)throw Error('Generated housing is not complete');
 for(const e of s.housing.events){const source=records.get(e.causeRecordId??'');if(!source||source.year!==e.year||source.kind!=='housing-'+e.kind||source.buildingId!==e.blockId||e.after.lastRenovatedYear!==undefined&&e.after.lastRenovatedYear>e.year||e.after.styleSeed>0xffffffff)throw Error('Invalid housing transition source');}
 const publicHeader=wireObject(s.publicSpaces,['schemaVersion','introducedYear','legacyUntracked','events']);if(publicHeader.schemaVersion!==1||publicHeader.introducedYear!==0||publicHeader.legacyUntracked!==false||!Array.isArray(publicHeader.events))throw Error('Generated public-space history missing');
 if(s.economy){const economy=wireObject(s.economy,['districts','routes','migrationYears']);if(!Array.isArray(economy.districts)||economy.districts.length!==3||!Array.isArray(economy.routes)||economy.routes.length!==2)throw Error('Invalid generated economy');
 for(const d of economy.districts){const o=wireObject(d,['reserve','coverage','importShare','shortageRecord','shortageYears']);if(!numeric(o.reserve)||Number(o.reserve)<0||!numeric(o.importShare)||Number(o.importShare)<0||!nat(o.shortageYears)||!Array.isArray(o.coverage)||o.coverage.length>5||!o.coverage.every((v:unknown)=>numeric(v)&&Number(v)>=0&&Number(v)<=1)||o.shortageRecord!==null&&!known(o.shortageRecord,s.year))throw Error('Invalid district economy');}
 for(const r of economy.routes){const o=wireObject(r,['tradeYears','blocked','closureRecord','agreementRecord','originRecord','missedMaintenance','capacityBonus']);if(!Array.isArray(o.tradeYears)||!o.tradeYears.every((v:unknown)=>typeof v==='boolean')||typeof o.blocked!=='boolean'||typeof o.capacityBonus!=='boolean'||!nat(o.missedMaintenance)||['closureRecord','agreementRecord','originRecord'].some(k=>o[k]!==null&&!known(o[k],s.year)))throw Error('Invalid route economy');}
 const migrations=wireObject(economy.migrationYears,[],['0-1','0-2','0-3','1-0','1-2','1-3','2-0','2-1','2-3','3-0','3-1','3-2']);if(Object.values(migrations).some(y=>!nat(y)||Number(y)>s.year))throw Error('Invalid migration years');
 }
 if(s.society){const society=wireObject(s.society,['sites','sourceIds']);if(!Array.isArray(society.sites)||society.sites.length!==3)throw Error('Invalid generated society');
 for(const p of society.sites){const o=wireObject(p,['communityId','strain','recovery','practices'],['splitId']);if(typeof o.communityId!=='string'||!nat(o.strain)||!nat(o.recovery)||o.splitId!==undefined&&!known(o.splitId,s.year))throw Error('Invalid generated community');practices(o.practices,s.year);}
 const sources=wireObject(society.sourceIds,[],practiceKinds);if(Object.values(sources).some(id=>!known(id,s.year)))throw Error('Invalid society source');
 }
 const memory=wireObject(s.memory,['legacies','log']),legacies=wireObject(memory.legacies,[],kinds);if(!Array.isArray(memory.log))throw Error('Invalid generated memory');
 for(const [kind,v] of Object.entries(legacies)){const o=wireObject(v,['kind','established','strength','lastChanged','origin']);if(o.kind!==kind||!nat(o.established)||!nat(o.lastChanged)||Number(o.established)>Number(o.lastChanged)||Number(o.lastChanged)>s.year||!numeric(o.strength)||Number(o.strength)<=0||Number(o.strength)>100||typeof o.origin!=='string')throw Error('Invalid generated legacy');}
 for(const e of memory.log){const o=wireObject(e,['year','kind','action','reason','strength','established']);if(!nat(o.year)||Number(o.year)>s.year||!nat(o.established)||Number(o.established)>Number(o.year)||!kinds.includes(o.kind as string)||!['formed','strengthened','weakened','lost'].includes(o.action as string)||typeof o.reason!=='string'||!numeric(o.strength)||Number(o.strength)<0||Number(o.strength)>100)throw Error('Invalid memory event');}
 return s;
}
