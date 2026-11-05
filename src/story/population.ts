export const regions = [
  { id: 'river', neighbors: ['hills', 'coast'] },
  { id: 'hills', neighbors: ['river'] },
  { id: 'coast', neighbors: ['river'] },
] as const;

export const settlements = [
  { id: 'river-bank', regionId: 'river' },
  { id: 'hill-side', regionId: 'hills' },
  { id: 'coast-inlet', regionId: 'coast' },
] as const;

export const communities = [{ id: 'founding-community' }] as const;

// Columns in the saved ledger are stable for this schema. The final column
// holds residents whose location is unknown in a migrated world.
export const populationColumns = [
  ...settlements.map(settlement => ({
    settlementId: settlement.id,
    regionId: settlement.regionId,
    communityId: communities[0].id,
  })),
  { settlementId: null, regionId: null, communityId: communities[0].id },
];

export function populationTotal(people: readonly number[]): number {
  return people.reduce((sum, count) => sum + count, 0);
}

function allocate(total: number, weights: readonly number[]): number[] {
  const weightTotal = populationTotal(weights);
  const exact = weights.map(weight => total * weight / weightTotal);
  const counts = exact.map(Math.floor);
  const order = exact.map((value, index) => ({ index, remainder: value - counts[index]! }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const remaining = total - populationTotal(counts);
  for (const { index } of order.slice(0, remaining)) counts[index]!++;
  return counts;
}

export function initialPopulation(total: number, legacy: boolean): number[] {
  return legacy ? [0, 0, 0, total] : allocate(total, [57, 27, 16, 0]);
}

export function changePopulation(people: number[], nextTotal: number): void {
  const delta = nextTotal - populationTotal(people);
  if (delta === 0) return;
  const changes = allocate(Math.abs(delta), people);
  for (let i = 0; i < people.length; i++) {
    people[i]! += Math.sign(delta) * changes[i]!;
  }
}
