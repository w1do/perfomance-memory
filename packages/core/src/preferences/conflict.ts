/**
 * Поиск конфликта/дубля: гибридный поиск (RRF) в том же domain (и project) → кандидаты со сходством ≥ CONFLICT_SCORE
 * → топ-5 → решает LLM. Сходство — максимум из косинуса сохранённых векторов и косинуса исходных фраз:
 * противоположные правила лежат в разных папках, их векторы расходятся, а фразы остаются близки.
 */
import type { ConflictDecision } from '../ai/provider.js';
import { buildPreferenceFilter } from '../qdrant/filters.js';
import { bm25Query } from '../text/bm25.js';
import type { Enrichment, PreferencePayload } from '../types.js';
import type { PrefDeps } from './deps.js';

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export async function findConflict(
  deps: PrefDeps,
  e: Enrichment,
  rawText: string,
  dense: number[],
  text: string,
): Promise<{ decision: ConflictDecision; target: PreferencePayload | null }> {
  const filter = buildPreferenceFilter({ domain: e.domain, project: e.project ?? undefined });
  const pool = await deps.store.hybrid(dense, bm25Query(text), filter, 10, { withDense: true });
  let candidates: { preference: PreferencePayload; score: number }[] = [];
  if (pool.length) {
    const [rawNew, ...rawOld] = await deps.ai.embed([
      rawText,
      ...pool.map((c) => c.preference.raw_text),
    ]);
    candidates = pool
      .map((c, i) => ({
        preference: c.preference,
        score: Math.max(
          c.dense ? cosine(dense, c.dense) : 0,
          cosine(rawNew as number[], rawOld[i] as number[]),
        ),
      }))
      .filter((c) => c.score >= deps.config.CONFLICT_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }
  deps.log.info(
    { pool: pool.length, candidates: candidates.length, best: candidates[0]?.score ?? null },
    'conflict candidates',
  );
  if (!candidates.length) {
    return {
      decision: { decision: 'new', target_id: null, reason: 'похожих правил нет' },
      target: null,
    };
  }
  const decision = await deps.ai.decideConflict(
    {
      statement: e.statement,
      details: e.details,
      polarity: e.polarity,
      constraints: e.constraints,
      raw_text: rawText,
    },
    candidates.map(({ preference: p }) => ({
      id: p.id,
      statement: p.statement,
      details: p.details,
      polarity: p.polarity,
      folder_path: p.folder_path,
      constraints: p.constraints,
      strength: p.strength,
    })),
  );
  const target = candidates.find((c) => c.preference.id === decision.target_id)?.preference ?? null;
  deps.log.info(
    { candidates: candidates.length, decision: decision.decision, target: target?.id ?? null },
    'conflict check',
  );
  if (decision.decision !== 'new' && !target) {
    return { decision: { ...decision, decision: 'new' }, target: null };
  }
  return { decision, target };
}
