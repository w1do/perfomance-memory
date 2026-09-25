import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { QdrantClient } from '@qdrant/js-client-rest';
import type { AiProvider } from '../ai/provider.js';
import type { Config } from '../env.js';
import { folderEmbeddingText } from '../folders/service.js';
import type { Logger } from '../logger.js';
import { embeddingText } from '../preferences/payload.js';
import { bm25Document } from '../text/bm25.js';
import type { FolderPayload, PreferencePayload } from '../types.js';
import {
  createFoldersCollection,
  createPreferencesCollection,
  ensureIndexes,
  writeStoredConfig,
} from './setup.js';
import { FOLDER_INDEXES, PREFERENCE_INDEXES } from './schema.js';
import { Store } from './store.js';

const BACKUP = 'reindex-backup.json';
const BATCH = 64;

interface Backup {
  folders: FolderPayload[];
  preferences: PreferencePayload[];
}

export function reindexBackupPath(dataDir: string): string {
  return join(dataDir, BACKUP);
}

/**
 * Recreates both collections with the embedding model/dim from .env and re-embeds every point.
 * Payload is preserved. A backup file in data/ makes the process resumable after a crash.
 */
export async function reindexAll(
  qdrant: QdrantClient,
  config: Config,
  ai: AiProvider,
  log: Logger,
  dataDir: string,
): Promise<void> {
  const store = new Store(qdrant, config);
  const backupFile = reindexBackupPath(dataDir);
  let backup: Backup;
  if (existsSync(backupFile)) {
    backup = JSON.parse(await readFile(backupFile, 'utf8')) as Backup;
    log.warn({ file: backupFile }, 'resuming unfinished reindex from backup');
  } else {
    const prefsExist = (await qdrant.collectionExists(config.QDRANT_COLLECTION)).exists;
    const foldersExist = (await qdrant.collectionExists(config.QDRANT_FOLDERS_COLLECTION)).exists;
    backup = {
      folders: foldersExist ? await store.allFolders() : [],
      preferences: prefsExist ? await store.allPreferences({}) : [],
    };
    await mkdir(dataDir, { recursive: true });
    await writeFile(backupFile, JSON.stringify(backup), 'utf8');
  }
  const total = backup.folders.length + backup.preferences.length;
  log.info(
    { folders: backup.folders.length, preferences: backup.preferences.length },
    'reindex started',
  );

  for (const name of [config.QDRANT_COLLECTION, config.QDRANT_FOLDERS_COLLECTION]) {
    if ((await qdrant.collectionExists(name)).exists) await qdrant.deleteCollection(name);
  }
  await createPreferencesCollection(qdrant, config);
  await createFoldersCollection(qdrant, config);
  await ensureIndexes(qdrant, config.QDRANT_COLLECTION, PREFERENCE_INDEXES, log);
  await ensureIndexes(qdrant, config.QDRANT_FOLDERS_COLLECTION, FOLDER_INDEXES, log);

  let done = 0;
  for (let i = 0; i < backup.folders.length; i += BATCH) {
    const chunk = backup.folders.slice(i, i + BATCH);
    const vectors = await ai.embed(chunk.map(folderEmbeddingText));
    await store.upsertFolders(
      chunk.map((payload, j) => ({ payload, dense: vectors[j] as number[] })),
    );
    done += chunk.length;
    log.info({ done, total }, `переиндексация: ${done}/${total}`);
  }
  for (let i = 0; i < backup.preferences.length; i += BATCH) {
    const chunk = backup.preferences.slice(i, i + BATCH);
    const texts = chunk.map(embeddingText);
    const vectors = await ai.embed(texts);
    await store.upsertPreferences(
      chunk.map((payload, j) => ({
        payload,
        dense: vectors[j] as number[],
        sparse: bm25Document(texts[j] as string),
      })),
    );
    done += chunk.length;
    log.info({ done, total }, `переиндексация: ${done}/${total}`);
  }
  await writeStoredConfig(qdrant, config);
  await rm(backupFile, { force: true });
  log.info({ total, model: config.OPENAI_EMBED_MODEL, dim: config.EMBED_DIM }, 'reindex finished');
}
