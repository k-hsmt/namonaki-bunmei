import { settlements } from './population.js';

export const practiceNames = {
  granary: '共同備蓄',
  council: '寄り合い',
  archive: '記録の慣習',
} as const;

type PracticeKind = keyof typeof practiceNames;
const kinds = Object.keys(practiceNames) as PracticeKind[];
export const siteNames = ['川辺', '丘陵', '入り江'] as const;

export interface Practice {
  kind: PracticeKind;
  originId: string;
  recordId: string;
  active: boolean;
}

interface CommunitySite {
  communityId: string;
  splitId?: string;
  strain: number;
  recovery: number;
  practices: Practice[];
}

export interface Society {
  sites: CommunitySite[];
  sourceIds: Partial<Record<PracticeKind, string>>;
}

export interface SocialRecord {
  title: string;
  body: string;
  causes: string[];
  relatedIds?: string[];
}

export function createSociety(): Society {
  return {
    sites: settlements.map(() => ({ communityId: 'founding-community', strain: 0, recovery: 0, practices: [] })),
    sourceIds: {},
  };
}

export function updateSociety(
  society: Society,
  people: readonly number[],
  coverage: readonly number[],
  cohesion: number,
  year: number,
  sources: Partial<Record<PracticeKind, string>>,
  record: (event: SocialRecord) => string,
): void {
  const mostPopulated = society.sites.map((_, i) => i).sort((a, b) => people[b]! - people[a]! || a - b);
  for (const kind of kinds) {
    const originId = sources[kind];
    const i = mostPopulated[0]!;
    if (!originId || society.sourceIds[kind] === originId || people[i]! < 100) continue;
    const site = society.sites[i]!;
    const prior = site.practices.find(p => p.kind === kind);
    if (!prior || !prior.active) {
      const recordId = record({
        title: `${siteNames[i]}で${practiceNames[kind]}が根づく`,
        body: 'この土地で役目を引き受け、次の世代へ伝える人々が現れた。',
        causes: ['制度を担う人々の定着'], relatedIds: [originId],
      });
      site.practices = [...site.practices.filter(p => p.kind !== kind), { kind, originId, recordId, active: true }];
    }
    society.sourceIds[kind] = originId;
  }

  society.sites.forEach((site, i) => {
    const localPopulation = people[i]!;
    const poor = coverage[i]! < .85;
    site.strain = poor && cohesion < 52 ? site.strain + 1 : 0;
    site.recovery = !poor && cohesion >= 68 ? site.recovery + 1 : 0;
    if (!site.splitId && localPopulation >= 400 && site.strain >= 8 &&
      society.sites.some((other, j) => j !== i && !other.splitId && people[j]! >= 400)) {
      site.splitId = record({
        title: `${siteNames[i]}が別の寄り合いを持つ`,
        body: '食糧の不足と共同作業をめぐる対立が続き、土地の決まりを独自に話し合うようになった。',
        causes: ['食糧不足の長期化', '共同体の結束の低下'],
      });
      site.communityId = `community-${settlements[i]!.id}-${year}`;
      for (const kind of kinds) {
        if (kind === 'granary' || site.practices.some(p => p.kind === kind && p.active)) continue;
        const inherited = society.sites
          .filter(other => other !== site && !other.splitId)
          .flatMap(other => other.practices)
          .find(p => p.kind === kind && p.active);
        if (!inherited) continue;
        const recordId = record({
          title: `${siteNames[i]}が${practiceNames[kind]}を受け継ぐ`,
          body: '新たな共同体にも、以前の暮らしから伝えられた慣習が残った。',
          causes: ['分立後の継承'], relatedIds: [site.splitId, inherited.recordId],
        });
        site.practices = [...site.practices.filter(p => p.kind !== kind), { ...inherited, recordId }];
      }
    } else if (site.splitId && site.recovery >= 20 &&
      society.sites.some((other, j) => j !== i && !other.splitId && people[j]! >= 400)) {
      record({
        title: `${siteNames[i]}が再び共同の寄り合いに加わる`,
        body: 'それぞれの土地で育った慣習を持ち寄り、共同の決まりを相談するようになった。',
        causes: ['生活の安定', '協力の回復'], relatedIds: [site.splitId],
      });
      delete site.splitId;
      site.communityId = 'founding-community';
    }

    for (const practice of site.practices) {
      if (!practice.active || (localPopulation >= 60 && site.strain < 15)) continue;
      practice.active = false;
      practice.recordId = record({
        title: `${siteNames[i]}で${practiceNames[practice.kind]}が途絶える`,
        body: '人々が離れたり、維持の負担を分け合えなくなったりして、慣習を担う人がいなくなった。',
        causes: ['担い手の減少または負担の長期化'], relatedIds: [practice.recordId],
      });
    }
  });
}
