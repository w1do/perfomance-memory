import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Core } from '../src/core.js';
import type { FakeAi } from './fake-ai.js';
import { testCore } from './helpers.js';

const rule = (statement: string, extra: Record<string, unknown> = {}) => ({
  statement,
  polarity: 'like' as const,
  folder_path: ['Claude Code', 'Люблю'],
  domain: 'ai_assistants',
  tags: ['вопросы'],
  ...extra,
});

describe('memory hygiene: duplicates, dictionary, typos', () => {
  let core: Core;
  let ai: FakeAi;
  beforeAll(async () => {
    ({ core, ai } = await testCore({ DUPLICATE_SCORE: '0.5' }));
    ai.script('a1', rule('Задавай вопросы перед кодом'))
      .script(
        'a2',
        rule('Задавай вопросы перед написанием кода', {
          level: 'hard',
          why: 'чтобы не переделывать',
          tags: ['бриф'],
        }),
      )
      .script(
        'b1',
        rule('Рыбалка на рассвете', {
          folder_path: ['Рыбалка', 'Люблю'],
          domain: 'fishing',
          tags: ['рыбалка'],
        }),
      )
      .script(
        'b2',
        rule('Рыбалка рано на рассвете', {
          folder_path: ['Рыбалка', 'Люблю'],
          domain: 'fishing',
          tags: ['рыбалка'],
        }),
      )
      .script(
        'typo',
        rule('Тихие места', {
          folder_path: ['Рыбалкаа', 'Люблю'],
          domain: 'fishing',
          tags: ['рыбалкаа'],
        }),
      );
    for (const t of ['a1', 'a2', 'b1', 'b2']) await core.prefs.save({ text: t, source: 'text' });
  });
  afterAll(async () => {
    await core.qdrant.deleteCollection(core.config.QDRANT_COLLECTION);
    await core.qdrant.deleteCollection(core.config.QDRANT_FOLDERS_COLLECTION);
  });

  it('finds duplicate groups and forgets pairs marked «not duplicates»', async () => {
    const groups = await core.hygiene.duplicates();
    expect(groups.map((g) => g.preferences.length)).toEqual([2, 2]);
    const fishing = groups.find((g) => g.preferences[0]?.domain === 'fishing');
    await core.hygiene.distinct(fishing?.preferences.map((p) => p.id) ?? []);
    expect(await core.hygiene.duplicates()).toHaveLength(1);
  });

  it('merges into the stricter rule: lists united, why kept, the other goes to history', async () => {
    const [g] = await core.hygiene.duplicates();
    const keep = g?.preferences.find((p) => p.id === g.keep);
    expect(keep?.statement).toBe('Задавай вопросы перед написанием кода');
    const other = g?.preferences.find((p) => p.id !== g.keep);
    const merged = await core.hygiene.merge(g?.keep as string, [other?.id as string]);
    expect(merged.level).toBe('hard');
    expect(merged.why).toBe('чтобы не переделывать');
    expect(merged.tags.sort()).toEqual(['бриф', 'вопросы']);
    expect(merged.history.at(-1)?.reason).toBe('слито как дубль');
    await expect(core.prefs.get(other?.id as string)).rejects.toThrow();
    expect((await core.folders.byPath(['Claude Code', 'Люблю']))?.preference_count).toBe(1);
  });

  it('moves non-dictionary applies_to into tags at startup, idempotently', async () => {
    const [p] = await core.prefs.all({ domain: 'ai_assistants' });
    await core.store.setPreferencePayload(p?.id as string, {
      applies_to: ['me', 'service.php', 'PHP'],
    });
    expect(await core.hygiene.normalizeTargets()).toBe(1);
    const fixed = await core.prefs.get(p?.id as string);
    expect(fixed.applies_to).toEqual(['php']);
    expect(fixed.tags).toContain('service.php');
    expect(await core.hygiene.normalizeTargets()).toBe(0);
  });

  it('preview fixes typos in new folders and tags', async () => {
    const pv = await core.prefs.preview('typo');
    expect(pv.enrichment.folder_path).toEqual(['Рыбалка', 'Люблю']);
    expect(pv.enrichment.tags).toEqual(['рыбалка']);
    expect(pv.folder_exists).toBe(true);
  });
});
