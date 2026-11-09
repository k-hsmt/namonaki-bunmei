// Load independently: an audio API or module error must never block the world.
void import('./music.js').then(({mountMusic})=>mountMusic()).catch(()=>{
 const status=document.getElementById('music-status');
 if(status)status.textContent='BGMを準備できませんでした。ページを読み込み直してください。';
});
