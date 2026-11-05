import { SeededRng } from "./rng.js";
import { climateRatio, harvestFor, neighbors, populationByCiv, numberOfSettlements } from "./model.js";
import type { Region, WorldState, HistoryEvent, EventType } from "./model.js";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function addEvent(
  state: WorldState, kind: EventType, civId: number | null, regionId: number | null,
  headline: string, explanation: string
): void {
  const event: HistoryEvent = {
    id: `${state.year}-${state.history.length}`, year: state.year,
    kind, civId, regionId, headline, explanation
  };
  state.history.push(event);
}

function updateWeather(state: WorldState, rng: SeededRng): void {
  // Persistent global and regional anomalies make consecutive dry years possible.
  state.climateMemory = clamp(0.86 * state.climateMemory + 0.14 * rng.normal() * 0.23, -0.30, 0.30);
  for (const r of state.regions) {
    if (r.biome === "ocean") continue;
    // A regional anomaly is stored separately; not an independent annual dice roll.
    const oldMemory = regionClimateMemory(r);
    const localMemory = clamp(0.68 * oldMemory + 0.32 * rng.normal() * 0.40, -0.4, 0.4);
    setRegionClimateMemory(r, localMemory);
    r.annualRain = clamp(r.averageRain + state.climateMemory + localMemory, 0.035, 1);
  }
}

// Weather memory lives alongside the persistent tile state; typed explicitly in model.
function regionClimateMemory(r: Region): number { return r.weatherMemory; }
function setRegionClimateMemory(r: Region, n: number): void { r.weatherMemory = n; }

function updatePopulationAndFood(state: WorldState): void {
  for (const r of state.regions) {
    if (r.owner === null) continue;
    const civ = state.civilizations[r.owner];
    if (!civ?.alive) continue;

    const initialPopulation = r.population;
    const harvest = harvestFor(r);
    r.annualHarvest = harvest;
    const available = harvest + r.foodReserve;
    const shortfall = initialPopulation <= 0 ? 0 : clamp((initialPopulation - available) / initialPopulation, 0, 1);
    r.foodReserve = clamp(available - initialPopulation, 0, initialPopulation * 1.8);

    // Baseline +0.6% annual net growth under enough food, with harsher losses in famine.
    // Fictional parameters; NOT a calibrated estimate of real historical demography.
    const netGrowth = 0.006 * (1 - shortfall) - 0.27 * shortfall;
    r.population = Math.max(0, initialPopulation * (1 + netGrowth));

    const ratio = r.annualRain / Math.max(0.1, r.averageRain);
    if (ratio < 0.69) r.dryYears++;
    else {
      if (r.dryYears >= 4 && state.year - civ.lastRecoveryRecord >= 30) {
        civ.lastRecoveryRecord = state.year;
        addEvent(state, "recovery", r.owner, r.id,
          `${civ.name}の地で長い乾燥が終わる`,
          `${r.dryYears}年間続いた少雨が収束した。農作物の生産はしだいに持ち直す見込み。`);
      }
      r.dryYears = 0;
    }
    if (r.dryYears === 4 && state.year - civ.lastDroughtRecord >= 30) {
      civ.lastDroughtRecord = state.year;
      addEvent(state, "drought", r.owner, r.id,
        `${civ.name}の居住地で干ばつが長期化`,
        `平年より少ない雨が3年続いた。現在の雨量は平年の${Math.round(ratio * 100)}%。`);
    }
    if (shortfall > 0.24 && r.population >= 8 && state.year - civ.lastShortageRecord >= 24) {
      civ.lastShortageRecord = state.year;
      r.lastShortageEvent = state.year;
      addEvent(state, "shortage", r.owner, r.id,
        `${civ.name}の集落で食糧不足が発生`,
        `収穫と備蓄では必要な食糧をまかなえず、需要の${Math.round(shortfall * 100)}%が不足。降雨は平年比${Math.round(ratio * 100)}%。`);
    }
  }
}

function spreadSettlements(state: WorldState, rng: SeededRng): void {
  // Each source can found at most one new settlement in a year.
  // Disallow conflict: later stages will simulate diplomacy and war separately.
  const sources = state.regions.filter(r => r.owner !== null && r.population > 2);
  for (const r of sources) {
    const owner = r.owner;
    if (owner === null) continue;
    const capacity = r.baseFoodYield;
    const pressure = r.population / Math.max(1, capacity);
    if (pressure < 0.68 || rng.next() > clamp((pressure - 0.5) * 0.7, 0.03, 0.34)) continue;
    const open = neighbors(r.id, state.width, state.height)
      .map(id => state.regions[id])
      .filter((n): n is Region => !!n && n.owner === null && n.baseFoodYield >= 3.2);
    if (!open.length) continue;
    // A better food environment is attractive, but geography and chance both matter.
    const ranked = open.map(n => ({ n, score: n.baseFoodYield * (0.45 + rng.next()) }))
      .sort((a, b) => b.score - a.score);
    const target = ranked[0]?.n;
    if (!target) continue;
    const migrants = Math.min(r.population * 0.13, Math.max(0.45, (r.population - capacity * 0.5) * 0.21));
    if (migrants < 0.38) continue;
    const share = migrants / r.population;
    const reserves = r.foodReserve * share;
    r.population -= migrants;
    r.foodReserve -= reserves;
    target.owner = owner;
    target.population = migrants;
    target.foodReserve = reserves;
    const civ = state.civilizations[owner];
    if (civ) {
      addEvent(state, "settlement", owner, target.id,
        `${civ.name}の人々が新しい土地に定住`,
        `人口増加と土地の制約を背景に、隣接する${target.biome === "forest" ? "森林" : target.biome === "mountain" ? "山岳" : target.biome === "steppe" ? "草原" : target.biome === "desert" ? "乾燥" : "平野"}地域へ移り住んだ。`);
    }
  }
}

function checkCivilizations(state: WorldState): void {
  const pops = populationByCiv(state);
  for (const civ of state.civilizations) {
    const pop = pops[civ.id] ?? 0;
    if (civ.alive && pop < 0.12) {
      civ.alive = false;
      for (const r of state.regions) {
        if (r.owner === civ.id) {
          r.owner = null; r.population = 0; r.foodReserve = 0; r.annualHarvest = 0;
        }
      }
      addEvent(state, "extinction", civ.id, civ.origin,
        `${civ.name}の共同体が消滅`,
        `居住人口が維持できなくなり、この共同体の定住地は失われた。`);
      continue;
    }
    if (!civ.alive) continue;
    const regions = state.regions.filter(r => r.owner === civ.id).length;
    if (regions >= civ.nextMilestone) {
      addEvent(state, "growth", civ.id, null,
        `${civ.name}の居住域が${regions}地域に広がる`,
        `複数の集落が成立し、人々の生活圏が広がった。この拡大は「優れた文明」を意味するものではない。`);
      civ.nextMilestone = civ.nextMilestone < 5 ? 5 : civ.nextMilestone * 2;
    }
  }
}

/** Advance one year; all random state is persisted. Mutates and returns the supplied WorldState. */
export function stepYear(state: WorldState): WorldState {
  if (state.version !== 1) throw new Error("Unsupported world version");
  const rng = new SeededRng(state.rngState);
  state.year++;
  updateWeather(state, rng);
  updatePopulationAndFood(state);
  spreadSettlements(state, rng);
  checkCivilizations(state);
  const pops = populationByCiv(state);
  const land = state.regions.filter(r => r.biome !== "ocean");
  state.census.push({
    year: state.year,
    civPopulations: pops,
    totalPopulation: pops.reduce((sum, x) => sum + x, 0),
    settledRegions: numberOfSettlements(state),
    meanRain: land.reduce((sum, r) => sum + r.annualRain, 0) / Math.max(1, land.length)
  });
  state.rngState = rng.state;
  return state;
}

export function advance(state: WorldState, years: number): WorldState {
  if (!Number.isInteger(years) || years < 0 || years > 10000) throw new Error("years must be in 0..10000");
  for (let i = 0; i < years; i++) stepYear(state);
  return state;
}

/** Sample a stable summary for analysis, not a win/score metric. */
export function describe(state: WorldState) {
  const pops = populationByCiv(state);
  const byCiv = state.civilizations.map(c => ({
    name: c.name, populationThousands: Number((pops[c.id] ?? 0).toFixed(2)),
    regions: state.regions.filter(r => r.owner === c.id).length, alive: c.alive
  }));
  return {
    year: state.year,
    totalPopulationThousands: Number(pops.reduce((a, b) => a + b, 0).toFixed(2)),
    inhabitedRegions: numberOfSettlements(state),
    historyEvents: state.history.length,
    civilizations: byCiv
  };
}
