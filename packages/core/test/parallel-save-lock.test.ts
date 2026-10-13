import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Core } from '../src/core.js';
import { holdEnrich, plainEnrich, wait } from './concurrency-helpers.js';
import type { FakeAi } from './fake-ai.js';
import { testCore } from './helpers.js';

describe('parallel save: the write lock is not held during enrichment', () => {
  let core: Core;
  let ai: FakeAi;

  beforeAll(async () => {
    ({ core, ai } = await testCore());
  });
  beforeEach(() => plainEnrich(ai));
  afterAll(async () => {
    await core.qdrant.deleteCollection(core.config.QDRANT_COLLECTION);
    await core.qdrant.deleteCollection(core.config.QDRANT_FOLDERS_COLLECTION);
  });

  it('a held enrichment does not block another save', async () => {
    const HELD = 'не люблю созвоны без повестки';
    const FAST = 'люблю письменные итоги встреч';
    ai.script(HELD, {
      statement: 'Созвоны без повестки',
      polarity: 'dislike',
      folder_path: ['Встречи', 'Не люблю'],
      domain: 'meetings',
    }).script(FAST, {
      statement: 'Письменные итоги встреч',
      polarity: 'like',
      folder_path: ['Заметки', 'Люблю'],
      domain: 'notes',
    });
    const p = await core.prefs.preview(FAST); // до подмены enrich
    const hold = holdEnrich(ai, HELD);
    const held = core.prefs.save({ text: HELD, source: 'text' });
    await hold.entered; // HELD точно в enrich
    const fast = await Promise.race([
      core.prefs.save({ preview: { text: p.text, enrichment: p.enrichment }, source: 'text' }),
      wait(5000).then(() => 'blocked' as const),
    ]);
    hold.release(); // до assert'ов, чтобы не висел замок
    expect(fast).not.toBe('blocked');
    if (fast !== 'blocked') expect(fast.action).toBe('created');
    expect((await held).action).toBe('created');
  });

  it('preview errors do not hold the write lock', async () => {
    ai.script('не люблю длинные созвоны', {
      statement: 'Длинные созвоны',
      polarity: 'dislike',
      folder_path: ['Работа', 'Не люблю'],
      domain: 'work',
    });

    const results = await Promise.allSettled([
      core.prefs.save({ text: 'фраза без сценария для FakeAi', source: 'text' }),
      core.prefs.save({ text: 'не люблю длинные созвоны', source: 'text' }),
    ]);

    expect(results[0]?.status).toBe('rejected');
    expect(results[1]?.status).toBe('fulfilled');
    if (results[1]?.status === 'fulfilled') expect(results[1].value.action).toBe('created');
  });
});
