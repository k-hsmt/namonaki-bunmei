import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseAutomatically, createCivilization, step } from '../dist/story/engine.js';
import { createSettlementHistory, siteAt, updateSettlements } from '../dist/story/settlement-history.js';
import { createSociety, updateSociety } from '../dist/story/society.js';
import { snapshotAt } from '../dist/scene/model.js';
import { observationAt } from '../dist/story/observations.js';

const recorder = records => event => {
  const id = String(records.length + 1);
  records.push({ id, ...event });
  return id;
};

test('population alone leaves a site a village, and trade and facilities permit a city', () => {
  const history = createSettlementHistory([18000, 18000, 18000], 0);
  const society = createSociety();
  const records = [];
  for (let year = 1; year <= 250; year++) {
    updateSettlements(history, society, [0, 8, 0].map((tradeYears, i) => ({
      population: i===2?1900:18000, coverage: 1, tradeYears, shortageYears: 0,
    })), year, recorder(records));
  }
  assert.equal(siteAt(history, 0, 250).scale, 1);
  assert.equal(siteAt(history, 1, 250).scale, 3);
  assert.equal(siteAt(history, 2, 250).scale, 1);
  const city = history[1].changes.findIndex(change => change.view.scale === 3);
  const cityYear=history[1].changes[city].year;
  assert.deepEqual(siteAt(history,1,cityYear).buildings, siteAt(history,1,cityYear-1).buildings);
});

test('damage, abandonment and reuse retain the plot, building date and older views', () => {
  const history = createSettlementHistory([18000, 500, 500], 0);
  const society = createSociety();
  const records = [];
  const update = (year, population, coverage, hazard) => updateSettlements(history, society,
    [0, 1, 2].map(() => ({ population, coverage, tradeYears: 8, shortageYears: coverage < .75 ? 10 : 0, hazard })), year, recorder(records));
  for (let year = 1; year <= 180; year++) update(year, 18000, 1);
  const prior = structuredClone(siteAt(history, 0, 180));
  assert.equal(prior.scale, 3);
  update(181, 18000, 1, { id: 'earthquake', kind: 'earthquake' });
  assert.equal(siteAt(history, 0, 181).buildings[0].condition, 'damaged');
  for (let year = 182; year <= 205; year++) update(year, 18000, .5);
  assert.equal(siteAt(history, 0, 204).scale, 2);
  assert.equal(siteAt(history, 0, 205).buildings[0].condition, 'ruined');
  update(206, 0, 1);
  assert.equal(siteAt(history, 0, 206).inhabited, false);
  assert.ok(siteAt(history, 0, 206).buildings.length > 0);
  for (let year = 207; year <= 230; year++) update(year, 500, 1);
  const restored = siteAt(history, 0, 230).buildings[0];
  for (const key of ['id', 'builtYear', 'x', 'y']) assert.equal(restored[key], prior.buildings[0][key]);
  assert.equal(restored.condition, 'intact');
  assert.equal(restored.reused, true);
  assert.deepEqual(siteAt(history, 0, 180), prior);
});

test('separation passes on portable practices, retains origins and supports reunification', () => {
  const society = createSociety();
  const records = [];
  const people = [2500, 1500, 1000];
  updateSociety(society, people, [1, 1, 1], 70, 0,
    { archive: 'first-archive', granary: 'first-granary' }, recorder(records));
  for (let year = 1; year <= 8; year++) {
    updateSociety(society, people, [1, .7, 1], 45, year, {}, recorder(records));
  }
  const hills = society.sites[1];
  assert.equal(hills.communityId, 'community-hill-side-8');
  assert.deepEqual(hills.practices.map(p => [p.kind, p.originId]), [['archive','first-archive']]);
  assert.ok(society.sites[0].practices.some(p => p.kind === 'granary' && p.active));
  for (let year = 9; year <= 15; year++) {
    updateSociety(society, people, [1, .7, 1], 45, year, {}, recorder(records));
  }
  assert.equal(hills.practices[0].active, false);
  for (let year = 16; year <= 35; year++) {
    updateSociety(society, people, [1, 1, 1], 75, year, {}, recorder(records));
  }
  assert.equal(hills.communityId, 'founding-community');
  assert.equal(hills.practices[0].originId, 'first-archive');
});

test('historical buildings, affiliation and population match after another millennium and reloading', () => {
  const state = createCivilization(82);
  const advanceTo = year => {
    while (state.year < year) { step(state); if(state.pending)chooseAutomatically(state); }
  };
  advanceTo(500);
  const expected = [0, 1, 2].map(i => snapshotAt(state, 500, i));
  const observed = observationAt(state.observation, 500);
  const sites = [0,1,2].map(i=>siteAt(state.observation.sites,i,500));
  advanceTo(1500);
  const restored = JSON.parse(JSON.stringify(state));
  assert.deepEqual([0, 1, 2].map(i => snapshotAt(restored, 500, i)), expected);
  assert.deepEqual(observationAt(restored.observation, 500), observed);
  assert.deepEqual([0,1,2].map(i=>siteAt(restored.observation.sites,i,500)),sites);
});
