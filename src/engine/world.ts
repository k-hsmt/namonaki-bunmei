import { SeededRng, valueNoise } from "./rng.js";
import { DEFAULT_WIDTH, DEFAULT_HEIGHT, neighbors } from "./model.js";
import type { Biome, WorldState, Region } from "./model.js";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function biomeFor(elevation: number, rain: number, temp: number): Biome {
  if (elevation < 0.375) return "ocean";
  if (elevation > 0.8) return "mountain";
  if (rain < 0.27) return "desert";
  if (rain < 0.40) return "steppe";
  if (rain > 0.66 && temp > 0.3) return "forest";
  return "grassland";
}

function baseYield(r: Region): number {
  if (r.biome === "ocean") return 0;
  const biomeFactor: Record<Biome, number> = {
    ocean: 0, mountain: 0.18, forest: 0.72, grassland: 1.0, steppe: 0.48, desert: 0.11
  };
  const tempFactor = clamp((r.averageTemp - 0.12) / 0.36, 0.3, 1);
  const waterFactor = clamp((r.averageRain - 0.10) / 0.45, 0.35, 1.15);
  return (8 + 34 * biomeFactor[r.biome]) * tempFactor * waterFactor * (r.river ? 1.32 : 1);
}

/** Deterministic fictional topography. The rainfall and yields are intentionally stylized, not calibrated historical estimates. */
export function createWorld(seed: number, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT): WorldState {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 6) throw new Error("Invalid world dimensions");
  const normalizedSeed = (seed >>> 0) || 1;
  const rng = new SeededRng(normalizedSeed);
  const regions: Region[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x - (width - 1) / 2) / (width * 0.5);
      const ny = (y - (height - 1) / 2) / (height * 0.5);
      const radius = Math.sqrt(nx * nx * 0.87 + ny * ny * 1.17);
      const continentalNoise = valueNoise(x / 4.5 + 4, y / 4.5 + 13, normalizedSeed + 7);
      const detail = valueNoise(x / 2.0 + 3, y / 2.0 + 8, normalizedSeed + 5);
      const elevation = clamp(0.93 - 0.57 * radius + 0.37 * (continentalNoise - 0.5) + 0.16 * (detail - 0.5), 0, 1);
      const humidityNoise = valueNoise(x / 5 + 20, y / 4 + 9, normalizedSeed + 101);
      const rain = clamp(0.55 + 0.43 * (humidityNoise - 0.5) - 0.11 * Math.max(0, elevation - 0.65) + 0.09 * (y / height - 0.5), 0.13, 0.93);
      const temp = clamp(0.81 - 0.41 * Math.abs(ny) - 0.34 * Math.max(0, elevation - 0.37), 0.08, 0.95);
      const biome = biomeFor(elevation, rain, temp);
      regions.push({
        id: y * width + x, x, y, elevation, averageRain: rain, averageTemp: temp, biome,
        river: false, baseFoodYield: 0, owner: null, population: 0, foodReserve: 0,
        annualHarvest: 0, annualRain: rain, weatherMemory: 0, dryYears: 0, lastShortageEvent: -100
      });
    }
  }

  // Approximate drainage via steepest neighboring descent and flow accumulation.
  // Closed basins are deliberately allowed; do not interpret as full hydrology.
  const flow = regions.map(r => r.biome === "ocean" ? 0 : 0.5 + r.averageRain);
  const sorted = [...regions].filter(r => r.biome !== "ocean").sort((a, b) => b.elevation - a.elevation);
  for (const r of sorted) {
    let lower: Region | undefined;
    for (const id of neighbors(r.id, width, height)) {
      const n = regions[id];
      if (n && n.elevation < r.elevation - 0.004 && (!lower || n.elevation < lower.elevation)) lower = n;
    }
    if (lower) flow[lower.id] = (flow[lower.id] ?? 0) + (flow[r.id] ?? 0);
  }
  for (const r of regions) {
    r.river = r.biome !== "ocean" && (flow[r.id] ?? 0) >= 5.0 && r.elevation < 0.76;
    r.baseFoodYield = baseYield(r);
  }

  const civNames = ["アルヴァ", "セムリ", "ノルテ", "リュアン"];
  const civColors = ["#8eb6ad", "#dbaf77", "#9da6d0", "#cf97a4"];
  const candidates = regions.filter(r => r.biome !== "ocean" && r.biome !== "mountain" && r.baseFoodYield > 17);
  // Score with random preference, not highest yields only: starting situations vary.
  const ranked = candidates.map(r => ({ r, s: rng.next() * 0.84 + r.baseFoodYield / 160 }))
    .sort((a, b) => b.s - a.s).map(v => v.r);
  const chosen: Region[] = [];
  const distance = (a: Region, b: Region) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  for (const minGap of [7, 5, 3, 0]) {
    for (const r of ranked) {
      if (chosen.length >= 4) break;
      if (!chosen.includes(r) && chosen.every(c => distance(c, r) >= minGap)) chosen.push(r);
    }
    if (chosen.length >= 4) break;
  }
  if (chosen.length < 2) throw new Error("World generation did not produce enough habitable regions");

  const civilizations = chosen.map((r, i) => {
    r.owner = i;
    r.population = rng.between(4.5, 8.5);
    r.foodReserve = r.population * 0.8;
    return { id: i, name: civNames[i] ?? `文明${i + 1}`, color: civColors[i] ?? "#aaaaaa", founded: 0, origin: r.id, alive: true, nextMilestone: 2, lastDroughtRecord: -100, lastRecoveryRecord: -100, lastShortageRecord: -100 };
  });
  const history = civilizations.map((c, i) => ({
    id: `0-foundation-${i}`, year: 0, kind: "foundation" as const, civId: c.id, regionId: c.origin,
    headline: `${c.name}の人々が定住を始める`,
    explanation: `気候と土地の条件に恵まれた地域に、小さな共同体が生まれた。`
  }));
  const state: WorldState = {
    version: 1, seed: normalizedSeed, rngState: rng.state, year: 0,
    width, height, climateMemory: 0, regions, civilizations, history, census: []
  };
  state.census.push({
    year: 0,
    civPopulations: civilizations.map(c => regions[c.origin]?.population ?? 0),
    totalPopulation: chosen.reduce((s, r) => s + r.population, 0),
    settledRegions: chosen.length,
    meanRain: regions.filter(r => r.biome !== "ocean").reduce((s, r) => s + r.averageRain, 0) /
      Math.max(1, regions.filter(r => r.biome !== "ocean").length)
  });
  return state;
}
