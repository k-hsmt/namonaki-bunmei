/** Presentation-only playback of the original recording; independent of game saves. */
const SETTINGS_KEY='namonaki-bunmei:music:v1';
export function mountMusic(){
 const button=document.getElementById('music-toggle') as HTMLButtonElement;
 const volume=document.getElementById('music-volume') as HTMLInputElement;
 const status=document.getElementById('music-status');
 if(!button||!volume||!status)return;
 let level=30;
 try{const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)??'null');if(typeof saved?.volume==='number'&&Number.isFinite(saved.volume))level=Math.max(0,Math.min(100,saved.volume));}catch{/* Storage is optional. */}
 volume.value=String(level);
 let context:AudioContext|undefined,gain:GainNode|undefined;
 let recording:Promise<AudioBuffer>|undefined,source:AudioBufferSourceNode|undefined;
 let requested=false,generation=0;
 const persist=()=>{try{localStorage.setItem(SETTINGS_KEY,JSON.stringify({volume:level,enabled:requested}));}catch{/* Playback remains available without storage. */}};
 const render=()=>{button.textContent=requested?'BGM □':'BGM ▷';button.setAttribute('aria-pressed',String(requested));button.setAttribute('aria-label',requested?'BGMを停止':'BGMを再生');};
 const stop=()=>{generation++;requested=false;source?.stop();source?.disconnect();source=undefined;status.textContent='';render();persist();};
 volume.addEventListener('input',()=>{level=Number(volume.value);gain?.gain.setTargetAtTime(level/100,context!.currentTime,.03);persist();});
 button.addEventListener('click',async()=>{
  if(requested){stop();return;}
  requested=true;const attempt=++generation;render();persist();status.textContent='BGMを読み込み中…';
  try{
   // Unlock ONE audio system synchronously inside the gesture. Safari can gate
   // HTMLMediaElement playback separately from a connected AudioContext.
   // Decode the supplied MP3 as-is: no synthesized notes or rewritten music.
   if(!context){context=new AudioContext();gain=context.createGain();gain.gain.value=level/100;gain.connect(context.destination);}
   const resumed=context.resume();
   recording??=fetch(button.dataset.musicSrc!).then(response=>{
    if(!response.ok)throw Error('Audio download failed');
    return response.arrayBuffer();
   }).then(bytes=>context!.decodeAudioData(bytes)).catch(error=>{recording=undefined;throw error;});
   const [buffer]=await Promise.all([recording,resumed]);
   // A stop or a newer click during download must never start stale playback.
   if(!requested||attempt!==generation)return;
   source=context.createBufferSource();source.buffer=buffer;source.loop=true;
   source.connect(gain!);source.start();status.textContent='';
  }catch{
   if(attempt===generation){stop();status.textContent='BGMを再生できませんでした。もう一度BGMを押してください。';}
  }
 });
 // Persisted intent never authorizes autoplay in a new document.
 render();
}
