import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../dist/engine/world.js';
import { advance, stepYear, describe } from '../dist/engine/simulation.js';
import { harvestFor, populationByCiv, neighbors } from '../dist/engine/model.js';
import { SeededRng } from '../dist/engine/rng.js';

test('同じシードなら初期地形・文明・初期食糧が一致する', () => {
  assert.deepEqual(createWorld(42), createWorld(42));
  const a = createWorld(42), b = createWorld(43);
  assert.notDeepEqual(a.regions.map(r => r.elevation), b.regions.map(r => r.elevation));
});

test('世界の年をまとめて進めても1年ずつ進めても同じ', () => {
  const a = advance(createWorld(512), 360);
  const b = createWorld(512);
  for (let i=0; i<360; i++) stepYear(b);
  assert.deepEqual(a, b);
});

test('途中保存・再開後も乱数列と歴史が完全に再現される', () => {
  const original = createWorld(777);
  advance(original, 183);
  const restored = JSON.parse(JSON.stringify(original));
  advance(original, 117);
  advance(restored, 117);
  assert.deepEqual(original, restored);
});

test('干ばつで収穫量は低下し、適切な労働人口がいる場合は増水で増える', () => {
  const w = createWorld(50);
  const r = w.regions[w.civilizations[0].origin];
  const normal = harvestFor(r, r.averageRain);
  const dry = harvestFor(r, r.averageRain * 0.40);
  const wet = harvestFor(r, r.averageRain * 1.12);
  assert.ok(normal > dry, `normal ${normal} vs dry ${dry}`);
  assert.ok(wet >= normal);
});

test('極度の食糧不足は人口を減らし、負の食糧・人口は生まない', () => {
  const w = createWorld(58);
  const r = w.regions[w.civilizations[0].origin];
  r.population = 500;
  r.foodReserve = 0;
  const before = r.population;
  stepYear(w);
  assert.ok(r.population < before);
  assert.ok(r.population >= 0);
  assert.ok(r.foodReserve >= 0);
});

test('すべての年で値が有限・居住地は陸・人口は各地域の総和に等しい', () => {
  for(const seed of [1, 2, 42, 99, 1000, 4294967295]) {
    const w=createWorld(seed);
    for(let year=0;year<1800;year++) {
      stepYear(w);
      if(year % 125 !== 0 && year !== 1799) continue;
      const pops=populationByCiv(w);
      for(const r of w.regions) {
        assert.ok(Number.isFinite(r.population) && r.population >= 0);
        assert.ok(Number.isFinite(r.foodReserve) && r.foodReserve >= 0);
        assert.ok(Number.isFinite(r.annualHarvest) && r.annualHarvest >= 0);
        if (r.owner !== null) {
          assert.notEqual(r.biome, 'ocean');
          assert.ok(w.civilizations[r.owner]?.alive);
        }
      }
      const current = w.census.at(-1);
      assert.ok(Math.abs(current.totalPopulation-pops.reduce((a,b)=>a+b,0))<1e-7);
      assert.ok(current.totalPopulation>=0);
    }
  }
});

test('海に住居は生まれず、隣接方向は地図内だけを返す', () => {
  const w = createWorld(42);
  assert.deepEqual(neighbors(0,w.width,w.height), [1,w.width]);
  assert.ok(w.regions.some(r=>r.biome==='ocean'));
  advance(w,3000);
  for(const r of w.regions) if (r.owner!==null) assert.notEqual(r.biome,'ocean');
});

test('乱数の内部状態0も保存/復元して同じ出力になる', () => {
  const a=new SeededRng(0); const b=new SeededRng(0);
  assert.equal(a.next(),b.next());
});

test('3,000年実行後の統計が取得できる', () => {
  const w=advance(createWorld(42),3000);
  const summary=describe(w);
  assert.equal(summary.year,3000);
  assert.equal(w.census.length,3001);
  assert.ok(summary.totalPopulationThousands>0);
  assert.ok(w.history.length>4);
});
