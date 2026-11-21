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
    if (!Array.isArray(metrics) || metrics.length !== 4 || !metrics.every(isConfirmedMetricValue)) {
      throw new Error('Invalid confirmed metrics');
    }
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
