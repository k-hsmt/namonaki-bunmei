import {lastObservedYear,type CivilizationState} from '../story/engine.js';
import {observationAt} from '../story/observations.js';
import {scaleNames, siteAt} from '../story/settlement-history.js';
import {siteNames} from '../story/society.js';
import type {CivicFoundation} from '../story/civic-architecture.js';

export interface SiteObject {id:string; kind:'house'|'hall'|'bridge'|'field'|'ruin'|'memorial'|'market'|'workshop'|'granary';x:number;y:number;builtYear:number;condition:'intact'|'damaged'|'ruined';civic?:CivicFoundation;}
export type VisualLevel = 0 | 1 | 2 | 3;
export interface VisualProfile {
 scale:VisualLevel; trend:'expanding'|'stable'|'contracting'|'reorganizing';
 roadLevel:VisualLevel; squareLevel:VisualLevel; riversideLevel:VisualLevel;
 activityLevel:VisualLevel; densityLevel:VisualLevel; heightLevel:VisualLevel;
}
export interface SiteSnapshot {year:number; population:number; phase:string; atmosphere:string; sceneEvent:string|null; objects:SiteObject[]; eventYear:number|null; scars:string[]; local?:{index:number;population:number}; visual?:VisualProfile;}
const lots=[{x:55,y:113},{x:86,y:100},{x:116,y:109},{x:159,y:98},{x:201,y:107},{x:231,y:93},{x:271,y:105},{x:96,y:129},{x:179,y:123},{x:257,y:131}];
const mix=(seed:number,i:number)=>{let x=(seed ^ Math.imul(i+1,0x9e3779b9))>>>0;x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;return x>>>0;};
export function populationAt(s:CivilizationState,year:number):number {
 const ledger=s.observation;
 const observed=ledger&&observationAt(ledger,year);
 if(observed)return observed.population;
 const legacy=ledger?.legacy;
 if(ledger&&(!legacy||year>legacy.year))throw Error('観測年が確定していません');
 const endYear=legacy?.year??s.year;
 const endPopulation=legacy?.population??s.population;
 const samples=legacy?s.samples.slice(0,legacy.sampleCount):s.samples;
 if(year>=endYear)return endPopulation;
 if(year<=0)return samples[0]?.population??endPopulation;
 for(let i=1;i<samples.length;i++){
  const b=samples[i]!,a=samples[i-1]!;
  if(year<=b.year){const t=(year-a.year)/(b.year-a.year);return Math.round(a.population+(b.population-a.population)*t);}
 }
 const last=samples.at(-1);
 if(last&&endYear>last.year){const t=(year-last.year)/(endYear-last.year);return Math.round(last.population+(endPopulation-last.population)*t);}
 return endPopulation;
}
/** Pure presentation metadata: never updates the settlement ledger or the RNG. */
export function visualProfile(scale:number, trend:VisualProfile['trend'], inhabited:boolean, buildings:readonly SiteObject[]):VisualProfile {
 const level=Math.max(0,Math.min(3,Math.trunc(scale))) as VisualLevel;
 // A deserted settlement keeps its physical landscape and documented buildings.
 // Scale changes presentation only; building IDs, kinds and conditions remain authoritative.
 const living=inhabited?level:0;
 const usable=buildings.filter(b=>b.condition!=='ruined');
 const working=usable.length>0;
 return {
  scale:level,trend,
  roadLevel:working?living:0,
  squareLevel:working?living:0,
  riversideLevel:working?living:0,
  activityLevel:inhabited?living:0,
  densityLevel:living,
  heightLevel:living,
 };
}
export function snapshotAt(s:CivilizationState,year:number,siteIndex=0):SiteSnapshot {
 if(!Number.isInteger(year)||year<0||year>lastObservedYear(s))throw Error('観測年が不正です');
 const boundary=s.observation?.legacy;
 const legacy=boundary&&year<=boundary.year?boundary:null;
 const history=legacy?s.history.slice(0,legacy.historyCount):s.history;
 const samples=legacy?s.samples.slice(0,legacy.sampleCount):s.samples;
 const past=history.filter(e=>e.year<=year);
 const pop=populationAt(s,year);
 const recent=past.filter(e=>year-e.year<=14);
 const lead=recent.at(-1)??null;
 const scars:string[]=[];
 const site=siteAt(s.observation?.sites,siteIndex,year);
 const objects:SiteObject[]=[];
 if(!site){
 // The same numbered lots represent the same pieces of ground for every date.
 const slots=Math.min(lots.length,Math.max(2,Math.floor(Math.log2(Math.max(1,pop)/1350))+2));
 for(let i=0;i<lots.length;i++){
  const lot=lots[i]!;
  const threshold=1350*Math.pow(2,Math.max(0,i-1));
  const first=samples.find(x=>x.population>=threshold)?.year??(i<2?0:Infinity);
  if(first>year)continue;
  const known=(mix(s.seed,i)%7===0);
  const kind=i===2&&year>=400?'hall':i===7?'field':'house';
  const active=i<slots;
  const damage=past.filter(e=>e.year>=first&&['大地が揺れ、集落の一部が崩れる','大河が堤を越える','大きな火災が住まいを焼く'].includes(e.title));
  const lastDamage=damage.at(-1);
  const unrepaired=Boolean(lastDamage&&year-lastDamage.year<24&&(mix(s.seed,i+lastDamage.year)%3===0));
  const ruins=!active || (known&&unrepaired);
  objects.push({id:`lot-${i}`,kind:ruins?'ruin':kind,x:lot.x,y:lot.y,builtYear:first,condition:ruins?'ruined':unrepaired?'damaged':'intact'});
 }
 if(year>=70)objects.push({id:'bridge',kind:'bridge',x:148,y:143,builtYear:70,condition:recent.some(e=>e.title.includes('洪水')||e.title.includes('堤を越える'))?'damaged':'intact'});
 for(const e of past){if(e.tag==='文化'&&e.year>100&&mix(s.seed,e.year)%5===0){const id=`memorial-${e.id}`;if(!objects.some(o=>o.id===id)){objects.push({id,kind:'memorial',x:35+(mix(s.seed,e.year)%5)*45,y:130,builtYear:e.year,condition:'intact'});}}}
 }
 const atmosphericEvent=recent.filter(event=>event.tag!=='地域').at(-1);
 if(site){
  const kind=atmosphericEvent?.kind;
  if(kind==='disease')scars.push('epidemic');
  if(kind==='flood'&&siteIndex===0)scars.push('flood');
  if(kind==='drought'||kind==='famine')scars.push('drought');
  if(kind==='ritual'||kind==='song')scars.push('festival');
  if(kind==='fire'&&siteIndex===0)scars.push('fire');
  if(kind==='arrival'||kind==='migration')scars.push('travel');
  if(kind==='earthquake')scars.push('quake');
 }else{
  const latest=atmosphericEvent?.title??'';
  if(latest.includes('熱病')||latest.includes('病'))scars.push('epidemic');
  if(latest.includes('堤を越える'))scars.push('flood');
  if(latest.includes('雨を待つ')||latest.includes('飢え'))scars.push('drought');
  if(latest.includes('祭り')||latest.includes('歌'))scars.push('festival');
  if(latest.includes('火災'))scars.push('fire');
  if(latest.includes('旅人')||latest.includes('移住'))scars.push('travel');
  if(latest.includes('大地が揺れ'))scars.push('quake');
 }
 const town=past.some(e=>e.title==='村々の中心に大きな町が生まれる');const broken=past.some(e=>e.title==='長く続いた共同の決まりが解かれる');const phase=pop<7000?'小さな集落':broken&&pop<25000?'離れてゆく村々':town&&pop>23000?'河畔の町':pop<25000?'川辺の村':'広がる集落';
 const atmosphere=scars.includes('epidemic')?'人通りが少ない':scars.includes('flood')?'水が増している':scars.includes('drought')?'乾いた季節':scars.includes('festival')?'人々の集まり':scars.includes('fire')?'焼け跡の残る土地':'日々の暮らし';
 const summary={year,population:pop,phase,atmosphere,sceneEvent:lead?.title??null,objects,eventYear:lead?.year??null,scars};
 if(!site){
  // Pre-ledger saves retain their pre-existing inferred scene without inventing facilities.
  const level=pop<7000?0:pop<25000?1:pop<48000?2:3;
  return {...summary,visual:visualProfile(level,'stable',pop>0,objects)};
 }
 const local=observationAt(s.observation!,year)!.residents[siteIndex]!.population;
 const trends={stable:'日々の暮らし',expanding:'建設と往来が続く',contracting:'暮らしが縮みつつある',reorganizing:'暮らしの決まりが変わりつつある'};
 return {...summary,local:{index:siteIndex,population:local},
  phase:`${siteNames[siteIndex]} · ${site.inhabited?scaleNames[site.scale]:'無人の土地'}`,
  atmosphere:site.inhabited?trends[site.trend]:'人のいない風景',
  objects:site.buildings.map(building=>({...building})),
  visual:visualProfile(site.scale,site.trend,site.inhabited,site.buildings)};
}
