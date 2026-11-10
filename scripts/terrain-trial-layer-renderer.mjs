/** Browser evaluation function: native owned sources, no world progression or candidate search. */
export async function terrainReviewLayer({year,policy,project,layer,profile='trial'}){
 if(!['trial','production'].includes(profile))throw Error('Unknown review profile');
 const observeCut=profile==='production'?(await import('/dist/scene/terrain-production-scene-v1.js')).observeTerrainProductionScene:(await import('/dist/scene/terrain-trial-scene-v1.js')).observeTerrainTrialScene;
 const {observeGeneratedWorldSession}=await import('/dist/story/world-session.js'),{decodeRecordPhysics}=await import('/dist/terrain/terrain-record-raster-v1.js'),{housingAt}=await import('/dist/story/housing-history.js'),{publicSpacesAt}=await import('/dist/story/public-space-history.js'),{selectReviewReservations}=await import('/dist/terrain/facility-plan-review.js'),{groundContextWindows,groundReachParents,southEntrance}=await import('/dist/terrain/ground-access-review.js');
 const world=policy==='terrain'?window.trial:window.base,r=world.review,site='hill-side',observation=policy==='terrain'?observeCut(world,year,1):observeGeneratedWorldSession(window.session,year,1),terrain=observation.ground.terrain,physics=decodeRecordPhysics(terrain.sites[site].physics),canvas=document.getElementById('scene');canvas.width=320;canvas.height=180;const c=canvas.getContext('2d');c.fillStyle='#ecece4';c.fillRect(0,0,320,180);if(terrain.sites[site].render.mirrorX){c.translate(320,0);c.scale(-1,1);}
 const occupied=[...r.placements.filter(p=>p.site===site&&p.builtYear<=year).map(p=>({id:p.objectId,kind:p.kind,plot:p.plot,entrance:p.entrance})),...housingAt(r.state.housing,year,site).blocks.map(b=>({id:b.blockId,kind:'housing',plot:b.footprint,entrance:southEntrance(b.footprint)})),...publicSpacesAt(r.state.publicSpaces,year,'generated-review-only').spaces.filter(p=>p.siteId===site).map(p=>({id:p.id,kind:'public-space',plot:p.footprint,entrance:southEntrance(p.footprint)}))],reservations=selectReviewReservations(r.plans[site],r.reservationMode,new Set(occupied.map(p=>p.id))),ctx={terrain,site,year,confirmedYear:year,historyStatus:'known',primaryRoot:r.plans[site].primaryRoot,occupancy:occupied,reservations};
 const paint=(x,y,color,w=1,h=1)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
 if(layer==='passage'){
  const parents=groundReachParents(groundContextWindows(physics,ctx),ctx.primaryRoot);for(let y=96;y<180;y++)for(let x=0;x<320;x++){const i=y*320+x;paint(x,y,parents[i]>=0?'#8aad8e':'#d3d1c9');}paint(...ctx.primaryRoot,'#c54f40',2,2);
 }else if(layer==='vegetation'){
  paint(0,96,'#dedbca',320,84);for(const p of observation.ground.vegetation)paint(p.index%40*8,96+Math.floor(p.index/40)*8,['#cabd85','#a3b278','#6e9470','#456e58'][p.stage]??'#365642',8,Math.min(8,180-(96+Math.floor(p.index/40)*8)));
 }else{
  for(let y=96;y<180;y++)for(let x=0;x<320;x++){
   const i=y*320+x,water=physics.surface[i]===2||physics.surface[i]===3;
   const value=Math.max(45,Math.min(220,205-physics.elevation[i]*4));
   paint(x,y,water?'#6e9dab':layer==='physical'?(physics.grade[i]===2?'#94765a':`rgb(${value},${Math.min(240,value+16)},${Math.max(0,value-15)})`):'#dcdace');
  }
  if(layer==='occupation'){
   for(const o of occupied){const p=o.plot;paint(p.x,p.y,o.kind==='field'?'#bba264':o.kind==='public-space'?'#94b59b':'#a7785b',p.width,p.depth);paint(...o.entrance,'#40392e',2,2);}
   c.strokeStyle='#507599';c.setLineDash([2,2]);for(const o of reservations)c.strokeRect(o.plot.x+.5,o.plot.y+.5,o.plot.width,o.plot.depth);c.setLineDash([]);
  }
  if(layer==='water')for(const p of terrain.geography.ports.filter(p=>p.site===site&&p.visible&&p.point))paint(...p.point,'#335e8c',2,2);
  if(layer==='changed'&&policy==='terrain'&&year>=project.effectiveYear){const event=window.trial.terrainHistory.events.find(e=>e.id===project.id);for(const cell of event.cells)paint(cell[0]%320,Math.floor(cell[0]/320),cell[4]!==cell[8]?'#ce8148':'#8f68aa');}
 }
 c.strokeStyle='#bd4f3b';c.setLineDash([2,2]);c.lineWidth=1;c.strokeRect(project.plot.x-.5,project.plot.y-.5,project.plot.width+1,project.plot.depth+1);c.setLineDash([]);
 return canvas.toDataURL('image/png').split(',')[1];
}
