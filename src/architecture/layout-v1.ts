/**
 * Issue #35 D5 (Human decisions #2, #3): the layout type of a district in a year (architecture-layout-v1),
 * classified only from what stands there (D0 §5.2: L01-L07 describe real buildings, water, slopes and
 * centres; they are never templates painted in). Read-only: it changes nothing and draws nothing.
 * Thresholds are provisional; the D5 audit reports their distribution.
 */
export const LAYOUT_ID='architecture-layout-v1';
export type LayoutType='L01'|'L02'|'L03'|'L04'|'L05'|'L06'|'L07';
export interface LayoutBuilding {
 readonly x:number;readonly y:number;
 readonly kind:'house'|'block'|'hall'|'market'|'workshop'|'granary'|'public';
 /** For housing blocks: courtyard style. For any building: the recorded foundation, if known. */
 readonly courtyard?:boolean;readonly foundation?:string;
}
export interface LayoutInput {
 readonly buildings:readonly LayoutBuilding[];
 /** Distance in pixels from (x, y) to the nearest water surface (Infinity when there is none). */
 readonly waterDistance:(x:number,y:number)=>number;
}
export const layoutThresholds=Object.freeze({minBuildings:3,waterReach:30,waterShare:.5,terraceShare:.4,courtyardShare:.5,
 centreReach:70,centreShare:.6,centreGap:90,linearRatio:4});
export const layoutNames:Readonly<Record<LayoutType,string>>={L01:'家々が散らばる',L02:'一筋に連なる',L03:'水辺沿いに並ぶ',L04:'中庭を囲む家が多い',
 L05:'斜面に段をなす',L06:'集会所と市場を囲む',L07:'いくつかの中心をもつ'};

export function classifyLayout(input:LayoutInput):LayoutType {
 const t=layoutThresholds,all=input.buildings;
 if(all.length<t.minBuildings)return 'L01';
 const share=(f:(b:LayoutBuilding)=>boolean,list=all)=>list.filter(f).length/Math.max(1,list.length);
 const dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
 // centres: standing halls, markets and public spaces; several far apart make a multi-centred district
 const centres=all.filter(b=>b.kind==='hall'||b.kind==='market'||b.kind==='public');
 const groups:LayoutBuilding[][]=[];
 for(const c of centres){const g=groups.find(g=>g.some(o=>dist(o,c)<t.centreGap));if(g)g.push(c);else groups.push([c]);}
 if(groups.length>=2)return 'L07';
 if(groups.length===1){
  const cx=groups[0]!.reduce((n,b)=>n+b.x,0)/groups[0]!.length,cy=groups[0]!.reduce((n,b)=>n+b.y,0)/groups[0]!.length;
  if(share(b=>Math.hypot(b.x-cx,b.y-cy)<=t.centreReach)>=t.centreShare)return 'L06';
 }
 if(share(b=>input.waterDistance(b.x,b.y)<=t.waterReach)>=t.waterShare)return 'L03';
 if(share(b=>b.foundation==='F4')>=t.terraceShare)return 'L05';
 const blocks=all.filter(b=>b.kind==='block');
 if(blocks.length>=2&&share(b=>!!b.courtyard,blocks)>=t.courtyardShare)return 'L04';
 // linear: the spread along the main axis is much larger than across it
 const mx=all.reduce((n,b)=>n+b.x,0)/all.length,my=all.reduce((n,b)=>n+b.y,0)/all.length;
 let sxx=0,syy=0,sxy=0;for(const b of all){sxx+=(b.x-mx)**2;syy+=(b.y-my)**2;sxy+=(b.x-mx)*(b.y-my);}
 const tr=sxx+syy,det=sxx*syy-sxy*sxy,disc=Math.sqrt(Math.max(0,tr*tr/4-det)),major=tr/2+disc,minor=Math.max(1e-9,tr/2-disc);
 if(major/minor>=t.linearRatio**2)return 'L02';
 return 'L01';
}
const scaleNames=['集落','村','町','都市'] as const;
/** The text for the observation panel, e.g. 「水辺沿いに並ぶ町」. */
export function layoutLabel(type:LayoutType,scale:number):string {return layoutNames[type]+(scaleNames[Math.max(0,Math.min(3,scale))]??'集落');}
