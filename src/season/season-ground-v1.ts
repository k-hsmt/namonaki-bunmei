/**
 * Issue #36 D1a PROTOTYPE: the ground in a season, over the biome tint and ground materials (appearance only).
 * Grassy land greens up and turns to straw; deciduous forest floors take a little litter colour. Stable land only;
 * ground material ids, soil and occupation are never changed. Pure.
 */
import {describeFloraPatch,type FloraPatch} from '../flora/local-flora-v1.js';
import {groundSeasonLook,type SeasonalView} from './season-presentation-v1.js';

const GREEN=[0x8f,0xa8,0x5e],STRAW=[0xc2,0xad,0x74],LITTER=[0xa8,0x72,0x3e];
export function paintGroundSeason(rgba:Uint8ClampedArray,patches:readonly (FloraPatch|null)[],physics:{readonly surface:Uint8Array;readonly bearing:Uint8Array},mirror:boolean,v:SeasonalView):void {
 const looks=new Map<string,ReturnType<typeof groundSeasonLook>>();
 for(let y=96;y<180;y++)for(let x=0;x<320;x++){
  const rx=mirror?319-x:x,z=y*320+rx;if(physics.surface[z]!==1||physics.bearing[z]!==0)continue;
  const p=patches[Math.floor((y-96)/8)*40+Math.floor(rx/8)];if(!p)continue;
  const biome=describeFloraPatch(p).biome;let l=looks.get(biome);if(!l){l=groundSeasonLook(biome,v);looks.set(biome,l);}
  const i=(y*320+x)*4;
  for(let j=0;j<3;j++){let c=rgba[i+j]!;c=c*(1-l.green)+GREEN[j]!*l.green;c=c*(1-l.straw)+STRAW[j]!*l.straw;c=c*(1-l.litter)+LITTER[j]!*l.litter;rgba[i+j]=Math.round(c);}
 }
}
