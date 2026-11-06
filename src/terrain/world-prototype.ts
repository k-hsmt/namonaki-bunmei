/** Abstract watershed + three observation windows, D1-C only. Not v5 data. */
import {generateRiverPrototype,riverVariants,prototypeWaterAt,type RiverPrototype} from './river-prototype.js';
import {generateHillPrototype,rasterizeHill,probeHillInitialPlots,terrainHash,type HillPrototype,type HillVariant,type Point,type Plot,type HillRaster} from './hill-prototype.js';
import {generateCoastPrototype,rasterizeCoast,coastWaterConnected,probeCoastInitialPlots,type CoastPrototype,type CoastVariant} from './coast-prototype.js';
import {generateMountainPrototype,projectMountainPrototype,mountainVariants,type MountainPrototype,type MountainProjection} from './mountain-prototype.js';
export const prototypeSites=['hill-side','river-bank','coast-inlet'] as const;
export type PrototypeSite=typeof prototypeSites[number];
const hills:readonly (readonly HillVariant[])[]=[
 ['H01','H02','H03','H04','H05','H06','H07','H08'],['H01','H02','H03','H04','H05','H06','H07','H08'],
 ['H01','H03','H04','H07'],['H01','H02','H03','H05','H07'],['H01','H03','H06','H07'],
 ['H01','H03','H04','H07'],['H01','H03','H04','H07'],['H03','H04','H07'],['H02','H03','H06','H07'],['H01','H03','H04','H07'],
];
const coasts:readonly (readonly CoastVariant[])[]=[
 ['C01','C02','C03','C04','C05','C06','C07','C08'],['C01','C02','C03','C04','C05','C06','C07','C08'],
 ['C01','C02','C03','C04','C06','C07'],['C01','C02','C03','C05','C06','C07'],['C01','C02','C04','C06'],
 ['C01','C02','C03','C06','C07'],['C01','C02','C03','C06','C07'],['C01','C02','C06','C07'],
 ['C01','C02','C03','C05','C06'],['C01','C03','C05','C06','C07'],
];
export interface PrototypePort {site:PrototypeSite;flow:'in'|'out';streamId:string;visible:boolean;point:Point|null;relativeElevation:number}
export interface WorldPrototype {
 generatorId:'world-prototype-v1';seed:number;attempt:number;seaSide:'east'|'west';relief:'low'|'medium'|'high';
 river:RiverPrototype;hill:HillPrototype;coast:CoastPrototype;mountains:MountainPrototype;
 streams:readonly {id:string;from:string;to:string}[];ports:readonly PrototypePort[];
 views:Record<PrototypeSite,{mirrorX:boolean;mountains:MountainProjection}>;
 initialPlots:{hill:NonNullable<ReturnType<typeof probeHillInitialPlots>>;river:NonNullable<ReturnType<typeof probeHillInitialPlots>>;coast:NonNullable<ReturnType<typeof probeCoastInitialPlots>>};
}
export function compatiblePrototypeVariants(r:RiverPrototype['variant'],h:HillVariant,c:CoastVariant):boolean {
 const i=riverVariants.indexOf(r as typeof riverVariants[number]);
 return i>=0&&hills[i]!.includes(h)&&coasts[i]!.includes(c)&&(h!=='H08'||['C01','C02','C04','C08'].includes(c));
}
function riverEdgePorts(r:RiverPrototype,y:number):Point[]{
 const out:Point[]=[];let begin=-1;
 for(let x=0;x<=320;x++){
  const water=x<320&&prototypeWaterAt(r,x+.5,y+.5);
  if(water&&begin<0)begin=x;
  if(!water&&begin>=0){out.push([Math.floor((begin+x-1)/2),y]);begin=-1;}
 }return out;
}
export function riverLandRaster(t:RiverPrototype):HillRaster {
 const elevation=new Uint8Array(57600),grade=new Uint8Array(57600),bearing=new Uint8Array(57600);
 for(let y=96;y<180;y++)for(let x=0;x<320;x++)if(prototypeWaterAt(t,x+.5,y+.5))bearing[y*320+x]=2;
 return {width:320,height:180,elevation,grade,bearing};
}
export function generateWorldPrototype(input:number):{status:'ok';world:WorldPrototype}|{status:'hold';reason:'generation-failed';seed:number} {
 const seed=(input>>>0)||1,river=generateRiverPrototype(seed),ri=riverVariants.indexOf(river.variant as typeof riverVariants[number]);
 const choose=<T>(list:readonly T[],namespace:string)=>list[terrainHash(['world-prototype-v1',seed,namespace,'world','',0,'variant'])%list.length]!;
 const hv=choose(hills[ri]!,'hills'),cv=choose(coasts[ri]!.filter(c=>hv!=='H08'||['C01','C02','C04','C08'].includes(c)),'coast');
 const mv=choose(mountainVariants,'mountains'),seaSide=choose(['east','west'] as const,'geography');
 const mountains=generateMountainPrototype(seed,mv),riverPlan=probeHillInitialPlots(riverLandRaster(river));
 if(!riverPlan)return {status:'hold',reason:'generation-failed',seed};
 for(let attempt=0;attempt<32;attempt++){
  const hill=generateHillPrototype(seed,hv,attempt),coast=generateCoastPrototype(seed,cv,river.variant==='distributary'?2:1,attempt);
  const hi=probeHillInitialPlots(rasterizeHill(hill)),cr=rasterizeCoast(coast),ci=probeCoastInitialPlots(cr);
  if(!hi||!ci||!coastWaterConnected(cr)||!coastWaterConnected(cr,true))continue;
  const upstream=riverEdgePorts(river,96),downstream=riverEdgePorts(river,179),fork=river.variant==='distributary',merge=river.variant==='confluence';
  const incoming=merge?['tributary-a','tributary-b']:['main'],outgoing=fork?['mouth-a','mouth-b']:['main'];
  if(upstream.length!==incoming.length||downstream.length!==outgoing.length)continue;
  const streams=[...incoming.map(id=>({id,from:'hill-side',to:'river-bank'})),...outgoing.map(id=>({id,from:'river-bank',to:'coast-inlet'})),...outgoing.map(id=>({id,from:'coast-inlet',to:'sea'}))];
  const ports:PrototypePort[]=[];
  incoming.forEach((id,i)=>{
   ports.push({site:'hill-side',flow:'out',streamId:id,visible:false,point:null,relativeElevation:32});
   ports.push({site:'river-bank',flow:'in',streamId:id,visible:true,point:upstream[i]!,relativeElevation:24});
  });
  outgoing.forEach((id,i)=>{
   ports.push({site:'river-bank',flow:'out',streamId:id,visible:true,point:downstream[i]!,relativeElevation:16});
   ports.push({site:'coast-inlet',flow:'in',streamId:id,visible:cv==='C06',point:cv==='C06'?[i===0?100+(coast.sea[0]![0]-268):160+(coast.sea[0]![0]-268),96]:null,relativeElevation:8});
   ports.push({site:'coast-inlet',flow:'out',streamId:id,visible:false,point:null,relativeElevation:0});
  });
  const views=Object.fromEntries(prototypeSites.map(site=>[site,{mirrorX:seaSide==='west',mountains:projectMountainPrototype(mountains,site)}])) as WorldPrototype['views'];
  return {status:'ok',world:{generatorId:'world-prototype-v1',seed,attempt,seaSide,relief:hv==='H08'?'high':hv==='H05'?'low':'medium',river,hill,coast,mountains,streams,ports,views,initialPlots:{hill:hi,river:riverPlan,coast:ci}}};
 }
 return {status:'hold',reason:'generation-failed',seed};
}
export function displayedPlot(world:WorldPrototype,site:PrototypeSite,p:Plot):Plot {
 return world.views[site].mirrorX?{...p,x:320-p.x-p.width}:{...p};
}
export function displayedPoint(world:WorldPrototype,site:PrototypeSite,p:Point):Point {
 return world.views[site].mirrorX?[319-p[0],p[1]]:[...p];
}
