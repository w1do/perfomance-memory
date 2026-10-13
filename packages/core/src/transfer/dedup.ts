/**
 * Дубли при импорте без LLM: дословное совпадение (ExactIndex) и смысловое — косинус dense ≥ IMPORT_DUPLICATE_SCORE
 * в гибридном поиске того же проекта и полярности. Противоположная полярность с той же формулировкой — конфликт.
 */
import { normName, sameName } from '../folders/tree.js';
import { cosine } from '../preferences/conflict.js';
import type { PrefDeps } from '../preferences/deps.js';
import { andFilter, buildPreferenceFilter } from '../qdrant/filters.js';
import { bm25Query } from '../text/bm25.js';
import type { Enrichment, Polarity } from '../types.js';
import type { ImportReport } from './format.js';
import { statementKey } from './keys.js';
import type { Prepared, WriteState } from './types.js';

export type RuleStatus = 'new' | 'duplicate' | 'conflict';

/** Без подтверждения моделью порог строже CONFLICT_SCORE: ложный пропуск хуже лишнего правила, его доберёт «Гигиена». */
export const IMPORT_DUPLICATE_SCORE = 0.92;

const DEDUP_PARALLEL = 8;

type Key = Pick<Enrichment, 'statement' | 'polarity' | 'project'>;

export class ExactIndex {
  private readonly seen = new Map<string, Set<Polarity>>();

  constructor(rules: Key[]) {
    for (const r of rules) this.add(r);
  }

  private keyOf(r: Key): string {
    return `${r.project ? normName(r.project) : ''}\u0000${statementKey(r.statement)}`;
  }

  classify(r: Key): RuleStatus {
    const polarities = this.seen.get(this.keyOf(r));
    if (!polarities) return 'new';
    return polarities.has(r.polarity) ? 'duplicate' : 'conflict';
  }

  add(r: Key): void {
    const key = this.keyOf(r);
    const set = this.seen.get(key) ?? new Set<Polarity>();
    set.add(r.polarity);
    this.seen.set(key, set);
  }
}

const sameProject = (a: string | null, b: string | null): boolean =>
  a && b ? sameName(a, b) : !a && !b;

/**
 * Сколько ближайших кандидатов смотреть: правила других проектов не должны вытеснить дубль.
 * Проект в фильтр Qdrant не кладём (регистр), сравнение делает sameProject.
 */
const SEMANTIC_TOP_K = 20;

/** Смысловой дубль: в том же проекте и полярности есть правило с косинусом dense ≥ порога. */
export async function semanticDuplicate(
  deps: PrefDeps,
  e: Enrichment,
  dense: number[],
  text: string,
): Promise<boolean> {
  const base = buildPreferenceFilter({ polarity: e.polarity });
  // без проекта ищем точно: поле project пустое или отсутствует
  const filter = e.project ? base : andFilter(base, { must: [{ is_empty: { key: 'project' } }] });
  const hits = await deps.store.hybrid(dense, bm25Query(text), filter, SEMANTIC_TOP_K, {
    withDense: true,
  });
  return hits.some(
    (h) =>
      sameProject(h.preference.project, e.project) &&
      h.dense !== undefined &&
      cosine(dense, h.dense) >= IMPORT_DUPLICATE_SCORE,
  );
}

/**
 * Отбор правил к записи. Проход 1 (последовательно): дословные дубли и конфликты.
 * Проход 2: смысловые дубли, по 8 параллельно. Итоги пишутся в отчёт и в учёт записи.
 */
export async function dedupeRules(
  deps: PrefDeps,
  prepared: Prepared[],
  report: ImportReport,
  st: WriteState,
): Promise<Prepared[]> {
  const index = new ExactIndex(await deps.store.allPreferences(buildPreferenceFilter({})));
  const candidates: Prepared[] = [];
  for (const x of prepared) {
    const status = index.classify(x.rule.enrichment);
    if (status === 'new') {
      index.add(x.rule.enrichment);
      candidates.push(x);
      continue;
    }
    if (status === 'duplicate') report.duplicates++;
    else report.conflicts++;
    st.settled++;
  }
  const kept: Prepared[] = [];
  for (let i = 0; i < candidates.length; i += DEDUP_PARALLEL) {
    const chunk = candidates.slice(i, i + DEDUP_PARALLEL);
    const dups = await Promise.all(
      chunk.map((x) => semanticDuplicate(deps, x.rule.enrichment, x.dense, x.text)),
    );
    chunk.forEach((x, j) => {
      if (dups[j]) {
        report.duplicates++;
        st.settled++;
      } else kept.push(x);
    });
  }
  return kept;
}
