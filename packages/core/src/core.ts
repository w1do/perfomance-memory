import { resolve } from 'node:path';
import type { QdrantClient } from '@qdrant/js-client-rest';
import { OpenAiProvider } from './ai/openai.js';
import type { AiProvider } from './ai/provider.js';
import { contextForTask } from './context/task.js';
import type { Config } from './env.js';
import { buildMarkdown } from './export/markdown.js';
import { writeMainFile } from './export/writer.js';
import { FolderService } from './folders/service.js';
import { splitPath } from './folders/tree.js';
import type { Logger } from './logger.js';
import { PreferenceService } from './preferences/service.js';
import { createQdrant } from './qdrant/client.js';
import { existsSync } from 'node:fs';
import { reindexAll, reindexBackupPath } from './qdrant/reindex.js';
import { ensureSchema, waitForQdrant } from './qdrant/setup.js';
import { Store } from './qdrant/store.js';
import { seedDemo } from './seed/demo.js';

export interface CoreOptions {
  config: Config;
  log: Logger;
  ai?: AiProvider;
  qdrant?: QdrantClient;
  /** where PREFERENCES.md lives; null disables writing the file */
  dataDir?: string | null;
}

export type Core = ReturnType<typeof createCore>;

export function createCore(opts: CoreOptions) {
  const { config, log } = opts;
  const ai = opts.ai ?? new OpenAiProvider(config, log.child({ module: 'openai' }));
  const qdrant = opts.qdrant ?? createQdrant(config);
  const dataDir = opts.dataDir === undefined ? resolve('data') : opts.dataDir;
  const store = new Store(qdrant, config);
  const folders = new FolderService(store, ai);

  async function exportMarkdown(folder?: string): Promise<string> {
    const rootPath = folder ? splitPath(folder) : undefined;
    const [tree, all] = await Promise.all([
      folders.tree(),
      store.allPreferences({ must: [{ key: 'is_active', match: { value: true } }] }),
    ]);
    return buildMarkdown(tree, all, { rootPath });
  }

  async function rebuildMainFile(): Promise<void> {
    if (!dataDir) return;
    const path = await writeMainFile(dataDir, await exportMarkdown());
    log.debug({ path }, 'PREFERENCES.md rebuilt');
  }

  const prefs = new PreferenceService(
    store,
    folders,
    ai,
    config,
    log.child({ module: 'pipeline' }),
    rebuildMainFile,
  );

  /**
   * Startup: wait for Qdrant, create/verify collections, indexes and the config point,
   * reindex if the embedding model/dim changed (only the owner process does it), seed demo data.
   */
  async function bootstrap(options: { owner: boolean }): Promise<void> {
    await waitForQdrant(qdrant, log);
    for (;;) {
      const pendingBackup = dataDir !== null && existsSync(reindexBackupPath(dataDir));
      const state = await ensureSchema(qdrant, config, log);
      if (state !== 'needs_reindex' && !(options.owner && pendingBackup)) break;
      if (options.owner && dataDir) {
        await reindexAll(qdrant, config, ai, log, dataDir);
        continue;
      }
      log.info('waiting for the api service to finish reindexing');
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (options.owner && config.SEED_DEMO) {
      await seedDemo(store, folders, ai, log);
    }
    if (options.owner) await rebuildMainFile();
  }

  return {
    config,
    log,
    ai,
    qdrant,
    store,
    folders,
    prefs,
    dataDir,
    bootstrap,
    exportMarkdown,
    rebuildMainFile,
    contextForTask: (input: {
      task: string;
      applies_to?: string[] | undefined;
      top_k?: number | undefined;
    }) =>
      contextForTask(
        { ai, prefs, folders, log },
        {
          task: input.task,
          applies_to: input.applies_to,
          top_k: input.top_k ?? config.SEARCH_TOP_K,
        },
      ),
  };
}
