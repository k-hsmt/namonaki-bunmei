import assert from 'node:assert/strict';

/**
 * Issue #29 S1: the confirmed metric history is the only field the civilization state gained. A state with it
 * removed must still hash to the value pinned before #29, which shows that no existing value, event or RNG draw changed.
 */
export function withoutConfirmedMetrics(state){
 const copy=structuredClone(state);
 assert.ok(copy.observation.metrics,'every current civilization records its confirmed metrics');
 delete copy.observation.metrics;
 return copy;
}

/** One row per confirmed year from year 0; the last row is the civilization's values unless a choice is pending. */
export function assertConfirmedMetricHistory(state){
 const {metrics,lastYear}=state.observation;
 assert.equal(metrics.ruleId,'civilization-metrics-v1');assert.equal(metrics.firstYear,0);
 assert.equal(metrics.values.length,lastYear+1);
 if(!state.pending)assert.deepEqual(metrics.values.at(-1),[state.food,state.cohesion,state.knowledge,state.culture]);
}
