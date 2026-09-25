import type { QdrantClient } from '@qdrant/js-client-rest';
import type { Config } from '../env.js';
import type { Logger } from '../logger.js';
import {
  CONFIG_POINT_ID,
  DENSE,
  FOLDER_INDEXES,
  PREFERENCE_INDEXES,
  SCHEMA_VERSION,
  SPARSE,
  indexTypeName,
  metaCollectionName,
  type IndexSpec,
} from './schema.js';

export interface StoredEmbeddingConfig {
  embed_model: string;
  embed_dim: number;
  schema_version: number;
  updated_at: string;
}

async function exists(qdrant: QdrantClient, name: string): Promise<boolean> {
  return (await qdrant.collectionExists(name)).exists;
}

export async function createPreferencesCollection(
  qdrant: QdrantClient,
  config: Config,
): Promise<void> {
  await qdrant.createCollection(config.QDRANT_COLLECTION, {
    vectors: { [DENSE]: { size: config.EMBED_DIM, distance: 'Cosine' } },
    sparse_vectors: { [SPARSE]: { modifier: 'idf' } },
  });
}

export async function createFoldersCollection(qdrant: QdrantClient, config: Config): Promise<void> {
  await qdrant.createCollection(config.QDRANT_FOLDERS_COLLECTION, {
    vectors: { [DENSE]: { size: config.EMBED_DIM, distance: 'Cosine' } },
  });
}

/** Creates missing payload indexes; recreates ones with a wrong type. Idempotent. */
export async function ensureIndexes(
  qdrant: QdrantClient,
  collection: string,
  specs: IndexSpec[],
  log: Logger,
): Promise<void> {
  const info = await qdrant.getCollection(collection);
  const current = (info.payload_schema ?? {}) as Record<string, { data_type?: string }>;
  for (const spec of specs) {
    const want = indexTypeName(spec.schema);
    const have = current[spec.field]?.data_type;
    if (have === want) continue;
    if (have) {
      log.warn({ collection, field: spec.field, have, want }, 'index type mismatch, recreating');
      await qdrant.deletePayloadIndex(collection, spec.field, { wait: true });
    }
    await qdrant.createPayloadIndex(collection, {
      field_name: spec.field,
      field_schema: spec.schema,
      wait: true,
    });
    log.info({ collection, field: spec.field, type: want }, 'payload index created');
  }
}

export async function readStoredConfig(
  qdrant: QdrantClient,
  config: Config,
): Promise<StoredEmbeddingConfig | null> {
  const meta = metaCollectionName(config.QDRANT_COLLECTION);
  if (!(await exists(qdrant, meta))) return null;
  const points = await qdrant.retrieve(meta, { ids: [CONFIG_POINT_ID], with_payload: true });
  return (points[0]?.payload as unknown as StoredEmbeddingConfig | undefined) ?? null;
}

export async function writeStoredConfig(qdrant: QdrantClient, config: Config): Promise<void> {
  const meta = metaCollectionName(config.QDRANT_COLLECTION);
  if (!(await exists(qdrant, meta))) {
    await qdrant.createCollection(meta, { vectors: { size: 1, distance: 'Dot' } });
  }
  const payload: StoredEmbeddingConfig = {
    embed_model: config.OPENAI_EMBED_MODEL,
    embed_dim: config.EMBED_DIM,
    schema_version: SCHEMA_VERSION,
    updated_at: new Date().toISOString(),
  };
  await qdrant.upsert(meta, {
    wait: true,
    points: [{ id: CONFIG_POINT_ID, vector: [1], payload: { ...payload } }],
  });
}

async function denseSize(qdrant: QdrantClient, collection: string): Promise<number | null> {
  const info = await qdrant.getCollection(collection);
  const vectors = info.config.params.vectors as Record<string, { size?: number }> | undefined;
  return vectors?.[DENSE]?.size ?? null;
}

export type SchemaState = 'fresh' | 'ok' | 'needs_reindex';

/**
 * Ensures collections, indexes and the service config point.
 * Returns "needs_reindex" when the stored embedding model/dim differs from .env.
 */
export async function ensureSchema(
  qdrant: QdrantClient,
  config: Config,
  log: Logger,
): Promise<SchemaState> {
  const prefsExists = await exists(qdrant, config.QDRANT_COLLECTION);
  const foldersExists = await exists(qdrant, config.QDRANT_FOLDERS_COLLECTION);
  const state: SchemaState = prefsExists || foldersExists ? 'ok' : 'fresh';

  if (prefsExists || foldersExists) {
    const stored = await readStoredConfig(qdrant, config);
    const sizes = await Promise.all(
      [prefsExists && config.QDRANT_COLLECTION, foldersExists && config.QDRANT_FOLDERS_COLLECTION]
        .filter((c): c is string => Boolean(c))
        .map((c) => denseSize(qdrant, c)),
    );
    const dimMismatch = sizes.some((s) => s !== config.EMBED_DIM);
    const modelMismatch = stored !== null && stored.embed_model !== config.OPENAI_EMBED_MODEL;
    if (dimMismatch || modelMismatch) {
      log.warn(
        {
          stored_model: stored?.embed_model ?? null,
          stored_dim: stored?.embed_dim ?? sizes[0] ?? null,
          model: config.OPENAI_EMBED_MODEL,
          dim: config.EMBED_DIM,
        },
        'embedding config changed in .env — reindex required',
      );
      return 'needs_reindex';
    }
  }

  if (!prefsExists) {
    await createPreferencesCollection(qdrant, config);
    log.info({ collection: config.QDRANT_COLLECTION }, 'collection created');
  }
  if (!foldersExists) {
    await createFoldersCollection(qdrant, config);
    log.info({ collection: config.QDRANT_FOLDERS_COLLECTION }, 'collection created');
  }
  await ensureIndexes(qdrant, config.QDRANT_COLLECTION, PREFERENCE_INDEXES, log);
  await ensureIndexes(qdrant, config.QDRANT_FOLDERS_COLLECTION, FOLDER_INDEXES, log);
  await writeStoredConfig(qdrant, config);
  return state;
}

/** Waits until Qdrant answers (compose also waits for the healthcheck). */
export async function waitForQdrant(
  qdrant: QdrantClient,
  log: Logger,
  attempts = 30,
): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await qdrant.getCollections();
      return;
    } catch (err) {
      if (i === attempts) throw err;
      log.info({ attempt: i }, 'waiting for qdrant');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
