/**
 * Восстановление: `docker compose run --rm backup node apps/backup/dist/restore.js [имя-копии|latest]`.
 * Без аргумента — список копий. После восстановления перезапустите api и mcp: docker compose restart api mcp.
 */
import { join } from 'node:path';
import {
  createLogger,
  listBackups,
  loadConfigOrExit,
  restoreBackup,
} from '@preference-memory/core';
import { BACKUP_ROOT } from './paths.js';

const config = loadConfigOrExit();
const log = createLogger(config.LOG_LEVEL, 'restore');
const backups = await listBackups(BACKUP_ROOT);
const wanted = process.argv[2];

if (!wanted) {
  console.log(
    backups.length ? `Копии (старые → новые):\n${backups.join('\n')}` : 'Копий пока нет.',
  );
  console.log('Восстановить: restore.js <имя> или restore.js latest');
  process.exit(0);
}
const name = wanted === 'latest' ? backups.at(-1) : backups.find((b) => b === wanted);
if (!name) {
  console.error(`Копия «${wanted}» не найдена. Доступные: ${backups.join(', ') || 'нет'}`);
  process.exit(1);
}
const manifest = await restoreBackup({ config, log, dir: join(BACKUP_ROOT, name) });
console.log(`Восстановлено из ${name}: ${manifest.collections.map((c) => c.name).join(', ')}.`);
console.log('Перезапустите api и mcp: docker compose restart api mcp');
