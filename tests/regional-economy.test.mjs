import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { chooseAutomatically, createCivilization, migrateCivilization, step } from '../dist/story/engine.js';
import { createRegionalEconomy, updateRegionalEconomy } from '../dist/story/regional-economy.js';
import { observationAt } from '../dist/story/observations.js';
import { populationTotal } from '../dist/story/population.js';

function run(world, year, factors, blocked = []) {
  const total = populationTotal(world.people);
  updateRegionalEconomy(world.economy, world.people, year, {
    harvestFactors: factors,
    blockedRegions: new Set(blocked),
    disruptionId: blocked.length ? 'flood-record' : undefined,
  }, event => {
    const id = String(world.records.length + 1);
    world.records.push({ id, ...event });
    return id;
  });
  assert.equal(populationTotal(world.people), total);
  assert.ok(world.people.every(count => Number.isSafeInteger(count) && count >= 0));
}

test('trade improves food coverage, maintenance consumes reserves and expands next-year capacity', () => {
  const world = { economy: createRegionalEconomy(), people: [1000, 1000, 1000, 0], records: [] };
  for (let year = 1; year < 20; year++) run(world, year, [1.4, .75, 1]);
  assert.equal(world.economy.routes[0].agreementRecord, null);
  const withoutAgreement = structuredClone(world);
  withoutAgreement.economy.routes[0].tradeYears = [];
  run(world, 20, [1.4, 1.15, 1]);
  run(withoutAgreement, 20, [1.4, 1.15, 1]);
  const agreement = world.economy.routes[0].agreementRecord;
  assert.ok(agreement);
  // The deposit cap can hide maintenance in large surpluses. The extra
  // next-year capacity is observable under a deficit larger than the old cap.
  for (const state of [world, withoutAgreement]) state.economy.districts[1].reserve = 0;
  run(world, 21, [1.4, .7, 1]);
  run(withoutAgreement, 21, [1.4, .7, 1]);
  assert.ok(world.economy.districts[1].importShare > withoutAgreement.economy.districts[1].importShare);
  assert.ok(world.economy.districts[1].coverage.at(-1) > withoutAgreement.economy.districts[1].coverage.at(-1));

  const maintained = structuredClone(world);
  const ordinary = structuredClone(world);
  ordinary.economy.routes[0].agreementRecord = null;
  ordinary.economy.routes[0].tradeYears = [];
  for (const state of [maintained, ordinary]) state.economy.districts[1].reserve = 0;
  run(maintained, 22, [1.4, .94, 1]);
  run(ordinary, 22, [1.4, .94, 1]);
  assert.ok(maintained.economy.districts[1].reserve < ordinary.economy.districts[1].reserve);

  const open = structuredClone(maintained);
  const cut = structuredClone(maintained);
  for (let year = 23; year <= 27; year++) {
    run(open, year, [1.4, .79, 1]);
    run(cut, year, [1.4, .79, 1], ['hills']);
    if (year === 26) assert.equal(cut.economy.routes[0].agreementRecord, agreement);
  }
  assert.equal(cut.economy.districts[1].importShare, 0);
  assert.ok(cut.economy.districts[1].coverage.at(-1) < open.economy.districts[1].coverage.at(-1));
  assert.ok(cut.people[1] < open.people[1]);
  assert.equal(cut.economy.routes[0].agreementRecord, null);
  assert.equal(cut.economy.routes[0].capacityBonus, false);
  assert.equal(cut.economy.routes[0].originRecord, agreement);
  const closure = cut.records.find(event => event.relatedIds?.includes('flood-record'));
  assert.ok(closure);
  const suspended = cut.records.find(event => event.title.endsWith('共同管理が休止する'));
  assert.deepEqual(suspended.relatedIds, [agreement, closure.id]);
});

test('legacy settlement is gradual and earlier observations remain unlocated', () => {
  const legacy = JSON.parse(readFileSync(new URL('./fixtures/v05-seed42-year473.json', import.meta.url), 'utf8'));
  const state = migrateCivilization(legacy);
  const year = state.year;
  for (let i = 0; i < 4; i++) {
    step(state);
    if (state.pending) chooseAutomatically(state);
    assert.equal(state.observation.people.slice(0, 3).reduce((a, b) => a + b, 0), 0);
  }
  const first = observationAt(state.observation, year + 1);
  const original = structuredClone(first);
  for (let i = 0; i < 40 && !state.history.some(event => event.tag === '地域' && event.title.includes('新たに定住')); i++) {
    const before = state.observation.people[3];
    step(state);
    if (state.pending) chooseAutomatically(state);
    const current = state.observation.people.slice(0, 3).reduce((a, b) => a + b, 0);
    assert.ok(current <= Math.min(120, Math.floor(before * .01)));
  }
  assert.ok(state.history.some(event => event.tag === '地域' && event.title.includes('新たに定住')));
  assert.deepEqual(observationAt(state.observation, year + 1), original);
});

test('regional state is serialized and the confirmed-year update only runs once per year', () => {
  const world = createCivilization(7);
  while (!world.pending) step(world);
  const copy = JSON.parse(JSON.stringify(world));
  const prior = structuredClone(world.economy);
  step(world);
  assert.deepEqual(world.economy, prior);
  chooseAutomatically(world);
  chooseAutomatically(copy);
  assert.deepEqual(world, copy);
  for (let year = 0; year < 500; year++) {
    for (const state of [world, copy]) {
      step(state);
      if (state.pending) chooseAutomatically(state);
    }
  }
  assert.deepEqual(world, copy);
});
