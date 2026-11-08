/** Wall-clock paint only. The world, its RNG and its persisted history are read-only. */
import type {WorldSession} from '../story/world-session.js';
import {drawWorldSession} from '../story/world-session.js';
import {observeGeneratedSceneReview,type GeneratedSceneObservation} from './generated-scene-review.js';
import {drawGeneratedSceneReview} from './draw-generated-review.js';
import {prepareSceneMotion,drawSceneMotion,sceneMotionVisualKey,type PreparedSceneMotion} from './motion-frame.js';
import type {SiteSnapshot} from './model.js';
export const sceneMotionPreferenceKey='namonaki-scene-motion-v1';
export class SceneMotionPlayer {
 get channelView(){return this.observation?.ground.channelView;}
 private world:WorldSession|null=null;private year=-1;private site=-1;private snapshot:SiteSnapshot|null=null;private observation:GeneratedSceneObservation|null=null;private prepared:PreparedSceneMotion|null=null;private visualKey:string|null=null;private terrain:object|null=null;
 private raf:number|null=null;private lastTimestamp:number|null=null;private seconds=0;private lastPaint=-Infinity;private preferred=true;private disposed=false;private frames=0;private builds=0;
 private readonly media=matchMedia('(prefers-reduced-motion: reduce)');
 constructor(private readonly canvas:HTMLCanvasElement,private readonly control:HTMLInputElement){
  try{this.preferred=localStorage.getItem(sceneMotionPreferenceKey)!=='off';}catch{}
  control.addEventListener('change',this.change);this.media.addEventListener('change',this.configure);document.addEventListener('visibilitychange',this.visibility);this.configure();
 }
 get environment(){return this.observation?.ground.environment;}
 get paintedFrames(){return this.frames;}get preparations(){return this.builds;}get isRunning(){return this.raf!==null;}
 private change=()=>{this.preferred=this.control.checked;try{localStorage.setItem(sceneMotionPreferenceKey,this.preferred?'on':'off');}catch{}this.configure();};
 private visibility=()=>{this.stopClock();if(!document.hidden)this.configure();};
 private configure=()=>{
  if(this.disposed)return;const supported=this.world?.mode==='generated';this.control.disabled=!supported||this.media.matches;this.control.checked=Boolean(supported&&this.preferred&&!this.media.matches);
  this.control.title=this.media.matches?'端末のモーション軽減設定に従い静止画で表示しています':!supported?'この情景は静止画で表示します':'';
  if(this.control.checked&&!document.hidden&&this.observation){
   if(!this.prepared){this.prepared=prepareSceneMotion(this.observation);this.builds++;}if(this.raf===null){this.paint();this.raf=requestAnimationFrame(this.tick);}
  }else{this.stopClock();if(this.observation)drawGeneratedSceneReview(this.canvas,this.observation);}
 };
 private paint(){if(this.prepared){drawSceneMotion(this.canvas,this.prepared,this.seconds);this.lastPaint=this.seconds;this.frames++;}}
 private tick=(timestamp:number)=>{
  this.raf=null;if(this.disposed||document.hidden||!this.control.checked||this.media.matches)return;
  if(this.lastTimestamp!==null)this.seconds+=Math.max(0,Math.min(.25,(timestamp-this.lastTimestamp)/1000));this.lastTimestamp=timestamp;
  if(this.seconds-this.lastPaint>=1/12-1e-8)this.paint();this.raf=requestAnimationFrame(this.tick);
 };
 private stopClock(){if(this.raf!==null)cancelAnimationFrame(this.raf);this.raf=null;this.lastTimestamp=null;}
 show(world:WorldSession,year:number,site:number):SiteSnapshot {
  if(this.disposed)throw Error('Disposed scene player');if(this.world===world&&this.year===year&&this.site===site)return this.snapshot!;
  if(world.mode==='generated'){
   const observation=observeGeneratedSceneReview(world.review,year,site),key=sceneMotionVisualKey(observation);
   if(this.terrain!==observation.ground.terrain||this.visualKey!==key){this.stopClock();this.prepared=null;}
   this.terrain=observation.ground.terrain;this.visualKey=key;this.observation=observation;this.snapshot=observation.snapshot;
  }else{this.stopClock();this.prepared=null;this.visualKey=null;this.terrain=null;this.observation=null;this.snapshot=drawWorldSession(this.canvas,world,year,site);}
  this.world=world;this.year=year;this.site=site;
  this.configure();return this.snapshot;
 }
 dispose(){this.disposed=true;this.stopClock();this.control.removeEventListener('change',this.change);this.media.removeEventListener('change',this.configure);document.removeEventListener('visibilitychange',this.visibility);this.prepared=null;this.observation=null;this.world=null;this.snapshot=null;this.terrain=null;this.visualKey=null;}
}
