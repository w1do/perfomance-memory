/** Каталоги сервиса бэкапов внутри контейнера: копии (volume backups) и data/ с PREFERENCES.md (только чтение). */
import { resolve } from 'node:path';

export const BACKUP_ROOT = resolve('backups');
export const DATA_DIR = resolve('data');
