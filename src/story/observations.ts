import { populationColumns, populationTotal } from './population.js';

import {communityAt, type SettlementHistory} from './settlement-history.js';

const checkpointInterval = 100;

export interface LegacyBoundary {
  year: number;
  population: number;
  sampleCount: number;
  historyCount: number;
  memoryCount: number;
}

interface ObservationBlock {
  year: number;
  population: number[];
  changes: number[][];
}

/**
 * Issue #29 S1: the civilization-wide food, cohesion, knowledge and culture of every confirmed year.
 * `values[year - firstYear]` holds the four values exactly as they stood when that year was confirmed
 * (the same boundary as the population blocks). Population is not repeated here: it is read from the blocks.
 * A year awaiting a choice has no row; nothing is ever interpolated, inferred or rounded.
 */
export const civilizationMetricRule = 'civilization-metrics-v1';
export type ConfirmedMetrics = readonly [food: number, cohesion: number, knowledge: number, culture: number];
export interface ConfirmedMetricLedger {
  readonly ruleId: typeof civilizationMetricRule;
  readonly firstYear: 0;
  readonly values: ConfirmedMetrics[];
}

export interface ObservationLedger {
  people: number[];
  sites?: SettlementHistory;
  blocks: ObservationBlock[];
  lastYear: number | null;
  legacy: LegacyBoundary | null;
  /** Present on every civilization created by the current rules; absent only on pre-#29 ledgers (unrecorded). */
  metrics?: ConfirmedMetricLedger;
}

export function isConfirmedMetricValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

/** Exactly four in-range values at indices 0..3 (a sparse or decorated array is not a row). */
function isConfirmedMetricRow(row: unknown): row is ConfirmedMetrics {
  return Array.isArray(row) && row.length === 4 && Object.keys(row).length === 4 &&
    [0, 1, 2, 3].every((i) => Object.hasOwn(row, i) && isConfirmedMetricValue(row[i]));
}

/**
 * The saved metric history of a ledger whose last confirmed year is `confirmedYear`: the exact fields, one row per
 * confirmed year from year 0, every value finite and within 0..100. When the year is fully confirmed (no choice
 * pending), `current` is the civilization's four values and must equal the last row; a pending state passes null,
 * because its live values are the pending year's draft. Nothing is repaired.
 */
export function validateConfirmedMetricLedger(raw: unknown, confirmedYear: number, current: ConfirmedMetrics | null): void {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) {
    throw new Error('Invalid confirmed metric history');
  }
  const ledger = raw as Record<string, unknown>;
  if (Object.keys(ledger).sort().join(',') !== 'firstYear,ruleId,values' || ledger.ruleId !== civilizationMetricRule ||
    ledger.firstYear !== 0 || !Number.isSafeInteger(confirmedYear) || confirmedYear < 0 ||
    !Array.isArray(ledger.values) || ledger.values.length !== confirmedYear + 1) {
    throw new Error('Invalid confirmed metric history');
  }
  for (let i = 0; i < ledger.values.length; i++) {
    if (!isConfirmedMetricRow(ledger.values[i])) throw new Error('Invalid confirmed metrics');
  }
  if (current) {
    const last = ledger.values[confirmedYear] as ConfirmedMetrics;
    if (last.some((value, i) => value !== current[i])) throw new Error('Confirmed metrics disagree with the civilization');
  }
}

export function createMetricLedger(): ConfirmedMetricLedger {
  return { ruleId: civilizationMetricRule, firstYear: 0, values: [] };
}

/**
 * Confirms one year: the population blocks and (when the ledger records them) the four metrics move together.
 * Every input is checked before anything is written, so a rejected year leaves the ledger unchanged.
 */
export function commitObservation(ledger: ObservationLedger, year: number, metrics: ConfirmedMetrics): void {
  const expected = (ledger.lastYear ?? ledger.legacy?.year ?? -1) + 1;
  if (year !== expected) throw new Error('Observation year is out of sequence');
  const record = ledger.metrics;
  if (record) {
    if (record.values.length !== year - record.firstYear) throw new Error('Metric history is out of sequence');
    if (!isConfirmedMetricRow(metrics)) throw new Error('Invalid confirmed metrics');
  }

  const block = ledger.blocks.at(-1);
  if (!block || year - block.year === checkpointInterval) {
    ledger.blocks.push({ year, population: [...ledger.people], changes: [] });
  } else {
    const previous = populationAt(ledger, year - 1)!;
    block.changes.push(ledger.people.map((count, index) => count - previous[index]!));
  }
  record?.values.push([metrics[0], metrics[1], metrics[2], metrics[3]]);
  ledger.lastYear = year;
}

/**
 * Confirmed total population of every year from..to (inclusive, within the confirmed range), in one pass over the
 * blocks: the same values as observationAt(year).population, without replaying a checkpoint for each year.
 */
export function populationTotalsBetween(ledger: ObservationLedger, from: number, to: number): {year: number; population: number}[] {
  const first = ledger.blocks[0];
  if (!first || ledger.lastYear === null) return [];
  const start = Math.max(first.year, from), end = Math.min(ledger.lastYear, to), out: {year: number; population: number}[] = [];
  for (const block of ledger.blocks) {
    if (block.year > end) break;
    let people = [...block.population];
    for (let i = 0; i <= block.changes.length && block.year + i <= end; i++) {
      if (i > 0) { const change = block.changes[i - 1]!; people = people.map((n, j) => n + change[j]!); }
      if (block.year + i >= start) out.push({year: block.year + i, population: populationTotal(people)});
    }
  }
  return out;
}

/** The four confirmed metrics of `year`, or null when the year is unconfirmed or was never recorded. */
export function metricsAt(ledger: ObservationLedger, year: number): ConfirmedMetrics | null {
  const record = ledger.metrics;
  if (!record || !Number.isSafeInteger(year) || ledger.lastYear === null) return null;
  if (year < record.firstYear || year > ledger.lastYear) return null;
  if (record.values.length !== ledger.lastYear - record.firstYear + 1) throw new Error('Metric history disagrees with the confirmed year');
  return record.values[year - record.firstYear]!;
}

function populationAt(ledger: ObservationLedger, year: number): number[] | null {
  const first = ledger.blocks[0];
  if (!first || year < first.year || year > ledger.lastYear!) return null;
  const block = ledger.blocks[Math.floor((year - first.year) / checkpointInterval)]!;
  const people = [...block.population];
  for (let i = 0; i < year - block.year; i++) {
    const change = block.changes[i]!;
    for (let j = 0; j < people.length; j++) people[j]! += change[j]!;
  }
  return people;
}

export function observationAt(ledger: ObservationLedger, year: number) {
  if (!Number.isSafeInteger(year)) return null;
  const people = populationAt(ledger, year);
  if (!people) return null;
  return {
    year,
    population: populationTotal(people),
    residents: populationColumns.map((column, index) => ({
      ...column,
      communityId: communityAt(ledger.sites,index,year)??column.communityId,
      population: people[index]!,
    })),
  };
}
