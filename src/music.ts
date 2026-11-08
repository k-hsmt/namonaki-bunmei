/** Presentation-only audio. Never reads or writes the civilization/session save. */
const SETTINGS_KEY='namonaki-bunmei:music:v1';
export function mountMusic(){
 const audio=document.getElementById('music') as HTMLAudioElement;
 const button=document.getElementById('music-toggle') as HTMLButtonElement;
 const volume=document.getElementById('music-volume') as HTMLInputElement;
 const status=document.getElementById('music-status')!;
 let level=30;
 try{const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)??'null');if(typeof saved?.volume==='number'&&Number.isFinite(saved.volume))level=Math.max(0,Math.min(100,saved.volume));}catch{/* Storage is optional. */}
 volume.value=String(level);
 let context:AudioContext|undefined,gain:GainNode|undefined;
 let requested=false;
 const applyVolume=()=>{if(gain)gain.gain.setTargetAtTime(level/100,context!.currentTime,.03);else audio.volume=level/100;};
 const persist=()=>{try{localStorage.setItem(SETTINGS_KEY,JSON.stringify({volume:level,enabled:requested}));}catch{/* Playback remains available in private/restricted storage. */}};
 const render=()=>{button.textContent=requested?'停止 □':'再生 ▷';button.setAttribute('aria-pressed',String(requested));};
 const stop=()=>{requested=false;audio.pause();audio.currentTime=0;render();persist();};
 applyVolume();
 volume.addEventListener('input',()=>{level=Number(volume.value);applyVolume();persist();});
 audio.addEventListener('error',()=>{stop();status.textContent='音楽を読み込めませんでした。再生を押して再試行できます。';});
 button.addEventListener('click',async()=>{
  if(requested){stop();return;}
  requested=true;render();status.textContent='';persist();
  try{
   // iOS does not implement HTMLMediaElement.volume. Gain changes the original
   // recording's level only; it does not synthesize or recompose the music.
   if(!context&&typeof AudioContext!=='undefined'){
    context=new AudioContext();gain=context.createGain();
    context.createMediaElementSource(audio).connect(gain);gain.connect(context.destination);
    audio.volume=1;gain.gain.value=level/100;
   }
   if(audio.error)audio.load();
   const resumed=context?.resume();
   const playing=audio.play();
   await Promise.all([resumed,playing]);
  }catch{
   if(requested){stop();status.textContent='音楽を再生できませんでした。もう一度再生を押してください。';}
  }
 });
 // Saved intent is informational only: every document starts silent.
 render();
}
