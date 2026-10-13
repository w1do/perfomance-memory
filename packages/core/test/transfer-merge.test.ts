import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Core } from '../src/core.js';
import { buildPreferenceFilter } from '../src/qdrant/filters.js';
import type { FakeAi } from './fake-ai.js';
import { testCore } from './helpers.js';
import { dropCollections } from './transfer-fixtures.js';

const CHATGPT = 'не люблю, когда ChatGPT отвечает грубо';

const pkgWith = (preferences: unknown[], folders: unknown[] = []) => ({
  format: 'preference-memory/schema',
  version: 1,
  name: 'Чужая схема',
  exported_at: '2026-10-13T10:00:00.000Z',
  folders,
  preferences,
});

const chatRule = (over: Record<string, unknown> = {}) => ({
  statement: 'Грубые ответы ChatGPT',
  polarity: 'dislike',
  domain: 'ai_assistants',
  folder_path: ['ChatGPT', 'Не люблю'],
  details: 'Тон ответа',
  tags: ['chatgpt', 'тон', 'ответы'],
  ...over,
});

const fishRule = {
  statement: 'Тихие места',
  polarity: 'like',
  domain: 'fishing',
  folder_path: ['Рыбалка', 'Люблю'],
};

describe('schema merge into a non-empty memory', () => {
  let core: Core;
  let ai: FakeAi;

  beforeAll(async () => {
    ({ core, ai } = await testCore());
    ai.script(CHATGPT, {
      statement: 'Грубые ответы ChatGPT',
      polarity: 'dislike',
      folder_path: ['ChatGPT', 'Не люблю'],
      domain: 'ai_assistants',
      details: 'Тон ответа',
      tags: ['chatgpt', 'тон', 'ответы'],
      applies_to: ['chatgpt'],
    });
    await core.prefs.save({ text: CHATGPT, source: 'text' });
  });

  afterAll(async () => {
    await dropCollections(core);
  });

  const count = () => core.store.countPreferences(buildPreferenceFilter({}));
  const apply = (
    preferences: unknown[],
    folders: unknown[] = [],
    sel = { all: true, folders: [] as string[] },
  ) => core.transfer.apply(pkgWith(preferences, folders), sel);

  it('skips an exact duplicate and a conflicting opposite rule', async () => {
    const before = await count();
    const report = await apply([
      chatRule(),
      chatRule({ polarity: 'like', folder_path: ['Другое', 'Люблю'] }),
    ]);
    expect(report.duplicates).toBe(1);
    expect(report.conflicts).toBe(1);
    expect(report.rules_created).toBe(0);
    expect(report.folders_created).toBe(0);
    expect(await count()).toBe(before);
  });

  it('skips a semantic duplicate with the same words, folder and tags', async () => {
    const before = await count();
    const report = await apply([chatRule({ statement: 'Ответы ChatGPT грубые' })]);
    expect(report.duplicates).toBe(1);
    expect(report.rules_created).toBe(0);
    expect(await count()).toBe(before);
  });

  it('reports a failed write without throwing and leaves no orphan folders', async () => {
    const foldersBefore = (await core.folders.list()).map((f) => f.id).sort();
    const spy = vi
      .spyOn(core.store, 'upsertPreferences')
      .mockRejectedValueOnce(new Error('qdrant down'));
    try {
      const report = await apply([fishRule]);
      expect(report.rules_created).toBe(0);
      expect(report.errors).toBe(1);
      expect(report.folders_created).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect((await core.folders.list()).map((f) => f.id).sort()).toEqual(foldersBefore);
  });

  it('reports failed embeddings as errors and creates no folders', async () => {
    const foldersBefore = (await core.folders.list()).length;
    const spy = vi.spyOn(ai, 'embed').mockRejectedValue(new Error('openai down'));
    try {
      const report = await apply([fishRule]);
      expect(report.errors).toBe(1);
      expect(report.rules_created).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect((await core.folders.list()).length).toBe(foldersBefore);
  });

  it('creates an empty package folder and imports only the selected branch', async () => {
    const report = await apply(
      [
        {
          statement: 'Рыбалка рано',
          polarity: 'like',
          domain: 'fishing',
          folder_path: ['Рыбалка', 'Люблю'],
        },
      ],
      [
        { path: ['Хобби'], domain: 'other', description: null },
        { path: ['Хобби', 'Пустая'], domain: 'other', description: 'Пусто' },
      ],
      { all: false, folders: ['Хобби'] },
    );
    expect(report.rules_total).toBe(0);
    expect(report.rules_created).toBe(0);
    const names = (await core.folders.list()).map((f) => f.path.join('/'));
    expect(names).toContain('Хобби/Пустая');
    expect(names).not.toContain('Рыбалка');
  });
});
