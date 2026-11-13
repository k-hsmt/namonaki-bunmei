/**
 * Issue #47 B2d2: the ground material of each patch (local-flora-v1) drawn with the B1a ground patterns
 * (rendererId ground-materials-v1): sand, rock, bare soil, leaf litter, wet soil and cold ground.
 *
 * The B2d biome soil tint stays the ground colour. On top of it each land pixel takes, by its patch's material,
 * a shift toward the material's base colour and the material's flecks. The fleck pattern is the B1a pattern (sand: grains) laid
 * over the whole district in record coordinates (column x appears at screen 319−x in a mirrored scene), so it
 * stays put when years or plants change. Pure; appearance only, never read by history.
 */
import {GROUND_MATERIALS,type FloraPatch,type GroundMaterial} from './local-flora-v1.js';
import {vh} from './plant-sprites-v1.js';

export const GROUND_MATERIALS_RULE_ID='ground-materials-v1' as const;
/** B1a ground materials: [base, fleck 1, fleck 2]. */
export const GROUND_COLORS:Readonly<Record<GroundMaterial,readonly [string,string,string]>>=Object.freeze({
 sand:['#cdbb8a','#ddcc9c','#b8a576'],rock:['#9c968a','#b5afa1','#7a756c'],bareSoil:['#9a8768','#ad9a78','#82715a'],
 leafLitter:['#8a7550','#a58c5a','#6e5e44'],wetSoil:['#6b6a52','#7b7c60','#575843'],coldGround:['#a7aa9c','#c8cbbe','#8a8e80'],
});
/** How far a land pixel moves toward its material's base colour (after the biome tint), and how strongly flecks show. */
export const GROUND_BASE_SHIFT=.2,GROUND_FLECK_STRENGTH=.55;
/** Patch edges are frayed: each pixel reads the material of the patch at a fixed offset of up to this many pixels, so 8 px blocks do not show. */
export const GROUND_EDGE_JITTER=3;

const rgb=(c:string)=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)) as [number,number,number];
/** B1a paintGround over the district (320×84 from y 96): 0 none, 1 fleck 1, 2 fleck 2. Same rules and hashes as B1a, except sand (grains). */
function fleckField(id:GroundMaterial):Uint8Array {
 const w=320,h=84,f=new Uint8Array(w*h),put=(x:number,y:number,len:number,v:number)=>{for(let k=0;k<len&&x+k<w;k++)f[y*w+x+k]=v;};
 for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
  const v=vh(xx*31+yy,yy*17+xx)%29;
  if(id==='rock'){if(yy%5===0&&v<7)put(xx,yy,Math.min(3,w-xx),1);else if(yy%5===1&&v<4)put(xx,yy,Math.min(2,w-xx),2);}
  else if(id==='leafLitter'){if(v<3)put(xx,yy,Math.min(2,w-xx),v?1:2);}
  else if(id==='wetSoil'){if(yy%4===1&&v<9)put(xx,yy,1,1);else if(v===0)put(xx,yy,1,2);}
  else if(id==='coldGround'){if(v<2)put(xx,yy,1,1);else if(v===2)put(xx,yy,1,2);}
  // Sand: single-pixel grains (Human review B2d2: the B1a 2 px dashes on every third row read as large streaks).
  else if(id==='sand'){if(v===0)put(xx,yy,1,1);else if(v===1)put(xx,yy,1,2);}
  else if(v<2)put(xx,yy,1,v?1:2);
 }
 return f;
}
const fields=new Map<GroundMaterial,Uint8Array>();
const fieldOf=(id:GroundMaterial)=>{let f=fields.get(id);if(!f){f=fleckField(id);fields.set(id,f);}return f;};
export interface GroundPlot {readonly x:number;readonly y:number;readonly width:number;readonly depth:number}

/**
 * Paints the ground materials on a screen RGBA image (the biome-tinted backdrop). Only stable land is painted
 * (surface land, no cliff or sandbar); pixels inside `skip` plots (record coordinates: built ground, plazas,
 * bridges) keep their ground as drawn.
 */
export function paintGroundMaterials(rgba:Uint8ClampedArray,patches:readonly (FloraPatch|null)[],physics:{readonly surface:Uint8Array;readonly bearing:Uint8Array},mirror:boolean,skip:readonly GroundPlot[]=[]):void {
 const colors=Object.fromEntries(GROUND_MATERIALS.map(m=>[m,GROUND_COLORS[m].map(rgb)])) as Record<GroundMaterial,[number,number,number][]>;
 const blocked=new Uint8Array(57600);
 for(const p of skip)for(let y=Math.max(0,p.y);y<Math.min(180,p.y+p.depth);y++)for(let x=Math.max(0,p.x);x<Math.min(320,p.x+p.width);x++)blocked[y*320+x]=1;
 for(let y=96;y<180;y++)for(let x=0;x<320;x++){
  const rx=mirror?319-x:x,z=y*320+rx;if(physics.surface[z]!==1||physics.bearing[z]!==0||blocked[z])continue;
  const own=patches[Math.floor((y-96)/8)*40+Math.floor(rx/8)];if(!own)continue;
  const h=vh(rx,y*7+3),J=GROUND_EDGE_JITTER,jx=Math.min(319,Math.max(0,rx+h%(2*J+1)-J)),jy=Math.min(179,Math.max(96,y+(h>>>8)%(2*J+1)-J));
  const p=patches[Math.floor((jy-96)/8)*40+Math.floor(jx/8)]??own;
  const m=GROUND_MATERIALS[p[5]]!,col=colors[m],fleck=fieldOf(m)[(y-96)*320+rx]!,i=(y*320+x)*4;
  for(let j=0;j<3;j++){let v=rgba[i+j]!*(1-GROUND_BASE_SHIFT)+col[0]![j]!*GROUND_BASE_SHIFT;if(fleck)v=v*(1-GROUND_FLECK_STRENGTH)+col[fleck]![j]!*GROUND_FLECK_STRENGTH;rgba[i+j]=Math.round(v);}
 }
}
