/**
 * Черновик правила для сохранения: обогащение, исходная фраза и эмбеддинг текста правила.
 * Готовится вне замка записи — эмбеддинг не зависит от хранилища.
 */
import type { Enrichment } from '../types.js';
import type { PrefDeps } from './deps.js';
import { embeddingText } from './payload.js';

export interface Draft {
  enrichment: Enrichment;
  rawText: string;
  /** embeddingText(enrichment) */
  text: string;
  /** dense-вектор text; пустой у project_only — такие черновики не ищут и не сохраняют как правило */
  dense: number[];
}

export async function prepareDraft(deps: PrefDeps, e: Enrichment, rawText: string): Promise<Draft> {
  if (e.kind === 'project_only') return { enrichment: e, rawText, text: '', dense: [] };
  const text = embeddingText(e);
  const [dense] = await deps.ai.embed([text]);
  return { enrichment: e, rawText, text, dense: dense as number[] };
}
