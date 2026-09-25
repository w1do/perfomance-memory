/**
 * Список, ротация и свежесть бэкапов в каталоге. Копия считается готовой, только если в ней есть manifest.json;
 * брошенные каталоги *.partial (упавший бэкап) удаляются при ротации.
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '../logger.js';
import { MANIFEST, type BackupManifest } from './snapshot.js';

/** Готовые копии по возрастанию времени (имя каталога — ISO-штамп). */
export async function listBackups(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.endsWith('.partial'))
    .map((e) => e.name)
    .filter((name) => existsSync(join(root, name, MANIFEST)))
    .sort();
}

export async function readManifest(dir: string): Promise<BackupManifest> {
  return JSON.parse(await readFile(join(dir, MANIFEST), 'utf8')) as BackupManifest;
}

/** Оставляет `keep` последних копий, удаляет остальные и брошенные *.partial. */
export async function pruneBackups(root: string, keep: number, log: Logger): Promise<string[]> {
  if (!existsSync(root)) return [];
  const removed: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory() && e.name.endsWith('.partial')) {
      await rm(join(root, e.name), { recursive: true, force: true });
      removed.push(e.name);
    }
  }
  const ready = await listBackups(root);
  for (const name of ready.slice(0, Math.max(0, ready.length - keep))) {
    await rm(join(root, name), { recursive: true, force: true });
    removed.push(name);
  }
  if (removed.length) log.info({ removed }, 'old backups pruned');
  return removed;
}

/** Возраст последней готовой копии в миллисекундах или null, если копий нет. */
export async function latestBackupAge(root: string, now = Date.now()): Promise<number | null> {
  const ready = await listBackups(root);
  const last = ready.at(-1);
  if (!last) return null;
  const manifest = await readManifest(join(root, last));
  return now - Date.parse(manifest.created_at);
}
