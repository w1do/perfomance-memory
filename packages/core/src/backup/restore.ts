/**
 * Восстановление из копии: каждый снимок загружается в Qdrant (upload, priority=snapshot) — коллекция
 * пересоздаётся ровно в состоянии снимка, вместе с векторами и payload-индексами.
 */
import { openAsBlob } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../env.js';
import type { Logger } from '../logger.js';
import { readManifest } from './retention.js';
import { qdrantHeaders } from './snapshot.js';

export async function restoreBackup(args: { config: Config; log: Logger; dir: string }) {
  const { config, log, dir } = args;
  const manifest = await readManifest(dir);
  if (
    manifest.embed_dim !== config.EMBED_DIM ||
    manifest.embed_model !== config.OPENAI_EMBED_MODEL
  ) {
    log.warn(
      { backup: { model: manifest.embed_model, dim: manifest.embed_dim } },
      'backup was made with another embedding config — api will reindex on next start',
    );
  }
  for (const c of manifest.collections) {
    const form = new FormData();
    form.append('snapshot', await openAsBlob(join(dir, c.file)), c.file);
    const url = `${config.QDRANT_URL}/collections/${c.name}/snapshots/upload?priority=snapshot&wait=true`;
    const res = await fetch(url, { method: 'POST', headers: qdrantHeaders(config), body: form });
    if (!res.ok) {
      throw new Error(`Не удалось восстановить ${c.name}: HTTP ${res.status} ${await res.text()}`);
    }
    log.info({ collection: c.name, bytes: c.bytes }, 'collection restored');
  }
  return manifest;
}
