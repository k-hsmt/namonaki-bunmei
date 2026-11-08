import type {GeneratedSceneObservation} from './generated-scene-review.js';
import {drawGeneratedSceneReview,drawSceneTree,projectScenePaint} from './draw-generated-review.js';
import {presentationPeopleCount} from './generated-presentation-review.js';
import {planSceneMotion,journeyAt,sceneActivityCount} from './motion-plan.js';
/** Equivalent paint/activities within one immutable terrain; ages remain in history. */
export function sceneMotionVisualKey(o:GeneratedSceneObservation):string {
 const {snapshot:s,composition:c,ground:g}=o;
 return JSON.stringify([g.site,g.terrain.source.seed,s.objects,s.publicSpaces,s.scars,c.residentialBlocks,g.facilities,g.bridges,
  g.vegetation?.map(p=>[p.index,p.stage,p.stage===0&&p.disturbedYear!==null&&s.year-p.disturbedYear<15]),
  Math.floor(s.year/20),sceneActivityCount(c.population,c.scale),presentationPeopleCount(c.population,s.scars.includes('epidemic'))]);
}
export function prepareSceneMotion(o:GeneratedSceneObservation){
 const paint=projectScenePaint(o),backdrop=document.createElement('canvas'),structures=document.createElement('canvas');drawGeneratedSceneReview(backdrop,o,'backdrop',paint);drawGeneratedSceneReview(structures,o,'structures',paint);
 const plan=planSceneMotion(o,paint),pixels=backdrop.getContext('2d')!.getImageData(0,0,320,180).data;
 // Piers/decks are already in this layer: a shimmer can only replace blue water.
 const ripples=plan.ripples.filter(p=>{const x=plan.mirror?319-p.point[0]:p.point[0],i=(p.point[1]*320+x)*4;return pixels[i+2]!>pixels[i]!;});
 return {backdrop,structures,plan:{...plan,ripples}};
}
export type PreparedSceneMotion=ReturnType<typeof prepareSceneMotion>;
export function drawSceneMotion(canvas:HTMLCanvasElement,prepared:PreparedSceneMotion,seconds:number):void {
 if(!Number.isFinite(seconds)||seconds<0)throw Error('Invalid motion time');if(canvas.width!==320)canvas.width=320;if(canvas.height!==180)canvas.height=180;
 const c=canvas.getContext('2d');if(!c)throw Error('2d context missing');const {backdrop,structures,plan:p}=prepared;c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.imageSmoothingEnabled=false;c.clearRect(0,0,320,180);c.drawImage(backdrop,0,0);c.save();if(p.mirror){c.translate(320,0);c.scale(-1,1);}
 for(const [i,cloud] of p.clouds.entries()){
  const x=((cloud.x+Math.floor(seconds*(i ? .65 : .45))+40)%360)-40,y=cloud.y;c.fillStyle=p.drought?'#c4c3aa':'#e9e1cb';c.fillRect(x+4,y,19,3);c.fillRect(x,y+3,31,5);c.fillRect(x+8,y-3,10,4);
 }
 c.fillStyle='#9ab8b4';for(const q of p.ripples)if((Math.floor(seconds*2)+q.phase)%5===0)c.fillRect(q.point[0],q.point[1],1,1);
 for(const [i,t] of p.trees.entries())drawSceneTree(c,t.point[0],t.point[1],t.scale,Math.round(Math.sin(seconds*.7+i*2.3)));
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
