/** Эмбеддинги при импорте батчами по 64: упавший батч даёт null своим элементам, остальные считаются. */
import type { PrefDeps } from '../preferences/deps.js';
export const EMBED_BATCH = 64;

/** Текст ошибки для логов и отчёта: только message, без объекта ошибки целиком. */
export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

export async function embedBatches(deps: PrefDeps, texts: string[]): Promise<(number[] | null)[]> {
  const out: (number[] | null)[] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const chunk = texts.slice(i, i + EMBED_BATCH);
    try {
      const vectors = await deps.ai.embed(chunk);
      out.push(...chunk.map((_, j) => vectors[j] ?? null));
    } catch (err) {
      deps.log.warn(
        { err: errorMessage(err), from: i, size: chunk.length },
        'import embeddings failed',
      );
      out.push(...chunk.map(() => null));
    }
    deps.log.info(
      { done: Math.min(i + EMBED_BATCH, texts.length), total: texts.length },
      'import embeddings',
    );
  }
  return out;
}
