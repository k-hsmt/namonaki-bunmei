import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { chooseAutomatically, createCivilization, step } from '../dist/story/engine.js';
import { observationAt } from '../dist/story/observations.js';
import { snapshotAt } from '../dist/scene/model.js';
import { siteAt } from '../dist/story/settlement-history.js';

const seeds = [7, 42, 82, 123, 731];
const time = fn => {
  const start = performance.now();
  const value = fn();
  return [value, Math.round((performance.now() - start) * 100) / 100];
};

for (const seed of seeds) {
  const state = createCivilization(seed);
  const scene = (world, year) => [0, 1, 2].map(i => snapshotAt(world, year, i));
  let original;
  let oldObservation;
  for (const horizon of [2000, 10000]) {
    const started = performance.now();
    while (state.year < horizon) {
      step(state);
      if (state.pending) chooseAutomatically(state);
      assert.equal(state.observation.people.reduce((sum, count) => sum + count, 0), state.population);
      assert.ok(state.observation.people.every(count => Number.isSafeInteger(count) && count >= 0));
      if (state.year === 500) {
        original = scene(state, 500);
        oldObservation = observationAt(state.observation, 500);
      }
    }
    const simulationMs = Math.round(performance.now() - started);
    const [json, saveMs] = time(() => JSON.stringify(state));
    const [loaded, loadMs] = time(() => JSON.parse(json));
    assert.deepEqual(scene(loaded, 500), original);
    assert.deepEqual(observationAt(loaded.observation, 500), oldObservation);
    const [, switchMs] = time(() => scene(loaded, Math.floor(horizon / 2)));

    let center = null;
    let centerChanges = 0;
    let changedWindows = 0;
    let priorViews;
    for (let year = 0; year <= horizon; year += 100) {
      const residents = observationAt(state.observation, year).residents.slice(0, 3);
      const leader = residents.reduce((best, row) => row.population > best.population ? row : best).regionId;
      if (center !== null && center !== leader) centerChanges++;
      center = leader;
      const views = [0, 1, 2].map(i => siteAt(state.observation.sites, i, year));
      if (priorViews) {
        for (let i = 0; i < views.length; i++) {
          const signature = view => JSON.stringify([
            view.scale, view.communityId, view.practices, view.buildings.map(b => [b.id, b.kind, b.condition]),
          ]);
          if (signature(views[i]) !== signature(priorViews[i])) changedWindows++;
        }
      }
      priorViews = views;
    }
    const history = state.history;
    const count = pattern => history.filter(event => event.tag === '地域' && pattern.test(event.title)).length;
    let repeated = 0;
    for (let i = 1; i < history.length; i++) {
      const a = history[i - 1];
      const b = history[i];
      if ((a.kind ?? a.title) === (b.kind ?? b.title)) repeated++;
    }
    const sites = state.observation.sites.map(site => ({
      end: site.view.scale,
      longestVillage: (() => {
        let start;
        let longest = 0;
        for (const change of site.changes) {
          if (change.view.scale === 1 && change.view.inhabited) start ??= change.year;
          else if (start !== undefined) {
            longest = Math.max(longest, change.year - start);
            start = undefined;
          }
        }
        return start === undefined ? longest : Math.max(longest, horizon - start + 1);
      })(),
      max: site.changes.reduce((maximum, change) => Math.max(maximum, change.view.scale), 0),
      up: site.changes.filter((change, i, all) => i > 0 && change.view.scale > all[i - 1].view.scale).length,
      down: site.changes.filter((change, i, all) => i > 0 && change.view.scale < all[i - 1].view.scale).length,
    }));
    console.log(JSON.stringify({
      seed, horizon, sites, centerChanges, changedWindows,
      institutions: { formed: count(/根づく$/), inherited: count(/受け継ぐ$/), lost: count(/途絶える$/) - count(/往来が途絶える$/) },
      split: count(/別の寄り合いを持つ$/), reunified: count(/再び共同の寄り合いに加わる$/),
      damage: count(/損傷する$/), repaired: count(/修繕される$/), reuse: count(/再利用される$/),
      repeated, chronicle: history.length,
      bytes: Buffer.byteLength(json), simulationMs, saveMs, loadMs, switchMs,
    }));
  }
}
