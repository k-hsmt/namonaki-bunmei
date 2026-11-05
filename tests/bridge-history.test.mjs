import assert from 'node:assert/strict';
import test from 'node:test';
import { createCivilization, step, chooseAutomatically } from '../dist/story/engine.js';
import { siteAt } from '../dist/story/settlement-history.js';

test('new bridge construction and repair articles describe the recorded bridge in that year', () => {
  const state = createCivilization(42);
  while(state.year < 2000) {
    step(state);
    if(state.pending)chooseAutomatically(state);
  }
  assert.equal(state.history.some(event=>event.title==='古い橋が修繕される'),false);
  const built = state.history.filter(event=>event.kind==='building-built'&&event.title.includes('橋'));
  assert.ok(built.length>0);
  for(const event of state.history.filter(event=>event.buildingId && event.title.includes('橋'))) {
    const bridge=siteAt(state.observation.sites,0,event.year).buildings.find(b=>b.id===event.buildingId);
    assert.ok(bridge);
    assert.equal(bridge.kind,'bridge');
    assert.equal(bridge.recordId,event.id);
    assert.ok(bridge.builtYear<=event.year);
    const expected = {
      'building-built':'intact','building-repaired':'intact','building-reused':'intact',
      'building-damaged':'damaged','building-abandoned':'ruined',
    };
    assert.equal(bridge.condition,expected[event.kind]);
    if(event.kind==='building-repaired'){
      const prior=siteAt(state.observation.sites,0,event.year-1).buildings.find(b=>b.id===bridge.id);
      assert.equal(prior.condition,'damaged');
    }
  }
});
