import {hash01} from '../engine/rng.js';
import { regions, settlements } from './population.js';

const places = [
  { name: '川辺', land: 55000, yield: 1.20 },
  { name: '丘陵', land: 17500, yield: 1.10 },
  { name: '入り江', land: 38000, yield: 1.15 },
] as const;

/** Exported for Issue #35 D3-a (architecture reads which districts a route joins). */
export const links = regions.flatMap((region, from) => region.neighbors.flatMap(id => {
  const to = regions.findIndex(candidate => candidate.id === id);
  return from < to ? [{ from, to }] : [];
}));

interface District {
  reserve: number;
  coverage: number[];
  importShare: number;
  shortageRecord: string | null;
  shortageYears: number;
}

interface Route {
  tradeYears: boolean[];
  blocked: boolean;
  closureRecord: string | null;
  agreementRecord: string | null;
  originRecord: string | null;
  missedMaintenance: number;
  capacityBonus: boolean;
}

export interface RegionalEconomy {
  districts: District[];
  routes: Route[];
  migrationYears: Record<string, number>;
}

export interface EconomyRecord {
  title: string;
  body: string;
  causes: string[];
  relatedIds?: string[];
}

export interface AnnualConditions {
  harvestFactors: number[];
  blockedRegions: ReadonlySet<string>;
  disruptionId?: string;
  granaries?: readonly boolean[];
}

export interface AnnualEconomyTotals {harvest:number[];imports:number[];traded:number[];discarded:number[];moves:{from:number;to:number;amount:number}[]}
export function regionalHarvestFactors(year:number,seed:number,drought:number):number[]{return regions.map((_,i)=>Math.max(.30,.77+hash01(year,i,seed)*.48-Math.min(drought,.5)*.2));}
export function createRegionalEconomy(): RegionalEconomy {
  return {
    districts: places.map(() => ({ reserve: 0, coverage: [], importShare: 0, shortageRecord: null, shortageYears: 0 })),
    routes: links.map(() => ({
      tradeYears: [], blocked: false, closureRecord: null,
      agreementRecord: null, originRecord: null, missedMaintenance: 0, capacityBonus: false,
    })),
    migrationYears: {},
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function byId(a: number, b: number): number {
  const first = regions[a]!.id;
  const second = regions[b]!.id;
  return first < second ? -1 : first === second ? 0 : 1;
}

export function updateRegionalEconomy(
  economy: RegionalEconomy,
  people: number[],
  year: number,
  conditions: AnnualConditions,
  record: (event: EconomyRecord) => string,
  legacyYear?: number,
): AnnualEconomyTotals {
  const harvests:number[]=[];
  const population = people.slice(0, places.length);
  const balances = economy.districts.map((district, i) => {
    const place = places[i]!;
    const demand = population[i]!;
    const harvest = Math.floor(Math.min(demand, place.land) * place.yield * conditions.harvestFactors[i]!);
    harvests.push(harvest);
    return district.reserve + harvest - demand;
  });
  const exportable = balances.map(balance => Math.floor(Math.max(0, balance) * .20));
  const imports = places.map(() => 0);
  const traded = links.map(() => 0);

  const capacities = links.map(({ from, to }, i) => {
    const route = economy.routes[i]!;
    const blocked = conditions.blockedRegions.has(regions[from]!.id) || conditions.blockedRegions.has(regions[to]!.id);
    if (blocked && !route.blocked) {
      route.closureRecord = record({
        title: `${places[from]!.name}と${places[to]!.name}を結ぶ往来が途絶える`,
        body: '荷の受け渡しが止まり、蓄えで不足をしのぐことになった。',
        causes: ['交易路の途絶'],
        relatedIds: [conditions.disruptionId, route.agreementRecord].filter((id): id is string => Boolean(id)),
      });
    }
    route.blocked = blocked;
    if (blocked) return 0;
    const ordinary = Math.max(10, Math.floor(Math.min(population[from]!, population[to]!) * .12));
    return ordinary * (route.capacityBonus ? 2 : 1);
  });

  const recipients = places.map((_, i) => i).sort((a, b) => balances[a]! - balances[b]! || byId(a, b));
  for (const to of recipients) {
    for (let i = 0; i < links.length && balances[to]! < 0; i++) {
      const link = links[i]!;
      if (link.from !== to && link.to !== to) continue;
      const from = link.from === to ? link.to : link.from;
      const amount = Math.min(exportable[from]!, -balances[to]!, capacities[i]!);
      exportable[from]! -= amount;
      balances[from]! -= amount;
      balances[to]! += amount;
      imports[to]! += amount;
      traded[i]! += amount;
    }
  }

  economy.districts.forEach((district, i) => {
    const demand = population[i]!;
    const coverage = demand === 0 ? 1 : Math.max(0, Math.min(1, 1 + balances[i]! / demand));
    district.coverage.push(coverage);
    if (district.coverage.length > 5) district.coverage.shift();
    district.importShare = demand === 0 ? 0 : imports[i]! / demand;
    district.shortageYears = coverage < .90 ? district.shortageYears + 1 : 0;
    if (district.shortageYears === 3) {
      const closures = links.flatMap((link, j) => {
        const route = economy.routes[j]!;
        return (link.from === i || link.to === i) && route.blocked && route.closureRecord ? [route.closureRecord] : [];
      });
      district.shortageRecord = record({
        title: `${places[i]!.name}の食糧不足が続く`,
        body: '収穫と蓄え、ほかの土地から届く荷を合わせても、暮らしに必要な食糧を賄えない年が続いた。',
        causes: ['交易後も残る食糧不足'],
        relatedIds: closures,
      });
    }
    if (district.shortageYears === 0) district.shortageRecord = null;
  });

  const coverage = economy.districts.map(district => mean(district.coverage));
  const moves: { from: number; to: number; amount: number }[] = [];
  for (const from of recipients) {
    const to = regions[from]!.neighbors.map(id => regions.findIndex(region => region.id === id))
      .filter(i => coverage[i]! - coverage[from]! >= .10 && balances[i]! > 0 && population[i]! > 0)
      .sort((a, b) => coverage[b]! - coverage[a]! || byId(a, b))[0];
    if (to === undefined || economy.districts[from]!.coverage.length < 5) continue;
    const amount = Math.min(Math.floor(population[from]! * .01), balances[to]!);
    if (amount <= 0) continue;
    balances[to]! -= amount;
    moves.push({ from, to, amount });
  }

  // A migrated population has no home region. Only new, limited settlement
  // movements can place its residents on the map.
  const unlocated = settlements.length;
  if (legacyYear !== undefined && year - legacyYear >= 5 && people[unlocated]! >= 100) {
    const to = places.map((_, i) => i)
      .filter(i => coverage[i]! >= .95 && conditions.harvestFactors[i]! * places[i]!.yield >= 1)
      .sort((a, b) => (places[b]!.land - population[b]!) - (places[a]!.land - population[a]!) || byId(a, b))[0];
    if (to !== undefined) {
      const amount = Math.min(Math.floor(people[unlocated]! * .01), 120, places[to]!.land - population[to]!);
      if (amount > 0) moves.push({ from: unlocated, to, amount });
    }
  }
  for (const { from, to, amount } of moves) {
    people[from]! -= amount;
    people[to]! += amount;
    const key = `${from}-${to}`;
    if (year - (economy.migrationYears[key] ?? -Infinity) < 10) continue;
    economy.migrationYears[key] = year;
    const shortage = economy.districts[from]?.shortageRecord;
    record({
      title: `${places[to]!.name}へ${from === unlocated ? '新たに定住する' : '住まいを移す'}人々`,
      body: `${places[from]?.name ?? '居住地の記録がなかった人々の暮らし'}から、受け入れ余力のある${places[to]!.name}へ、この年は${amount}人が移った。`,
      causes: [from === unlocated ? '新しい居住地への定住' : '隣接地域の食糧事情の差'],
      relatedIds: shortage ? [shortage] : [],
    });
  }

  links.forEach(({ from, to }, i) => {
    const route = economy.routes[i]!;
    route.tradeYears.push(traded[i]! > 0);
    if (route.tradeYears.length > 20) route.tradeYears.shift();
    const eligible = route.tradeYears.length === 20 && route.tradeYears.filter(Boolean).length >= 15;
    const fee = Math.max(1, Math.floor(Math.min(population[from]!, population[to]!) * .02));
    const canMaintain = !route.blocked && [from, to].every(j => population[j]! >= 60 && balances[j]! >= fee);
    if (!route.agreementRecord && !(eligible && canMaintain)) return;

    route.capacityBonus = canMaintain;
    if (canMaintain) {
      balances[from]! -= fee;
      balances[to]! -= fee;
      route.missedMaintenance = 0;
      if (!route.agreementRecord) {
        route.agreementRecord = record({
          title: `${places[from]!.name}と${places[to]!.name}が交易路を共同で維持する`,
          body: `荷の往来が定着し、双方が食糧と労働を負担する取り決めを結んだ。年間の食糧負担は各地で${fee}人年分。`,
          causes: ['長期にわたる交易', '維持のための余力'],
          relatedIds: route.originRecord ? [route.originRecord] : [],
        });
        route.originRecord ??= route.agreementRecord;
      }
    } else if (++route.missedMaintenance === 5) {
      record({
        title: `${places[from]!.name}と${places[to]!.name}の共同管理が休止する`,
        body: '負担を賄えない年が続き、交易路を共同で手入れする取り決めが休止した。',
        causes: ['維持負担を5年連続で賄えなかった'],
        relatedIds: [route.agreementRecord, route.blocked ? route.closureRecord : null].filter((id): id is string => Boolean(id)),
      });
      route.agreementRecord = null;
      route.missedMaintenance = 0;
    }
  });
  const discarded:number[]=[];
  economy.districts.forEach((district, i) => {
    district.reserve = Math.min(Math.max(0, balances[i]!), Math.floor(people[i]! * (conditions.granaries?.[i] ? .25 : .15)));
    discarded.push(Math.max(0,balances[i]!-district.reserve));
  });
  return {harvest:harvests,imports,traded,discarded,moves};
}

export function tradeYearsFor(economy: RegionalEconomy, regionId: string): number {
  const district = regions.findIndex(region => region.id === regionId);
  return Math.max(0, ...links.flatMap(({ from, to }, i) =>
    from === district || to === district ? [economy.routes[i]!.tradeYears.filter(Boolean).length] : []));
}
