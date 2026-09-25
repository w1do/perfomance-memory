/** Чтение правил: гибридный поиск, список (новые сверху или постранично), все по фильтру, фасеты, статистика. */
import { buildPreferenceFilter } from '../qdrant/filters.js';
import { bm25Query } from '../text/bm25.js';
import type { PreferenceFilter, PreferencePayload, ScoredPreference } from '../types.js';
import type { PrefDeps } from './deps.js';
import { FACET_KEYS, type ListOptions } from './schemas.js';

export async function search(
  deps: PrefDeps,
  query: string,
  filter: PreferenceFilter,
  topK: number,
) {
  const [dense] = await deps.ai.embed([query]);
  return deps.store.hybrid(
    dense as number[],
    bm25Query(query),
    buildPreferenceFilter(filter),
    topK,
  );
}

export async function list(
  deps: PrefDeps,
  filter: PreferenceFilter,
  opts: ListOptions = {},
): Promise<{ items: ScoredPreference[]; next: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  if (opts.q?.trim())
    return { items: await search(deps, opts.q.trim(), filter, limit), next: null };
  const page = await deps.store.scrollPreferences(buildPreferenceFilter(filter), {
    limit,
    cursor: opts.cursor ?? null,
    newestFirst: !opts.cursor,
  });
  return { items: page.items.map((preference) => ({ preference, score: null })), next: page.next };
}

export const all = (deps: PrefDeps, filter: PreferenceFilter = {}): Promise<PreferencePayload[]> =>
  deps.store.allPreferences(buildPreferenceFilter(filter));

export const count = (deps: PrefDeps, filter: PreferenceFilter = {}): Promise<number> =>
  deps.store.countPreferences(buildPreferenceFilter(filter));

export async function facets(deps: PrefDeps, filter: PreferenceFilter = {}) {
  const qf = buildPreferenceFilter(filter);
  const entries = await Promise.all(
    FACET_KEYS.map(async (key) => [key, await deps.store.facet(key, qf, 100)] as const),
  );
  return Object.fromEntries(entries) as Record<string, { value: string; count: number }[]>;
}

export async function stats(deps: PrefDeps) {
  const active = buildPreferenceFilter({});
  const [total, like, dislike, folders, projects, latest] = await Promise.all([
    deps.store.countPreferences(active),
    deps.store.countPreferences(buildPreferenceFilter({ polarity: 'like' })),
    deps.store.countPreferences(buildPreferenceFilter({ polarity: 'dislike' })),
    deps.store.countFolders(),
    deps.folders.projects(),
    deps.store.scrollPreferences(active, { limit: 1, newestFirst: true }),
  ]);
  return {
    total,
    like,
    dislike,
    folders,
    projects: projects.length,
    last: latest.items[0] ?? null,
  };
}
