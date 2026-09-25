/** Общие зависимости модулей сервиса правил (сохранение, конфликты, запросы). */
import type { AiProvider } from '../ai/provider.js';
import type { Config } from '../env.js';
import type { FolderService } from '../folders/service.js';
import type { Logger } from '../logger.js';
import type { Store } from '../qdrant/store.js';
import { bm25Document } from '../text/bm25.js';
import type { PreferencePayload } from '../types.js';
import { embeddingText } from './payload.js';

export interface PrefDeps {
  store: Store;
  folders: FolderService;
  ai: AiProvider;
  config: Config;
  log: Logger;
}

/** Пересчитывает dense + BM25 по тексту правила и сохраняет точку. */
export async function upsertWithVectors(deps: PrefDeps, p: PreferencePayload): Promise<void> {
  const text = embeddingText(p);
  const [dense] = await deps.ai.embed([text]);
  await deps.store.upsertPreference(p, dense as number[], bm25Document(text));
}
