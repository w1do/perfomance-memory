/**
 * «Разное» — только когда сферу правила определить нельзя. Если модель положила туда правило с известной сферой
 * (domain) или назвала папку кодом самой сферы («ai_assistants»), тема берётся из данных: самая частая тема этой
 * сферы в памяти пользователя; пока правил сферы нет — название по умолчанию (DOMAIN_TOPIC). Подпапки и лист
 * «Люблю»/«Не люблю» сохраняются.
 */
import { withPolarityLeaf } from '../folders/tree.js';
import { squash } from '../text/targets.js';
import { buildPreferenceFilter } from '../qdrant/filters.js';
import { MISC_FOLDER, PROJECTS_ROOT, type Enrichment } from '../types.js';
import type { PrefDeps } from './deps.js';
import { DOMAIN_TOPIC } from './guards.js';

const NO_SUBJECT = new Set(['other', 'project']);

/** Тема сферы: самая частая тема её правил вне «Разное» и «Проекты»; пока правил нет — название по умолчанию. */
export async function domainTopic(deps: PrefDeps, domain: string): Promise<string | null> {
  const counts = new Map<string, number>();
  for (const p of await deps.store.allPreferences(buildPreferenceFilter({ domain }))) {
    const top = p.folder_path[0];
    if (top && top !== MISC_FOLDER && top !== PROJECTS_ROOT)
      counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? DOMAIN_TOPIC[domain] ?? null;
}

/** Папка названа кодом области — «ai_assistants», «devops»: это не тема, а идентификатор. */
const isDomainCode = (name: string, domain: string) =>
  /^[a-z][a-z0-9_]*$/.test(name) && squash(name) === squash(domain);

export async function rescueMisc(deps: PrefDeps, e: Enrichment): Promise<Enrichment> {
  const top = e.folder_path[0] ?? '';
  const lost = top === MISC_FOLDER || isDomainCode(top, e.domain);
  if (!lost || e.project || NO_SUBJECT.has(e.domain)) return e;
  const topic = await domainTopic(deps, e.domain);
  if (!topic) return e;
  const sub = e.folder_path.slice(1, -1);
  const first = sub[0];
  // «Разное › Deploy» с темой «Деплой и CI»: подпапка повторяет тему — не нужна
  const rest = first && sameWord(first, topic) ? sub.slice(1) : sub;
  return { ...e, folder_path: withPolarityLeaf([topic, ...rest], e.polarity) };
}

const LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ы: 'y',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  ъ: '',
  ь: '',
};
const latin = (s: string) => [...squash(s)].map((c) => LATIN[c] ?? c).join('');

/** «Deploy» и «Деплой и CI» — одно слово: в транслите совпадают первые пять букв («deplo»). */
function sameWord(a: string, b: string): boolean {
  const [x, y] = [latin(a), latin(b)];
  return x.length >= 5 && y.length >= 5 && x.slice(0, 5) === y.slice(0, 5);
}
