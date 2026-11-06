import {terrainHash,type Point} from './hill-prototype.js';
export const mountainVariants=['M01','M02','M03','M04','M05','M06'] as const;
export type MountainVariant=typeof mountainVariants[number];
export const mountainLabels:Record<MountainVariant,string>={M01:'One high peak',M02:'Twin peaks',M03:'Long low range',M04:'Open gorge',M05:'Layered ranges',M06:'Mountains opening to sea'};
export interface MountainLandmark {id:string;position:number;height:number}
export interface MountainPrototype {generatorId:'mountain-prototype-v1';seed:number;variant:MountainVariant;landmarks:readonly MountainLandmark[]}
export interface MountainProjection {site:'river-bank'|'hill-side'|'coast-inlet';layers:readonly {tone:'far'|'middle';contour:readonly Point[]}[];landmarks:readonly {id:string;point:Point}[]}
export function generateMountainPrototype(input:number,variant:MountainVariant):MountainPrototype {
 if(!mountainVariants.includes(variant))throw Error('unknown mountain variant');
 const seed=(input>>>0)||1;
 const templates:Record<MountainVariant,readonly Point[]>={
  M01:[[0,5],[180,9],[350,13],[512,34],[690,12],[860,8],[1024,5]],
  M02:[[0,5],[160,12],[310,32],[512,9],[720,30],[880,12],[1024,5]],
  M03:[[0,9],[145,16],[290,12],[440,20],[600,13],[760,17],[900,12],[1024,9]],
  M04:[[0,30],[160,33],[310,25],[380,5],[650,4],[725,24],[880,32],[1024,30]],
  M05:[[0,11],[160,26],[300,17],[450,35],[610,15],[760,30],[900,17],[1024,12]],
  M06:[[0,14],[140,30],[290,24],[440,12],[560,4],[720,2],[1024,2]],
 };
 const landmarks=templates[variant].map(([x,h],i)=>({id:variant+'-landmark-'+i,position:x,
  height:Math.max(variant==='M03'&&x===440?20:2,h+(terrainHash(['mountain-prototype-v1',seed,'mountains','world',variant,0,i])%5-2))}));
 return {generatorId:'mountain-prototype-v1',seed,variant,landmarks};
}
/** Canonical east-facing camera coordinates; mirrorX is a separate saved view transform. */
export function projectMountainPrototype(t:MountainPrototype,site:MountainProjection['site']):MountainProjection {
 const shift=site==='hill-side'?-10:site==='coast-inlet'?12:0;
 const scale=site==='hill-side'?1.04:site==='coast-inlet'?.92:1;
 const landmarks=t.landmarks.map(l=>({id:l.id,point:[Math.round(16+l.position*288/1024+shift),Math.round(90-l.height*scale)] as Point}));
 const base:Point[]=[[0,90],...landmarks.map(l=>l.point),[320,90]];
 const layers:{tone:'far'|'middle';contour:Point[]}[]=[{tone:'far',contour:base}];
 if(t.variant==='M05')layers.push({tone:'middle',contour:[[0,94],...landmarks.map(l=>[Math.max(0,Math.min(320,l.point[0]+19)),Math.round(91-(90-l.point[1])*.65)] as Point),[320,94]]});
 return {site,layers,landmarks};
}
export function drawMountainProjection(c:CanvasRenderingContext2D,p:MountainProjection):void {
 for(const layer of p.layers){c.fillStyle=layer.tone==='far'?'#9da991':'#8c9b80';c.beginPath();c.moveTo(layer.contour[0]![0],layer.contour[0]![1]);
  for(const q of layer.contour.slice(1))c.lineTo(q[0],q[1]);c.closePath();c.fill();}
}
