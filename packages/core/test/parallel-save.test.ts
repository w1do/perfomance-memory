import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Core } from '../src/core.js';
import { joinPath } from '../src/folders/tree.js';
import { barrierEnrich } from './concurrency-helpers.js';
import type { FakeAi } from './fake-ai.js';
import { testCore } from './helpers.js';

describe('parallel save: enrichment outside the write lock', () => {
  let core: Core;
  let ai: FakeAi;
  let dataDir: string;

  beforeAll(async () => {
    ({ core, ai, dataDir } = await testCore());
  });
  afterAll(async () => {
    await core.qdrant.deleteCollection(core.config.QDRANT_COLLECTION);
    await core.qdrant.deleteCollection(core.config.QDRANT_FOLDERS_COLLECTION);
  });

  it('runs enrichment of parallel saves concurrently, not one by one', async () => {
    ai.script('не люблю мутные блесны на окуня', {
      statement: 'Мутные блесны на окуня',
      polarity: 'dislike',
      folder_path: ['Рыбалка', 'Не люблю'],
      domain: 'fishing',
    })
      .script('люблю маршруты без толпы туристов', {
        statement: 'Маршруты без толпы',
        polarity: 'like',
        folder_path: ['Путешествия', 'Люблю'],
        domain: 'travel',
      })
      .script('не люблю пересоленный суп', {
        statement: 'Пересоленный суп',
        polarity: 'dislike',
        folder_path: ['Кулинария', 'Не люблю'],
        domain: 'cooking',
      })
      .script('люблю короткие ответы ассистента', {
        statement: 'Короткие ответы ассистента',
        polarity: 'like',
        folder_path: ['ChatGPT', 'Люблю'],
        domain: 'ai_assistants',
      });
    barrierEnrich(ai, 4);

    const results = await Promise.all(
      [
        'не люблю мутные блесны на окуня',
        'люблю маршруты без толпы туристов',
        'не люблю пересоленный суп',
        'люблю короткие ответы ассистента',
      ].map((text) => core.prefs.save({ text, source: 'text' })),
    );

    expect(results.map((r) => r.action)).toEqual(['created', 'created', 'created', 'created']);
  });

  it('parallel identical phrases produce one rule and duplicates', async () => {
    ai.script('не люблю табы в коде', {
      statement: 'Табы в коде',
      polarity: 'dislike',
      folder_path: ['Программирование', 'Код', 'Не люблю'],
      domain: 'programming',
    });
    barrierEnrich(ai, 3);

    const results = await Promise.all(
      [1, 2, 3].map(() => core.prefs.save({ text: 'не люблю табы в коде', source: 'text' })),
    );

    expect(results.map((r) => r.action).sort()).toEqual(['created', 'duplicate', 'duplicate']);
    expect(await core.prefs.count({ domain: 'programming' })).toBe(1);

    const createdId = results.find((r) => r.action === 'created')?.preference?.id;
    const duplicateIds = results
      .filter((r) => r.action === 'duplicate')
      .map((r) => r.preference?.id);
    expect(createdId).toBeDefined();
    expect(duplicateIds).toEqual([createdId, createdId]);

    const path = ['Программирование', 'Код', 'Не люблю'];
    expect(await core.folders.byPath(path)).not.toBeNull();
    const samePath = (await core.folders.list()).filter((f) => joinPath(f.path) === joinPath(path));
    expect(samePath).toHaveLength(1);
  });

  it('save resolves with counters and PREFERENCES.md already refreshed', async () => {
    ai.script('не люблю вставать раньше пяти', {
      statement: 'Подъём раньше пяти утра',
      polarity: 'dislike',
      folder_path: ['Зимняя рыбалка', 'Не люблю'],
      domain: 'ice_fishing',
    }).script('не люблю ловлю мормышкой зимой', {
      statement: 'Ловля мормышкой зимой',
      polarity: 'dislike',
      folder_path: ['Зимняя рыбалка', 'Не люблю'],
      domain: 'ice_fishing',
    });
    barrierEnrich(ai, 2);

    await Promise.all([
      core.prefs.save({ text: 'не люблю вставать раньше пяти', source: 'text' }),
      core.prefs.save({ text: 'не люблю ловлю мормышкой зимой', source: 'text' }),
    ]);

    const file = readFileSync(join(dataDir, 'PREFERENCES.md'), 'utf8');
    expect(file).toContain('Подъём раньше пяти утра');
    expect(file).toContain('Ловля мормышкой зимой');
    expect((await core.folders.byPath(['Зимняя рыбалка', 'Не люблю']))?.preference_count).toBe(2);
  });
});
