import type { FolderService } from '../folders/service.js';
import type { Logger } from '../logger.js';
import { buildPayload, embeddingText } from '../preferences/payload.js';
import type { AiProvider } from '../ai/provider.js';
import type { Store } from '../qdrant/store.js';
import { bm25Document } from '../text/bm25.js';
import { LEVEL_STRENGTH } from '../types.js';
import { DEMO } from './demoData.js';

/** Demo data only when SEED_DEMO=true and the base is empty. */
export async function seedDemo(
  store: Store,
  folders: FolderService,
  ai: AiProvider,
  log: Logger,
): Promise<boolean> {
  if ((await store.countPreferences({})) > 0 || (await store.countFolders()) > 0) return false;
  for (const d of DEMO) {
    const { folder } = await folders.ensurePath(d.folder_path, d.domain);
    const payload = buildPayload({
      enrichment: {
        why: null,
        example_good: null,
        example_bad: null,
        ...d,
        kind: 'preference',
        language: 'ru',
        strength: LEVEL_STRENGTH[d.level],
      },
      folder,
      rawText: `${d.polarity === 'like' ? 'люблю' : 'не люблю'}: ${d.statement}`,
      source: 'text',
    });
    const text = embeddingText(payload);
    const [dense] = await ai.embed([text]);
    await store.upsertPreference(payload, dense as number[], bm25Document(text));
  }
  await folders.recount();
  log.info({ preferences: DEMO.length }, 'demo data seeded (SEED_DEMO=true)');
  return true;
}
