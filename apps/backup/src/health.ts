/**
 * Healthcheck контейнера backups: здоров, только если последняя готовая копия моложе двух интервалов
 * (метка свежей копии). Нет копии или она устарела — exit 1, контейнер становится unhealthy.
 */
import { latestBackupAge, loadConfig } from '@preference-memory/core';
import { BACKUP_ROOT } from './paths.js';

try {
  const config = loadConfig();
  const age = await latestBackupAge(BACKUP_ROOT);
  const limit = 2 * config.BACKUP_INTERVAL_HOURS * 3600_000;
  if (age === null || age > limit) {
    console.error(
      age === null
        ? 'нет ни одной копии'
        : `последняя копия старше ${Math.round(age / 3600_000)} ч`,
    );
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
