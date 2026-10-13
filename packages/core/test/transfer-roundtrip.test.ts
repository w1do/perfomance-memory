import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FolderError } from '../src/folders/service.js';
import { MAIN_FILE } from '../src/export/writer.js';
import { PreferenceError } from '../src/preferences/schemas.js';
import { buildPreferenceFilter } from '../src/qdrant/filters.js';
import type { Core } from '../src/core.js';
import type { FakeAi } from './fake-ai.js';
import { testCore } from './helpers.js';
import { dropCollections, seedSource } from './transfer-fixtures.js';

const EXPORT_ALL = { all: true, folder_ids: [], name: 'Тест', author: null, description: null };

interface Env {
  core: Core;
  ai: FakeAi;
  dataDir: string;
}

describe('schema round-trip: export → import', () => {
  let source: Env;
  let target: Env;

  beforeAll(async () => {
    source = await testCore();
    await seedSource(source.core, source.ai);
    target = await testCore();
  });

  afterAll(async () => {
    await dropCollections(source.core);
    await dropCollections(target.core);
  });

  it('exports without ids, vectors or service fields', async () => {
    const pkg = await source.core.transfer.export(EXPORT_ALL);
    const json = JSON.stringify(pkg);
    const rules = await source.core.store.allPreferences(buildPreferenceFilter({}));
    const folders = await source.core.folders.list();
    for (const r of rules) expect(json).not.toContain(r.id);
    for (const f of folders) expect(json).not.toContain(f.id);
    expect(json).not.toContain('"source"');
    expect(json).not.toContain('distinct_from');
    expect(json).not.toContain('folder_id');
    expect(pkg.counts.preferences).toBe(3);
  });

  it('previews an empty target without duplicates', async () => {
    const pkg = JSON.parse(JSON.stringify(await source.core.transfer.export(EXPORT_ALL)));
    const preview = await target.core.transfer.preview(pkg);
    expect(preview.counts.rules).toBe(3);
    expect(preview.counts.duplicates).toBe(0);
    expect(preview.counts.new_folders).toBe(preview.counts.folders);
  });

  it('applies the package to an empty target and keeps the metadata', async () => {
    const pkg = JSON.parse(JSON.stringify(await source.core.transfer.export(EXPORT_ALL)));
    const sourceFolders = await source.core.folders.list();
    const report = await target.core.transfer.apply(pkg, { all: true, folders: [] });
    expect(report.rules_created).toBe(3);
    expect(report.errors).toBe(0);
    expect(report.folders_created).toBe(sourceFolders.length);
    // импорт не обращается к LLM: ни обогащения, ни решения о конфликте
    expect(target.ai.lastEnrichInput).toBeNull();
    expect(target.ai.conflictCalls).toHaveLength(0);

    const rules = await target.core.store.allPreferences(buildPreferenceFilter({}));
    const sourceRules = await source.core.store.allPreferences(buildPreferenceFilter({}));
    expect(rules.every((r) => r.source === 'import')).toBe(true);
    expect(rules.some((r) => sourceRules.some((s) => s.id === r.id))).toBe(false);
    const code = rules.find((r) => r.statement === 'Файлы длиннее 100 строк');
    expect(code?.constraints).toEqual([
      { metric: 'file_lines', operator: '<=', value: 100, unit: 'lines' },
    ]);
    expect(code?.constraint_metrics).toEqual(['file_lines']);
    expect(code?.level).toBe('hard');
    expect(code?.why).toBe('Длинные файлы трудно читать');
    expect(code?.folder_depth).toBe(3);
    expect(code?.folder_ancestors).toEqual([
      'Программирование',
      'Программирование/Код',
      'Программирование/Код/Не люблю',
    ]);

    const tree = await target.core.folders.tree();
    expect(tree.find((n) => n.name === 'Программирование')?.total_count).toBe(1);
    const md = readFileSync(join(target.dataDir, MAIN_FILE), 'utf8');
    expect(md).toContain('Файлы длиннее 100 строк');
  });

  it('does not add anything when the same file is applied again', async () => {
    const pkg = JSON.parse(JSON.stringify(await source.core.transfer.export(EXPORT_ALL)));
    const before = (await target.core.folders.list()).length;
    const report = await target.core.transfer.apply(pkg, { all: true, folders: [] });
    expect(report.rules_created).toBe(0);
    expect(report.duplicates).toBe(3);
    expect(report.folders_created).toBe(0);
    expect((await target.core.folders.list()).length).toBe(before);
    expect(await target.core.store.countPreferences(buildPreferenceFilter({}))).toBe(3);
  });

  it('exports a subtree with its ancestors and only its rules', async () => {
    const code = (await source.core.folders.list()).find((f) => f.name === 'Код');
    const pkg = await source.core.transfer.export({
      ...EXPORT_ALL,
      all: false,
      folder_ids: [code?.id ?? ''],
    });
    const paths = pkg.folders.map((f) => f.path.join('/'));
    expect(paths).toContain('Программирование');
    expect(paths).toContain('Программирование/Код');
    expect(pkg.preferences.map((p) => p.statement)).toEqual(['Файлы длиннее 100 строк']);
  });

  it('rejects an unknown folder id and an empty selection', async () => {
    await expect(
      source.core.transfer.export({ ...EXPORT_ALL, all: false, folder_ids: [randomUUID()] }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      source.core.transfer.export({ ...EXPORT_ALL, all: false, folder_ids: [] }),
    ).rejects.toBeInstanceOf(PreferenceError);
    await expect(
      source.core.transfer.export({ ...EXPORT_ALL, all: false, folder_ids: [randomUUID()] }),
    ).rejects.toBeInstanceOf(FolderError);
  });
});
