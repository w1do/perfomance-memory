/**
 * Поиск старых дублей: формулировки (statement + details) всех правил → эмбеддинги → пары со сходством
 * ≥ DUPLICATE_SCORE → связные группы (не больше MAX_GROUP) → модель решает, какие правила в группе требуют
 * одного и того же. Пары, помеченные «не дубли» (distinct_from), не предлагаются.
 */
import { buildPreferenceFilter } from '../qdrant/filters.js';
import type { PreferencePayload } from '../types.js';
import { cosine } from './conflict.js';
import type { PrefDeps } from './deps.js';
import { pickKeep } from './merge.js';

export interface DuplicateGroup {
  /** какое правило предлагается оставить */
  keep: string;
  reason: string;
  preferences: PreferencePayload[];
}

const MAX_GROUP = 12;
const PARALLEL = 3;

const distinct = (a: PreferencePayload, b: PreferencePayload) =>
  a.distinct_from.includes(b.id) || b.distinct_from.includes(a.id);

/** Связные группы похожих правил; union-find, группа не растёт больше MAX_GROUP. */
function clusters(all: PreferencePayload[], vectors: number[][], threshold: number): number[][] {
  const edges: [number, number, number][] = [];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      if (distinct(all[i] as PreferencePayload, all[j] as PreferencePayload)) continue;
      const s = cosine(vectors[i] as number[], vectors[j] as number[]);
      if (s >= threshold) edges.push([s, i, j]);
    }
  edges.sort((a, b) => b[0] - a[0]);
  const parent = all.map((_, i) => i);
  const size = all.map(() => 1);
  const root = (i: number): number =>
    parent[i] === i ? i : (parent[i] = root(parent[i] as number));
  for (const [, i, j] of edges) {
    const [a, b] = [root(i), root(j)];
    if (a === b || (size[a] as number) + (size[b] as number) > MAX_GROUP) continue;
    parent[b] = a;
    size[a] = (size[a] as number) + (size[b] as number);
  }
  const groups = new Map<number, number[]>();
  all.forEach((_, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), i]));
  return [...groups.values()].filter((g) => g.length > 1);
}

async function confirm(deps: PrefDeps, cluster: PreferencePayload[]): Promise<DuplicateGroup[]> {
  const byId = new Map(cluster.map((p) => [p.id, p]));
  const res = await deps.ai.groupDuplicates(
    cluster.map((p) => ({
      id: p.id,
      statement: p.statement,
      details: p.details,
      polarity: p.polarity,
      folder_path: p.folder_path,
    })),
  );
  const used = new Set<string>();
  const out: DuplicateGroup[] = [];
  for (const g of res.groups ?? []) {
    if (g.differences?.trim()) continue; // модель нашла различия — это разные требования
    const prefs = [...new Set(g.ids)]
      .filter((id) => !used.has(id))
      .map((id) => byId.get(id))
      .filter((p): p is PreferencePayload => p !== undefined);
    if (prefs.length < 2 || prefs.some((a) => prefs.some((b) => a !== b && distinct(a, b))))
      continue;
    prefs.forEach((p) => used.add(p.id));
    out.push({ keep: pickKeep(prefs).id, reason: g.reason, preferences: prefs });
  }
  return out;
}

export async function findDuplicates(deps: PrefDeps): Promise<DuplicateGroup[]> {
  const all = await deps.store.allPreferences(buildPreferenceFilter({}));
  if (all.length < 2) return [];
  const vectors = await deps.ai.embed(all.map((p) => [p.statement, p.details ?? ''].join('. ')));
  const found = clusters(all, vectors, deps.config.DUPLICATE_SCORE).map((c) =>
    c.map((i) => all[i] as PreferencePayload),
  );
  const out: DuplicateGroup[] = [];
  for (let i = 0; i < found.length; i += PARALLEL) {
    const batch = await Promise.all(
      found.slice(i, i + PARALLEL).map((c) =>
        confirm(deps, c).catch((err: Error) => {
          deps.log.warn({ err: err.message, size: c.length }, 'duplicate check failed');
          return [];
        }),
      ),
    );
    out.push(...batch.flat());
  }
  deps.log.info({ rules: all.length, clusters: found.length, groups: out.length }, 'duplicates');
  return out;
}
