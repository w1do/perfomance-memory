/**
 * Сервис backups: при старте и затем каждые BACKUP_INTERVAL_HOURS снимает все коллекции Qdrant в volume backups,
 * оставляет BACKUP_KEEP последних копий. Вся логика — в packages/core/backup; здесь только расписание.
 */
import {
  createBackup,
  createLogger,
  createQdrant,
  loadConfigOrExit,
  pruneBackups,
  waitForQdrant,
} from '@preference-memory/core';
import { BACKUP_ROOT, DATA_DIR } from './paths.js';

const config = loadConfigOrExit();
const log = createLogger(config.LOG_LEVEL, 'backup');
const qdrant = createQdrant(config);
const intervalMs = config.BACKUP_INTERVAL_HOURS * 3600_000;

async function runOnce(): Promise<void> {
  const started = Date.now();
  try {
    const { dir, manifest } = await createBackup({
      qdrant,
      config,
      log,
      root: BACKUP_ROOT,
      dataDir: DATA_DIR,
    });
    const bytes = manifest.collections.reduce((s, c) => s + c.bytes, 0);
    log.info(
      { dir, collections: manifest.collections.length, bytes, ms: Date.now() - started },
      'backup done',
    );
    await pruneBackups(BACKUP_ROOT, config.BACKUP_KEEP, log);
  } catch (err) {
    // healthcheck покраснеет сам: свежей копии не появится
    log.error({ err: { message: (err as Error).message } }, 'backup failed');
  }
}

await waitForQdrant(qdrant, log);
log.info(
  { every_hours: config.BACKUP_INTERVAL_HOURS, keep: config.BACKUP_KEEP },
  'backup service started',
);
await runOnce();
const timer = setInterval(() => void runOnce(), intervalMs);
const stop = () => {
  clearInterval(timer);
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
