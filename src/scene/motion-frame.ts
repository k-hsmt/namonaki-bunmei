import {channelMask} from '../irrigation/presentation-v1.js';
import {environmentAppearance} from '../environment/presentation-v1.js';
import {readOwnedRecordPhysics} from '../terrain/owned-record-physics.js';
import {planWaterTracks,waterStrokeAt} from './water-motion.js';
import type {GeneratedSceneObservation} from './generated-scene-review.js';
import {drawGeneratedSceneReview,drawSceneTree,projectScenePaint} from './draw-generated-review.js';
import {presentationPeopleCount} from './generated-presentation-review.js';
import {planSceneMotion,journeyAt,sceneActivityCount} from './motion-plan.js';
/** Equivalent paint/activities within one immutable terrain; ages remain in history. */
export function sceneMotionVisualKey(o:GeneratedSceneObservation):string {
 const {snapshot:s,composition:c,ground:g}=o;
 return JSON.stringify([environmentAppearance(g.environment,g.environmentAppearance),g.site,g.terrain.source.seed,...(g.terrain.format==='resolved-terrain-at-year'?[g.terrain.revisionId,g.terrain.changes.map(e=>[e.id,s.year-e.effectiveYear<15])]:[]),...(g.channelView?[g.channelView.key,g.channelView.geometry?.cells]:[]),s.objects,s.publicSpaces,s.scars,c.residentialBlocks,g.facilities,g.bridges,
  g.vegetation?.map(p=>[p.index,p.stage,p.stage===0&&p.disturbedYear!==null&&s.year-p.disturbedYear<15]),
  Math.floor(s.year/20),sceneActivityCount(c.population,c.scale),presentationPeopleCount(c.population,s.scars.includes('epidemic'))]);
}
export function prepareSceneMotion(o:GeneratedSceneObservation){
 const paint=projectScenePaint(o),backdrop=document.createElement('canvas'),structures=document.createElement('canvas');drawGeneratedSceneReview(backdrop,o,'backdrop',paint);drawGeneratedSceneReview(structures,o,'structures',paint);
 const plan=planSceneMotion(o,paint),pixels=backdrop.getContext('2d')!.getImageData(0,0,320,180).data;
 // Piers/decks are already in this layer: a shimmer can only replace blue water.
 const ripples=plan.ripples.filter(p=>{const x=plan.mirror?319-p.point[0]:p.point[0],i=(p.point[1]*320+x)*4;return pixels[i+2]!>pixels[i]!;});
 const raster=readOwnedRecordPhysics(o.ground.terrain.sites[o.ground.site].physics),waterMask=new Uint8Array(320*180);
 for(let y=96;y<180;y++)for(let x=0;x<320;x++){const i=y*320+x,j=(y*320+(plan.mirror?319-x:x))*4;waterMask[i]=+((raster.surface[i]===2||raster.surface[i]===3)&&pixels[j+2]!>pixels[j]!);}
 const outlets=o.ground.terrain.geography.ports.filter(p=>p.site===o.ground.site&&p.flow==='out'&&p.visible&&p.point).map(p=>p.point!);
 const view=o.ground.channelView,mask=channelMask(view),canalMask=new Uint8Array(57600);if(view?.channel?.status==='active'&&mask)for(const [x,y]of view.geometry!.cells){const i=y*320+x,j=(y*320+(plan.mirror?319-x:x))*4;canalMask[i]=+(mask[i]===1&&((pixels[j]===86&&pixels[j+1]===143&&pixels[j+2]===156)||(pixels[j]===141&&pixels[j+1]===182&&pixels[j+2]===181)));}
 return {backdrop,structures,waterMask,canalMask,canalPath:view?.channel?.status==='active'?view.geometry!.path:[],waterTracks:planWaterTracks(raster,outlets,plan.ripples),plan:{...plan,ripples}};
}
export type PreparedSceneMotion=ReturnType<typeof prepareSceneMotion>;
export function drawSceneMotion(canvas:HTMLCanvasElement,prepared:PreparedSceneMotion,seconds:number):void {
 if(!Number.isFinite(seconds)||seconds<0)throw Error('Invalid motion time');if(canvas.width!==320)canvas.width=320;if(canvas.height!==180)canvas.height=180;
 const c=canvas.getContext('2d');if(!c)throw Error('2d context missing');const {backdrop,structures,plan:p}=prepared;c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.imageSmoothingEnabled=false;c.clearRect(0,0,320,180);c.drawImage(backdrop,0,0);c.save();if(p.mirror){c.translate(320,0);c.scale(-1,1);}
 for(const [i,cloud] of p.clouds.entries()){
  const x=((cloud.x+Math.floor(seconds*(i ? .98 : .68))+40)%360)-40,y=cloud.y;c.fillStyle=p.drought?'#c4c3aa':'#e9e1cb';c.fillRect(x+4,y,19,3);c.fillRect(x,y+3,31,5);c.fillRect(x+8,y-3,10,4);
 }
 // Every moving crest is clipped per pixel to visible saved water, including under bridges.
 c.fillStyle='#b0ccc7';for(const track of prepared.waterTracks){const a=waterStrokeAt(track,seconds);c.globalAlpha=a.alpha;for(let n=0;n<track.width;n++){const x=a.point[0]+(a.vertical?0:n)-Math.floor(a.vertical?0:track.width/2),y=a.point[1]+(a.vertical?n-Math.floor(track.width/2):0);if(x>=0&&x<320&&y>=96&&y<180&&prepared.waterMask[y*320+x])c.fillRect(x,y,1,1);}}c.globalAlpha=1;
 c.fillStyle='#b0ccc7';if(prepared.canalPath.length){const path=prepared.canalPath;for(let n=0;n<path.length;n+=9){const [x,y]=path[(Math.floor(seconds*2)+n)%path.length]!;for(let dx=0;dx<2;dx++)if(prepared.canalMask[y*320+x+dx])c.fillRect(x+dx,y,1,1);}}
 c.fillStyle='#9ab8b4';for(const q of p.ripples)if((Math.floor(seconds*2)+q.phase)%5===0)c.fillRect(q.point[0],q.point[1],1,1);
 for(const [i,t] of p.trees.entries())drawSceneTree(c,t.point[0],t.point[1],t.scale,Math.round(Math.sin(seconds*.7+i*2.3)),t.palette,t.foliage);
 for(const [i,g] of p.grass.entries())if(Math.sin(seconds*.8+i*2)>0){c.fillStyle=g.color;c.fillRect(g.point[0]+1,g.point[1]-1,1,1);}
 const people=[...p.journeys.map(j=>journeyAt(j,seconds)),...p.idle.map(point=>({point,walking:false,step:0}))];
 for(const [i,a] of people.entries()){
  const [x,y]=a.point;c.fillStyle='#d2b894';c.fillRect(x,y-6,2,2);c.fillStyle=['#66594f','#b29b74','#667a70'][i%3]!;c.fillRect(x,y-4,2,3);c.fillStyle='#454e48';if(a.walking){c.fillRect(x,y-1+a.step,1,2);c.fillRect(x+1,y-1+(a.step?0:1),1,2);}else c.fillRect(x,y-1,2,2);
 }
 c.restore();c.drawImage(structures,0,0);c.save();if(p.mirror){c.translate(320,0);c.scale(-1,1);}
 for(const source of p.smoke)for(let n=0;n<2;n++){
  const age=(seconds+source.phase+n*2)%5;c.globalAlpha=(1-age/5)*.22;c.fillStyle='#807f71';c.fillRect(source.x+Math.floor(age*.5),source.y-Math.floor(age*2),2,2);
 }
 c.restore();
}
