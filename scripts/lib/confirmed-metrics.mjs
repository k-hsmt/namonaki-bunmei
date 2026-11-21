/**
 * Issue #29 S1 added one field to every civilization state: observation.metrics (the confirmed metric history).
 * Audits pinned to complete values recorded before #29 compare the value with that field removed, which shows that
 * no earlier value, event or RNG draw changed. Only that field is removed; everything else is compared as before.
 */
export function withoutConfirmedMetrics(value){
 if(Array.isArray(value))return value.map(withoutConfirmedMetrics);
 if(!value||typeof value!=='object')return value;
 const out={};
 for(const [key,v] of Object.entries(value)){
  if(key==='observation'&&v&&typeof v==='object'&&!Array.isArray(v)){const {metrics,...rest}=v;out[key]=withoutConfirmedMetrics(rest);}
  else out[key]=withoutConfirmedMetrics(v);
 }
 return out;
}

/**
 * The pre-#29 value of an economic origin hash. The origin is the irrigated world of `seed` at year 0; its live
 * hash must be that origin's save, and the returned hash is the same save without the metric history.
 */
export async function preMetricsOriginHash(originHash,seed){
 const [{createNewIrrigatedWorld},{createGeneratedWorldSave},{reviewBaseHash}]=await Promise.all([
  import('../../dist/story/new-world.js'),import('../../dist/story/world-save.js'),import('../../dist/irrigation/wire-v1.js')]);
 const origin=createGeneratedWorldSave(createNewIrrigatedWorld(seed).review);
 if(await reviewBaseHash(origin)!==originHash)throw Error('The economic origin is not the year-0 irrigated world of seed '+seed);
 return reviewBaseHash(withoutConfirmedMetrics(origin));
}

/**
 * The pre-#29 hash of a terrain-trial packet. Besides the states, only hashes derived from them differ: the economic
 * origin hash, the v7 origin packet's payload hash (and the trial origin hash over that packet, copied into its
 * template) and the trial's own payload hash. They are recomputed, bottom-up, from the stripped values.
 */
export async function preMetricsTerrainTrialPacketHash(save,seed){
 const [{createNewEconomicWorld},{prepareEconomicProductionSave},{terrainRevisionHash},{reviewBaseHash}]=await Promise.all([
  import('../../dist/story/new-world.js'),import('../../dist/irrigation/economic-production-storage-v1.js'),import('../../dist/terrain/terrain-revision-wire-v1.js'),import('../../dist/irrigation/wire-v1.js')]);
 const live=await prepareEconomicProductionSave((await createNewEconomicWorld(seed)).review);
 if(await terrainRevisionHash(live)!==save.terrainChanges.originHash)throw Error('The trial origin is not the given economic world');
 const originHash=await preMetricsOriginHash(live.economicCoupling.originHash,seed);
 const {payloadHash:_,...origin}=withoutConfirmedMetrics(live);origin.economicCoupling={...origin.economicCoupling,originHash};
 const originPacket={...origin,payloadHash:await reviewBaseHash(origin)};
 const {payloadHash:__,...payload}=withoutConfirmedMetrics(save);
 payload.world={...payload.world,economicCoupling:{...payload.world.economicCoupling,originHash}};
 const template=payload.terrainChanges.originPrefix.template;
 payload.terrainChanges={...payload.terrainChanges,originHash:await terrainRevisionHash(originPacket),
  originPrefix:{...payload.terrainChanges.originPrefix,template:{...template,payloadHash:originPacket.payloadHash,economicCoupling:{...template.economicCoupling,originHash}}}};
 return reviewBaseHash({...payload,payloadHash:await terrainRevisionHash(payload)});
}
