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

export interface ObservationLedger {
  people: number[];
  sites?: SettlementHistory;
  blocks: ObservationBlock[];
  lastYear: number | null;
  legacy: LegacyBoundary | null;
}

export function commitObservation(ledger: ObservationLedger, year: number): void {
  const expected = (ledger.lastYear ?? ledger.legacy?.year ?? -1) + 1;
  if (year !== expected) throw new Error('Observation year is out of sequence');

  const block = ledger.blocks.at(-1);
  if (!block || year - block.year === checkpointInterval) {
    ledger.blocks.push({ year, population: [...ledger.people], changes: [] });
  } else {
    const previous = populationAt(ledger, year - 1)!;
    block.changes.push(ledger.people.map((count, index) => count - previous[index]!));
  }
  ledger.lastYear = year;
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
