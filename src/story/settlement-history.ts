import { siteNames, type Practice, type Society, type SocialRecord } from './society.js';
import { settlements } from './population.js';

export const scaleNames = ['集落', '村', '町', '都市'] as const;
export type Trend = 'stable' | 'expanding' | 'contracting' | 'reorganizing';
type Kind = 'house' | 'field' | 'hall' | 'workshop' | 'market' | 'bridge' | 'granary';
type Condition = 'intact' | 'damaged' | 'ruined';

export interface Building {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  builtYear: number;
  condition: Condition;
  reused?: boolean;
  recordId?: string;
}

export interface SiteView {
  scale: number;
  trend: Trend;
  inhabited: boolean;
  communityId: string;
  practices: Practice[];
  buildings: Building[];
}

interface SiteState {
  view: SiteView;
  changes: { year: number; view: Omit<SiteView,'buildings'|'practices'> }[];
  buildingChanges: { year: number; building: Building }[];
  practiceChanges: { year: number; practices: Practice[] }[];
  growthYears: number;
  shrinkYears: number;
  lastWork: number;
  reorganizeUntil?: number;
  repairYears?: number;
}

export type SettlementHistory = SiteState[];
const plots = [
  { x: 55, y: 114, kind: 'house', demand: 1 },
  { x: 86, y: 127, kind: 'field', demand: 150 },
  { x: 229, y: 112, kind: 'house', demand: 1000 },
  { x: 197, y: 121, kind: 'hall', demand: 1850 },
  { x: 270, y: 130, kind: 'granary', demand: 2300 },
  { x: 110, y: 117, kind: 'workshop', demand: 3100 },
  { x: 256, y: 109, kind: 'market', demand: 4600 },
  { x: 149, y: 143, kind: 'bridge', demand: 6500 },
  { x: 46, y: 139, kind: 'house', demand: 7600 },
  { x: 210, y: 141, kind: 'workshop', demand: 10200 },
  { x: 302, y: 145, kind: 'house', demand: 13500 },
] as const;
const kindNames: Record<Kind, string> = {
  house: '家屋', field: '畑', hall: '集会所', workshop: '仕事場',
  market: '市', bridge: '橋', granary: '穀物庫',
};

function store(site: SiteState, year: number, previous?: SiteView): void {
  const {buildings,practices,...view}=site.view;
  site.changes.push({year,view});
  for(const building of buildings){
    const before=previous?.buildings.find(b=>b.id===building.id);
    if(JSON.stringify(building)!==JSON.stringify(before))site.buildingChanges.push({year,building:{...building}});
  }
  if(JSON.stringify(practices)!==JSON.stringify(previous?.practices)){
    site.practiceChanges.push({year,practices:practices.map(practice=>({...practice}))});
  }
}

function buildingAt(i: number, plot: number, year: number): Building {
  const { x, y, kind } = plots[plot]!;
  return { id: `${settlements[i]!.id}-${plot}`, kind, x, y, builtYear: year, condition: 'intact' };
}

export function createSettlementHistory(people: readonly number[], year: number): SettlementHistory {
  return settlements.map((_, i) => {
    const inhabited = people[i]! > 0;
    const site: SiteState = {
      view: {
        scale: 0, trend: 'stable', inhabited, communityId: 'founding-community', practices: [],
        buildings: inhabited ? [buildingAt(i, 0, year)] : [],
      },
      changes: [], buildingChanges: [], practiceChanges: [], growthYears: 0, shrinkYears: 0, lastWork: year,
    };
    store(site, year);
    return site;
  });
}

function lastAt<T extends {year:number}>(changes: readonly T[],year:number): T|undefined {
  let low = 0;
  let high = changes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (changes[middle]!.year <= year) low = middle + 1;
    else high = middle;
  }
  return changes[low - 1];
}

export function communityAt(history:SettlementHistory|undefined,i:number,year:number):string|undefined {
  const site=history?.[i];
  return site&&lastAt(site.changes,year)?.view.communityId;
}

export function siteAt(history: SettlementHistory | undefined, i: number, year: number): SiteView | undefined {
  const site=history?.[i];
  const summary=site&&lastAt(site.changes,year);
  if(!site||!summary)return;
  const buildings=new Map<string,Building>();
  for(const change of site.buildingChanges){
    if(change.year>year)break;
    buildings.set(change.building.id,change.building);
  }
  return {...summary.view,buildings:[...buildings.values()].map(building=>({...building})),
    practices:lastAt(site.practiceChanges,year)?.practices.map(practice=>({...practice}))??[]};
}

interface LocalConditions {
  population: number;
  coverage: number;
  tradeYears: number;
  shortageYears: number;
  hazard?: { id: string; kind: string };
  shortageId?: string;
}

export function updateSettlements(
  history: SettlementHistory,
  society: Society,
  local: readonly LocalConditions[],
  year: number,
  record: (event: SocialRecord) => string,
  canBuild?: (siteIndex:number,candidate:Building)=>boolean,
): void {
  history.forEach((site, i) => {
    const { population, coverage, tradeYears, shortageYears, hazard, shortageId } = local[i]!;
    const view = site.view;
    const community = society.sites[i]!;
    const damaged = hazard && view.buildings.find(b => b.condition === 'intact' &&
      (hazard.kind === 'flood' ? b.kind === 'bridge' || b.kind === 'field' : b.kind !== 'field'));
    const facilities = view.buildings.filter(b => b.condition === 'intact');
    const has = (kind: Kind) => facilities.some(b => b.kind === kind);
    const eligible = [
      true,
      population >= 1600 && has('field') && has('hall'),
      population >= 4100 && has('market') && has('workshop') && tradeYears >= 3,
      population >= 12500 && has('market') && facilities.filter(b => b.kind === 'workshop').length >= 2 && tradeYears >= 5,
    ];
    const floor = [0, 950, 2800, 8500][view.scale]!;
    site.growthYears = eligible[view.scale + 1] && coverage >= .9 ? site.growthYears + 1 : 0;
    const contraction = population < floor || coverage < .75;
    site.shrinkYears = contraction ? site.shrinkYears + 1 : 0;
    site.repairYears=population>0&&coverage>=.92?(site.repairYears??0)+1:0;
    const previous = structuredClone(view);
    view.inhabited = population > 0;
    view.communityId = community.communityId;
    view.practices = community.practices.map(practice => ({ ...practice }));
    if(previous.communityId !== view.communityId)site.reorganizeUntil=year+8;
    view.trend = year < (site.reorganizeUntil??0) ? 'reorganizing'
      : site.shrinkYears >= 5 ? 'contracting' : site.growthYears >= 5 ? 'expanding' : 'stable';

    if (view.inhabited && (site.growthYears >= 22 || (view.scale > 0 && site.shrinkYears >= 18))) {
      const growing = site.growthYears >= 22;
      view.scale += growing ? 1 : -1;
      site.growthYears = 0;
      site.shrinkYears = 0;
      record({
        title: `${siteNames[i]}が${scaleNames[view.scale]}と呼ばれるようになる`,
        body: growing ? '建物の使い方と周囲との関係が、長い年月をかけて変わった。' : 'かつての建物や道を残したまま、暮らしの規模が変わった。',
        causes: [growing ? '施設と地域での役割の定着' : '人口減少または食糧不足の長期化'],
        relatedIds: !growing && shortageId ? [shortageId] : [],
      });
    }
    if (damaged && hazard) {
      damaged.condition = 'damaged';
      damaged.recordId = record({
        title: `${siteNames[i]}の${kindNames[damaged.kind]}が損傷する`,
        body: '傷んだ建物はその場に残り、修繕や別の使い方を待つことになった。',
        causes: ['災害による損傷'], relatedIds: [hazard.id],
        kind: 'building-damaged', buildingId: damaged.id,
      });
      site.lastWork = year;
    } else if (year - site.lastWork >= 8) {
      const abandon = !view.inhabited || (coverage < .85 && shortageYears >= 5);
      const changed = abandon ? view.buildings.find(b => b.condition !== 'ruined')
        : view.buildings.find(b => b.condition==='damaged' ? site.repairYears!>=3 : b.condition==='ruined' && site.repairYears!>=12);
      if (changed) {
        const reuse = !abandon && changed.condition === 'ruined';
        changed.condition = abandon ? 'ruined' : 'intact';
        if (reuse) changed.reused = true;
        changed.recordId = record({
          title: `${siteNames[i]}の${kindNames[changed.kind]}が${abandon ? '使われなくなる' : reuse ? '再利用される' : '修繕される'}`,
          body: '同じ区画に、以前の暮らしの痕跡が残っている。',
          causes: [abandon ? '担い手や食糧の不足' : '維持を担う人と食糧の回復'],
          kind: abandon ? 'building-abandoned' : reuse ? 'building-reused' : 'building-repaired',
          buildingId: changed.id,
          relatedIds: [changed.recordId, abandon ? shortageId : null].filter((id): id is string => Boolean(id)),
        });
        site.lastWork = year;
      } else if (coverage >= .95) {
        const plot = plots.findIndex((candidate, j) => population >= candidate.demand &&
          (candidate.kind !== 'market' || tradeYears >= 3) &&
          (candidate.kind !== 'bridge' || i === 0) &&
          !view.buildings.some(b => b.id === `${settlements[i]!.id}-${j}`));
        if (plot >= 0) {
          const building = buildingAt(i, plot, year);
          // H3: 建設候補が住宅敷地と衝突した場合は施設建設をHOLD。
          // 次の候補地点への無断移設、既存街区の移動・削除はしない。
          if (!canBuild || canBuild(i,building)) {
          building.recordId = record({
            title: `${siteNames[i]}に${kindNames[building.kind]}が造られる`,
            body: '暮らしの変化に合わせて、一つの区画に手が加えられた。',
            causes: ['利用の必要性と建設の余力'],
            kind: 'building-built', buildingId: building.id,
          });
          view.buildings.push(building);
          site.lastWork = year;
          }
        }
      }
    }
    if (JSON.stringify(view) !== JSON.stringify(previous)) store(site,year,previous);
  });
}
