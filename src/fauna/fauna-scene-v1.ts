/**
 * Issue #38 D1c PROTOTYPE: the short motions of a planned scene (ruleId fauna-scene-v1). Appearance only.
 *
 * Every member of a fauna-habitat-v1 plan gets a 10-second loop chosen from its kind, with a phase from
 * terrainHash(['fauna-scene-v1', ...]) (D0 §10: no clock, no RNG; the same plan and second give the same scene).
 * Ground and water animals move at most HABITAT_PARAMETERS.stepRoom px from their planned spot, where the plan already
 * proved that the body fits (D0 §8: short local moves). Flying birds cross the sky from one screen edge to the other
 * and are absent the rest of the loop (D0 §8: no appearing or vanishing inside the screen).
 * The still image is the scene at seconds = 0 (D0 §10).
 */
import {terrainHash} from '../terrain/terrain-hash-v1.js';
import {FAUNA_GROUP,faunaMotionAt,type FaunaKind,type FaunaPose,type FaunaSegment} from './fauna-sprites-v1.js';
import {HABITAT_PARAMETERS,faunaBodyFits,type FaunaAppearancePlan,type FaunaMember,type FaunaHabitatYear} from './fauna-habitat-v1.js';

export const FAUNA_SCENE_RULE_ID='fauna-scene-v1' as const;
export const FAUNA_LOOP_SECONDS=10;

export interface FaunaSceneLoop {readonly id:string;readonly kind:FaunaKind;readonly size:number;readonly x:number;readonly y:number;readonly facing:1|-1;readonly phase:number;readonly segments:readonly FaunaSegment[]}
export interface FaunaSceneState {readonly id:string;readonly kind:FaunaKind;readonly size:number;readonly pose:FaunaPose;readonly frame:number;readonly x:number;readonly y:number;readonly facing:1|-1}

const step=HABITAT_PARAMETERS.stepRoom;
/** Loops of a kind: each closes (net displacement 0) and stays within ±stepRoom px. `f` flips the direction of steps. */
function loopOf(kind:FaunaKind,h:number,f:1|-1):FaunaSegment[] {
 const g=FAUNA_GROUP[kind],away=(v:number)=>v*f,back=(f===1?-1:1) as 1|-1;
 if(g==='large-herbivore'){
  if(h%4===0)return [{pose:'rest',seconds:6},{pose:'stand',seconds:4}];
  return [{pose:'graze',seconds:4,fps:1.5},{pose:'stand',seconds:2},{pose:'walk',seconds:1,fps:5,vx:away(step)},{pose:'graze',seconds:2,fps:1.5},{pose:'walk',seconds:1,fps:5,vx:away(-step),facing:back}];
 }
 if(kind==='hare')return [{pose:'sit',seconds:3},{pose:'graze',seconds:3,fps:2},{pose:'hop',seconds:.5,fps:8,vx:away(2*step)},{pose:'sit',seconds:2},{pose:'hop',seconds:.5,fps:8,vx:away(-2*step),facing:back},{pose:'graze',seconds:1,fps:2,facing:f}];
 if(kind==='fox')return [{pose:'stand',seconds:3},{pose:'walk',seconds:1,fps:6,vx:away(step)},{pose:'rest',seconds:4},{pose:'walk',seconds:1,fps:6,vx:away(-step),facing:back},{pose:'stand',seconds:1,facing:f}];
 if(kind==='lizard')return [{pose:'stand',seconds:4},{pose:'walk',seconds:.5,fps:8,vx:away(2*step)},{pose:'stand',seconds:5},{pose:'walk',seconds:.5,fps:8,vx:away(-2*step),facing:back}];
 if(kind==='sparrow')return [{pose:'peck',seconds:3,fps:4},{pose:'hop',seconds:.5,fps:4,vx:away(2*step)},{pose:'stand',seconds:2},{pose:'hop',seconds:.5,fps:4,vx:away(-2*step),facing:back},{pose:'peck',seconds:4,fps:4,facing:f}];
 if(kind==='heron')return [{pose:'stand',seconds:4},{pose:'peck',seconds:3,fps:1.5},{pose:'wade',seconds:1,fps:2,vx:away(step)},{pose:'stand',seconds:1},{pose:'wade',seconds:1,fps:2,vx:away(-step),facing:back}];
 if(g==='water-bird')return [{pose:'float',seconds:4,fps:2},{pose:'float',seconds:3,fps:2,vx:away(step/3)},kind==='duck'?{pose:'dabble',seconds:1,fps:2}:{pose:'float',seconds:1,fps:2},{pose:'float',seconds:2,fps:2,vx:away(-step/2),facing:back}];
 // flying birds: cross 340 px at 40 px/s in 8.5 s, then absent
 return [{pose:'fly',seconds:2,fps:8,vx:away(40)},{pose:'glide',seconds:3,vx:away(40)},{pose:'fly',seconds:3.5,fps:8,vx:away(40)},{pose:'absent',seconds:1.5}];
}
/** The pose a member holds when its loop cannot be proven: the pose the plan placed it in. */
const holdPose=(kind:FaunaKind):FaunaPose=>FAUNA_GROUP[kind]==='water-bird'&&kind!=='heron'?'float':kind==='hare'?'sit':'stand';
/**
 * The loops of every member of a plan (record coordinates). Pure. With the year's habitat input, every frame of every
 * ground or water loop (12 fps over the 10 s) is checked with faunaBodyFits at its exact spot; a member whose loop
 * leaves its land or water anywhere holds its planned pose and frame 0 instead (the spot and frame the plan proved;
 * fps 0.1 keeps frame 0 for the whole 10 s).
 */
export function faunaSceneLoops(plan:FaunaAppearancePlan,input?:FaunaHabitatYear):readonly FaunaSceneLoop[] {
 const out:FaunaSceneLoop[]=[];
 for(const g of plan.groups)g.members.forEach((m:FaunaMember,i)=>{
  const id=`${g.candidate}|${g.group}|${i}`,h=terrainHash([FAUNA_SCENE_RULE_ID,plan.seed,plan.site,id]),lead=terrainHash([FAUNA_SCENE_RULE_ID,plan.seed,plan.site,g.candidate,g.group]);
  const flying=g.group==='flying-bird';
  // a flock flies in a loose line: each member follows the leader's path 0.25 s later (10 px behind) and 1–2 px off in
  // height, so every member leaves the screen before its absent time begins. The flock's phase comes from the hash, so
  // the still image (second 0) may catch it anywhere on its way
  const x=flying?(m.facing===1?-12:331):m.x,y=flying?m.y+(i%2?2:-1)*(i?1:0):m.y;
  let segments=loopOf(m.kind,h>>>8,m.facing);segments[0]={...segments[0]!,facing:segments[0]!.facing??m.facing};
  if(input&&!flying){
   for(let k=0;k<FAUNA_LOOP_SECONDS*12;k++){const s=faunaMotionAt(m.kind,segments,k/12);if(s&&!faunaBodyFits(input,m.kind,m.size,s.pose,m.x+s.dx,m.y+s.dy,s.frame,0,s.facing)){segments=[{pose:holdPose(m.kind),seconds:FAUNA_LOOP_SECONDS,fps:.1,facing:m.facing}];break;}}
  }
  out.push(Object.freeze({id,kind:m.kind,size:m.size,x,y,facing:m.facing,phase:flying?((lead%100)/10+FAUNA_LOOP_SECONDS-.25*i)%FAUNA_LOOP_SECONDS:(h%100)/10,segments:Object.freeze(segments)}));
 });
 return Object.freeze(out);
}
/** Every member visible at `seconds` (the still image is seconds = 0). Deterministic: only the plan and the second decide it. */
export function faunaSceneAt(loops:readonly FaunaSceneLoop[],seconds:number):readonly FaunaSceneState[] {
 if(!Number.isFinite(seconds)||seconds<0)throw Error('Invalid scene time');
 const out:FaunaSceneState[]=[];
 for(const l of loops){
  const m=faunaMotionAt(l.kind,l.segments,(seconds+l.phase)%FAUNA_LOOP_SECONDS);if(!m)continue;
  out.push({id:l.id,kind:l.kind,size:l.size,pose:m.pose,frame:m.frame,x:l.x+m.dx,y:l.y+m.dy,facing:m.facing});
 }
 return out;
}
