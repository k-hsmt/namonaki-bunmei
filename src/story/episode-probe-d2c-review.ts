/**
 * Issue #40 D2c: a minimal probe of the episode frame on real worlds (review-only; definition set `probe-d2c`).
 *
 * It exists only to run the frame (annual commit, typed history, save round trip with an active episode, past
 * observation) on the full world. It is not the food system: D3a defines that, with its responses, failures and ends,
 * and replaces this probe. The probe reads only the regional economy's confirmed records and coverage:
 *  - started: a district shortage was recorded this year (the economy records one once it lasted 3 years);
 *  - reassessed: another district's shortage was recorded while the episode is active;
 *  - resolved: every district covered at 0.90 or more for the last 5 years (the economy keeps 5 years of coverage).
 * It never responds, fails or abandons (the frame's tests cover those with fixture definitions).
 */
import {defineEpisodeSet,type EpisodeDefinition,type EpisodeYear} from './episode-d2c-review.js';

const shortages=(y:EpisodeYear)=>(y.state.economy?.districts??[]).map((d,i)=>({i,id:d.shortageRecord}))
 .filter((d):d is {i:number;id:string}=>!!d.id&&y.record(d.id)?.year===y.year);
const covered=(y:EpisodeYear)=>{const ds=y.state.economy?.districts??[];return ds.length>0&&ds.every(d=>d.coverage.length===5&&d.coverage.every(c=>c>=.9));};

const foodProbe:EpisodeDefinition={kind:'food',definitionId:'food-shortage-probe-d2c',
 start:y=>{const s=shortages(y);return s.length?{evidence:s.map(d=>({type:'record',id:d.id})),state:{districts:s.map(d=>d.i)}}:null;},
 advance:(y,e)=>{
  const known=new Set((e.state as {districts:number[]}).districts),fresh=shortages(y).filter(d=>!known.has(d.i));
  if(fresh.length)return {kind:'reassessed',evidence:fresh.map(d=>({type:'record',id:d.id})),state:{districts:[...known,...fresh.map(d=>d.i)].sort((a,b)=>a-b)},reason:'shortage-spread'};
  if(covered(y))return {kind:'resolved',evidence:[{type:'ledger',key:'economy.districts.coverage>=0.90x5',year:y.year}],state:e.state,reason:'supply-stable-5y'};
  return null;
 }};
export const EPISODE_PROBE_D2C=defineEpisodeSet('probe-d2c',[foodProbe]);
