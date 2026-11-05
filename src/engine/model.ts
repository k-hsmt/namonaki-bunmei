export type Biome = "ocean" | "mountain" | "forest" | "grassland" | "steppe" | "desert";
export type CivId = number;
export type EventType = "foundation" | "settlement" | "growth" | "shortage" | "drought" | "recovery" | "extinction";

/** Population is in 1,000 persons. Food is 1,000 person-years. */
export interface Region {
  id: number;
  x: number;
  y: number;
  elevation: number; // unitless 0..1, fictional topography
  averageRain: number; // unitless 0..1
  averageTemp: number; // unitless 0..1
  biome: Biome;
  river: boolean;
  baseFoodYield: number; // thousand person-years / yr, optimal labor & average weather
  owner: CivId | null;
  population: number;
  foodReserve: number;
  annualHarvest: number;
  annualRain: number;
  weatherMemory: number; // persistent local climate anomaly
  dryYears: number;
  lastShortageEvent: number;
}

export interface Civilization {
  id: CivId;
  name: string;
  color: string;
  founded: number;
  origin: number;
  alive: boolean;
  nextMilestone: number;
  lastDroughtRecord: number;
  lastRecoveryRecord: number;
  lastShortageRecord: number;
}

export interface HistoryEvent {
  id: string;
  year: number;
  kind: EventType;
  civId: CivId | null;
  regionId: number | null;
  headline: string;
  explanation: string;
}

export interface CensusRecord {
  year: number;
  civPopulations: number[];
  totalPopulation: number;
  settledRegions: number;
  meanRain: number;
}

export interface WorldState {
  version: 1;
  seed: number;
  rngState: number;
  year: number;
  width: number;
  height: number;
  climateMemory: number;
  regions: Region[];
  civilizations: Civilization[];
  history: HistoryEvent[];
  census: CensusRecord[];
}

export const DEFAULT_WIDTH = 20;
export const DEFAULT_HEIGHT = 13;

export function climateRatio(region: Region, rain = region.annualRain): number {
  const base = Math.max(region.averageRain, 0.12);
  return Math.max(0.24, Math.min(1.35, 0.15 + 0.85 * rain / base));
}

export function harvestFor(region: Region, rain = region.annualRain): number {
  if (region.owner === null || region.population <= 0) return 0;
  const maximum = region.baseFoodYield * climateRatio(region, rain);
  const labor = Math.min(1, region.population / Math.max(1, region.baseFoodYield * 0.48));
  return Math.max(0, maximum * labor);
}

export function neighbors(id: number, width: number, height: number): number[] {
  const x = id % width;
  const y = Math.floor(id / width);
  const result: number[] = [];
  if (x > 0) result.push(id - 1);
  if (x + 1 < width) result.push(id + 1);
  if (y > 0) result.push(id - width);
  if (y + 1 < height) result.push(id + width);
  return result;
}

export function populationByCiv(state: WorldState): number[] {
  const pops = state.civilizations.map(() => 0);
  for (const r of state.regions) if (r.owner !== null) pops[r.owner] = (pops[r.owner] ?? 0) + r.population;
  return pops;
}

export function numberOfSettlements(state: WorldState): number {
  return state.regions.filter(r => r.owner !== null).length;
}
