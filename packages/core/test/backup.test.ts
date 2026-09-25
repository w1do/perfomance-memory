import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { restoreBackup } from '../src/backup/restore.js';
import { latestBackupAge, listBackups, pruneBackups } from '../src/backup/retention.js';
import { createBackup } from '../src/backup/snapshot.js';
import { createLogger } from '../src/logger.js';
import { testCore } from './helpers.js';

const log = createLogger('silent', 't');

describe('Qdrant backups', () => {
  it('backup → data loss → restore brings points, folders and indexes back', async () => {
    const { core, ai, config, dataDir } = await testCore();
    ai.script('люблю рыбалку', {
      statement: 'Рыбалка',
      polarity: 'like',
      folder_path: ['Рыбалка', 'Люблю'],
      domain: 'fishing',
      tags: ['рыбалка', 'отдых', 'природа'],
    });
    const saved = await core.prefs.save({ text: 'люблю рыбалку', source: 'text' });
    const root = mkdtempSync(join(tmpdir(), 'pm-backup-'));

    const { dir, manifest } = await createBackup({
      qdrant: core.qdrant,
      config,
      log,
      root,
      dataDir,
    });
    expect(manifest.collections.map((c) => c.name).sort()).toEqual(
      [
        config.QDRANT_COLLECTION,
        `${config.QDRANT_COLLECTION}__service`,
        config.QDRANT_FOLDERS_COLLECTION,
      ].sort(),
    );
    expect(manifest.collections.every((c) => c.bytes > 0)).toBe(true);
    expect(manifest.preferences_md).toBe(true);
    expect(existsSync(join(dir, 'PREFERENCES.md'))).toBe(true);
    // snapshots are removed from the Qdrant server after download
    expect(await core.qdrant.listSnapshots(config.QDRANT_COLLECTION)).toHaveLength(0);

    await core.qdrant.deleteCollection(config.QDRANT_COLLECTION);
    await core.qdrant.deleteCollection(config.QDRANT_FOLDERS_COLLECTION);

    await restoreBackup({ config, log, dir });
    const back = await core.prefs.get(saved.preference?.id as string);
    expect(back.statement).toBe('Рыбалка');
    expect((await core.folders.byPath(['Рыбалка', 'Люблю']))?.preference_count).toBe(1);
    const info = await core.qdrant.getCollection(config.QDRANT_COLLECTION);
    expect(Object.keys(info.payload_schema ?? {})).toContain('folder_ancestors');
    expect((await core.prefs.search('рыбалка', {}, 3))[0]?.preference.id).toBe(
      saved.preference?.id,
    );
  }, 180_000); // снимки Qdrant тяжелее обычных запросов, особенно при параллельных тестах

  it('keeps the newest N copies, drops *.partial, reports freshness', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pm-retention-'));
    const stamps = [
      '2026-01-01T00-00-00-000Z',
      '2026-01-02T00-00-00-000Z',
      '2026-01-03T00-00-00-000Z',
    ];
    for (const s of stamps) {
      await mkdir(join(root, s));
      writeFileSync(
        join(root, s, 'manifest.json'),
        JSON.stringify({ created_at: s.slice(0, 10) + 'T00:00:00Z' }),
      );
    }
    await mkdir(join(root, '2026-01-04T00-00-00-000Z.partial'));
    await mkdir(join(root, 'no-manifest'));

    expect(await listBackups(root)).toEqual(stamps);
    const removed = await pruneBackups(root, 2, log);
    expect(removed.sort()).toEqual([
      '2026-01-01T00-00-00-000Z',
      '2026-01-04T00-00-00-000Z.partial',
    ]);
    expect(await listBackups(root)).toEqual(stamps.slice(1));
    const age = await latestBackupAge(root, Date.parse('2026-01-03T06:00:00Z'));
    expect(age).toBe(6 * 3600_000);
    expect(await latestBackupAge(mkdtempSync(join(tmpdir(), 'pm-empty-')))).toBeNull();
  });
});
