/** Issue #36 D1 — controlled, read-only season trial. Never imported by production code. */
export const SEASON36_RULE_ID = 'season36-d1-trial';
export const PHASES = Object.freeze(['芽吹き', '生育期', '黄変・紅葉', '休眠期']);
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const finite=(v)=>typeof v==='number'&&Number.isFinite(v);
export function phaseAt(year){
  if(!Number.isSafeInteger(year)||year<0||year>10000)throw Error('Invalid confirmed year');
  return year%4;
}
/** Game indices, NOT Celsius, precipitation, or a simulation of within-year weather. */
export function appearance(climate,deviation,phase){
  if(!Number.isInteger(phase)||phase<0||phase>3)throw Error('Invalid phase');
  if(!climate||!deviation||!['effectiveTemperature','effectiveMoisture','annualTemperatureRangeIndex','rainfallConcentrationIndex'].every(k=>finite(climate[k]))||!['temperature','humidity'].every(k=>finite(deviation[k])))throw Error('Invalid climate input');
  const range=clamp(climate.annualTemperatureRangeIndex/100),rain=clamp(climate.rainfallConcentrationIndex/100);
  const temperature=climate.effectiveTemperature+.5*deviation.temperature+(8+52*range)*[-.26,.75,.03,-1][phase];
  const moisture=climate.effectiveMoisture+.5*deviation.humidity+rain*60*[.2,.8,-.05,-.9][phase];
  const snow=clamp((-12-temperature)/58)*clamp((moisture+85)/75,.08,1);
  const dryness=clamp((8-moisture)/105);
  const autumn=phase===2?clamp((range-.22)*1.5)*clamp((temperature+35)/70):0;
  const leaf=phase===0?.58+(.32*(1-dryness)):phase===1?1-dryness*.23:phase===2?.72-dryness*.22:.12+(.45*(1-range));
  return Object.freeze({ruleId:SEASON36_RULE_ID,phase,temperature,moisture,snow,dryness,autumn,leaf:clamp(leaf),wetness:clamp((moisture+40)/110)});
}
/** Stable visual noise only; never consumes or advances civilisation RNG. */
export function visualHash(seed,x,y,salt=0){
  if(![seed,x,y,salt].every(Number.isSafeInteger))throw Error('Invalid visual hash');
  let h=Math.imul((seed^0x36a71)|0,0x9e3779b1);
  h^=Math.imul((x+319)|0,0x85ebca6b);h^=Math.imul((y+97)|0,0xc2b2ae35);h^=Math.imul((salt+29)|0,0x27d4eb2f);
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;return (h^h>>>16)>>>0;
}
/**
 * UI comparison only: no per-year animation queue. Emit at most one sampled
 * presentation every minIntervalMs and always close with the final year.
 * Events represent confirmed years, not seasonal sub-year simulation.
 */
export function coalesceRapidFrames(events,minIntervalMs){
  if(!Array.isArray(events)||!finite(minIntervalMs)||minIntervalMs<=0)throw Error('Invalid rapid-frame input');
  const frames=[];let lastTime=-Infinity,lastEvent=null;
  for(const event of events){
    if(!event||!finite(event.timeMs)||!Number.isSafeInteger(event.year)||event.year<0||(lastEvent&&(event.timeMs<lastEvent.timeMs||event.year<lastEvent.year)))throw Error('Nonmonotonic confirmed events');
    lastEvent=event;
    if(event.timeMs-lastTime>=minIntervalMs){
      frames.push({timeMs:event.timeMs,year:event.year,phase:phaseAt(event.year),reason:'sample'});
      lastTime=event.timeMs;
    }
  }
  if(lastEvent&&frames.at(-1)?.year!==lastEvent.year)frames.push({timeMs:lastEvent.timeMs,year:lastEvent.year,phase:phaseAt(lastEvent.year),reason:'stop'});
  return frames;
}
