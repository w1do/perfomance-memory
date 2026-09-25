/**
 * «Разное» — только когда сферу правила определить нельзя. Если модель положила туда правило с известной сферой
 * (domain), тема берётся из данных: самая частая тема этой сферы в памяти пользователя; пока правил сферы нет —
 * название по умолчанию (DOMAIN_TOPIC). Подпапки и лист «Люблю»/«Не люблю» сохраняются.
 */
import { withPolarityLeaf } from '../folders/tree.js';
import { buildPreferenceFilter } from '../qdrant/filters.js';
import { MISC_FOLDER, PROJECTS_ROOT, type Enrichment } from '../types.js';
import type { PrefDeps } from './deps.js';
import { DOMAIN_TOPIC } from './guards.js';

const NO_SUBJECT = new Set(['other', 'project']);

export async function rescueMisc(deps: PrefDeps, e: Enrichment): Promise<Enrichment> {
  if (e.folder_path[0] !== MISC_FOLDER || e.project || NO_SUBJECT.has(e.domain)) return e;
  const counts = new Map<string, number>();
  for (const p of await deps.store.allPreferences(buildPreferenceFilter({ domain: e.domain }))) {
    const top = p.folder_path[0];
    if (top && top !== MISC_FOLDER && top !== PROJECTS_ROOT)
      counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  const topic = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? DOMAIN_TOPIC[e.domain];
  if (!topic) return e;
  return {
    ...e,
    folder_path: withPolarityLeaf([topic, ...e.folder_path.slice(1, -1)], e.polarity),
  };
}
