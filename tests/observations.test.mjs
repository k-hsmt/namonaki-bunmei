import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { choose, chooseAutomatically, createCivilization, lastObservedYear, migrateCivilization, step } from '../dist/story/engine.js';
import { observationAt } from '../dist/story/observations.js';
import { populationAt, snapshotAt } from '../dist/scene/model.js';

const loadFixture = name => JSON.parse(readFileSync(new URL('./fixtures/'+name+'.json', import.meta.url), 'utf8'));
const reload = state => migrateCivilization(JSON.parse(JSON.stringify(state)));

function playTo(state, targetYear) {
  while (state.year < targetYear) {
    step(state);
    if (state.pending) chooseAutomatically(state);
    const observation = observationAt(state.observation, state.year);
    assert.equal(observation.population, state.population);
    assert.equal(observation.residents.reduce((sum, resident) => sum + resident.population, 0), state.population);
  }
}

test('confirmed non-sample years and checkpoints survive later play and save restoration', () => {
  const world = createCivilization(42);
  playTo(world, 473);
  const scene473 = snapshotAt(world, 473);
  assert.equal(scene473.population, world.population);
  playTo(world, 500);
  const observation500 = observationAt(world.observation, 500);
  const scene500 = snapshotAt(world, 500);
  assert.equal(observation500.residents.filter(row => row.settlementId && row.population > 0).length, 3);
  playTo(world, 1500);
  const restored = reload(world);
  for (const state of [world, restored]) {
    assert.deepEqual(snapshotAt(state, 473), scene473);
    assert.deepEqual(snapshotAt(state, 500), scene500);
    assert.deepEqual(observationAt(state.observation, 500), observation500);
  }
});

test('saving a pending choice commits that year once after resuming', () => {
  const world = createCivilization(42);
  let option;
  while (world.year < 2000) {
    step(world);
    if (!world.pending) continue;
    option = world.pending.options.findIndex(choice => choice.impacts.population);
    if (option >= 0) break;
    chooseAutomatically(world);
  }
  assert.ok(world.pending && option >= 0);
  const year = world.year;
  assert.equal(lastObservedYear(world), year - 1);
  assert.equal(observationAt(world.observation, year), null);
  assert.throws(() => snapshotAt(world, year));
  const prior = snapshotAt(world, year - 1);
  const before = world.population;
  const restored = reload(world);
  choose(world, option);
  choose(restored, option);
  assert.notEqual(world.population, before);
  assert.deepEqual(restored, world);
  assert.equal(lastObservedYear(world), year);
  assert.equal(observationAt(world.observation, year).population, world.population);
  assert.throws(() => choose(world, option));
  step(world);
  assert.deepEqual(snapshotAt(world, year - 1), prior);
});

test('legacy migration leaves old scenes stable and the entire legacy population unlocated', () => {
  const old = loadFixture('v05-seed42-year473');
  const total = old.population;
  assert.ok(total > 70000);
  const scenes = [465, 472, 473].map(year => snapshotAt(old, year));
  const world = reload(old);
  assert.equal(old.version, 2);
  assert.equal(world.version, 3);
  assert.equal(world.population, total);
  assert.deepEqual(world.observation.people, [0, 0, 0, total]);
  assert.equal(observationAt(world.observation, 473), null);
  assert.deepEqual(world.history, old.history);
  assert.deepEqual(world.memory, old.memory);
  playTo(world, 800);
  const restored = reload(world);
  assert.equal(populationAt(restored, 473), total);
  for (const scene of scenes) assert.deepEqual(snapshotAt(restored, scene.year), scene);
  const first = observationAt(restored.observation, 474);
  assert.equal(first.residents.find(row => !row.settlementId).population, first.population);
});

test('a pending legacy choice survives migration without rewriting the migration-year scene', () => {
  const old = loadFixture('v05-seed82-pending');
  assert.ok(old.pending);
  const scene = snapshotAt(old, old.year);
  const world = reload(old);
  assert.deepEqual(world.pending, old.pending);
  choose(world, 0);
  assert.equal(observationAt(world.observation, old.year), null);
  assert.deepEqual(snapshotAt(world, old.year), scene);
  step(world);
  assert.ok(observationAt(world.observation, old.year + 1));
  assert.deepEqual(snapshotAt(reload(world), old.year), scene);
});
