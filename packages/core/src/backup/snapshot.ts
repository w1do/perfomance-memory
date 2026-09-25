/**
 * Бэкап Qdrant нативными снимками: для каждой коллекции сервиса снимок → выгрузка файла → удаление снимка на
 * сервере. Каталог копии пишется как <stamp>.partial и переименовывается только после успеха (атомарно).
 */
import { createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { QdrantClient } from '@qdrant/js-client-rest';
import type { Config } from '../env.js';
import { MAIN_FILE } from '../export/writer.js';
import type { Logger } from '../logger.js';
import { metaCollectionName, SCHEMA_VERSION } from '../qdrant/schema.js';

export const MANIFEST = 'manifest.json';

export interface BackupManifest {
  created_at: string;
  embed_model: string;
  embed_dim: number;
  schema_version: number;
  collections: { name: string; file: string; bytes: number }[];
  preferences_md: boolean;
}

/** Все коллекции сервиса: правила, папки и служебная коллекция с конфигурацией эмбеддингов. */
export function backupCollections(config: Config): string[] {
  return [
    config.QDRANT_COLLECTION,
    config.QDRANT_FOLDERS_COLLECTION,
    metaCollectionName(config.QDRANT_COLLECTION),
  ];
}

export function qdrantHeaders(config: Config): Record<string, string> {
  return config.QDRANT_API_KEY ? { 'api-key': config.QDRANT_API_KEY } : {};
}

const stampNow = () => new Date().toISOString().replace(/[:.]/g, '-');

async function download(config: Config, collection: string, snapshot: string, target: string) {
  const url = `${config.QDRANT_URL}/collections/${collection}/snapshots/${encodeURIComponent(snapshot)}`;
  const res = await fetch(url, { headers: qdrantHeaders(config) });
  if (!res.ok || !res.body)
    throw new Error(`Не удалось выгрузить снимок ${collection}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(target));
}

export async function createBackup(args: {
  qdrant: QdrantClient;
  config: Config;
  log: Logger;
  root: string;
  dataDir?: string | null;
}): Promise<{ dir: string; manifest: BackupManifest }> {
  const { qdrant, config, log, root } = args;
  const dir = join(root, stampNow());
  const partial = `${dir}.partial`;
  await mkdir(partial, { recursive: true });

  const collections: BackupManifest['collections'] = [];
  for (const name of backupCollections(config)) {
    if (!(await qdrant.collectionExists(name)).exists) continue;
    const snap = await qdrant.createSnapshot(name, { wait: true });
    if (!snap) throw new Error(`Qdrant не создал снимок коллекции ${name}`);
    const file = `${name}.snapshot`;
    try {
      await download(config, name, snap.name, join(partial, file));
    } finally {
      await qdrant.deleteSnapshot(name, snap.name).catch(() => undefined);
    }
    const bytes = (await stat(join(partial, file))).size;
    collections.push({ name, file, bytes });
    log.info({ collection: name, bytes }, 'collection snapshot saved');
  }

  const md = args.dataDir ? join(args.dataDir, MAIN_FILE) : null;
  const withMd = md !== null && existsSync(md);
  if (withMd) await copyFile(md, join(partial, MAIN_FILE));

  const manifest: BackupManifest = {
    created_at: new Date().toISOString(),
    embed_model: config.OPENAI_EMBED_MODEL,
    embed_dim: config.EMBED_DIM,
    schema_version: SCHEMA_VERSION,
    collections,
    preferences_md: withMd,
  };
  await writeFile(join(partial, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(partial, dir);
  return { dir, manifest };
}
