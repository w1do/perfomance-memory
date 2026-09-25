import { beforeAll, describe, expect, it } from 'vitest';
import type { Core } from '../src/core.js';
import { testCore } from './helpers.js';

describe('metadata filters and hybrid search', () => {
  let core: Core;

  beforeAll(async () => {
    const t = await testCore({ SEED_DEMO: 'true' });
    core = t.core;
  });

  it('seeds demo data only into an empty base', async () => {
    const stats = await core.prefs.stats();
    expect(stats.total).toBe(10);
    expect(stats.like + stats.dislike).toBe(10);
    expect(stats.projects).toBe(1);
    await core.bootstrap({ owner: true });
    expect((await core.prefs.stats()).total).toBe(10);
  });

  it('folder filter includes nested folders', async () => {
    expect(await core.prefs.all({ folder: 'Программирование' })).toHaveLength(4);
    expect(await core.prefs.all({ folder: 'Программирование/PHP' })).toHaveLength(2);
    expect(await core.prefs.all({ folder: 'Программирование / Код / Не люблю' })).toHaveLength(1);
  });

  it('domain, project, polarity, applies_to, tags, metric, strength, updated_after', async () => {
    expect(await core.prefs.all({ domain: 'fishing' })).toHaveLength(2);
    expect(await core.prefs.all({ project: 'Семейный чат' })).toHaveLength(2);
    expect(await core.prefs.all({ domain: 'programming', polarity: 'like' })).toHaveLength(2);
    expect(await core.prefs.all({ applies_to: ['php'] })).toHaveLength(2);
    expect(await core.prefs.all({ tags: ['шум'] })).toHaveLength(2);
    const metric = await core.prefs.all({ metric: 'function_lines' });
    expect(metric.map((p) => p.statement)).toEqual(['Функции длиннее 40 строк']);
    expect((await core.prefs.all({ min_strength: 4 })).every((p) => p.strength >= 4)).toBe(true);
    expect(await core.prefs.all({ updated_after: '2999-01-01T00:00:00Z' })).toHaveLength(0);
  });

  it('hybrid search ranks inside the filter', async () => {
    const hits = await core.prefs.search('шумные соседи', { domain: 'fishing' }, 5);
    expect(hits[0]?.preference.statement).toBe('Шумные соседи на берегу');
    expect(hits.every((h) => h.preference.domain === 'fishing')).toBe(true);
    const listed = await core.prefs.list({ polarity: 'like' }, { q: 'PHP типизация' });
    expect(listed.items[0]?.preference.statement).toBe('Строгая типизация в PHP');
  });

  it('facets and newest-first listing', async () => {
    const f = await core.prefs.facets();
    expect(f.domain?.find((d) => d.value === 'programming')?.count).toBe(4);
    expect(f.polarity?.map((p) => p.value).sort()).toEqual(['dislike', 'like']);
    const { items } = await core.prefs.list({}, { limit: 3 });
    expect(items).toHaveLength(3);
    const dates = items.map((i) => i.preference.updated_at);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('task context: domain filter + hard constraints', async () => {
    const ai = core.ai as unknown as { tasks: Map<string, unknown> };
    ai.tasks.set('напиши PHP-сервис', {
      domains: ['programming'],
      project: null,
      applies_to: ['php'],
    });
    ai.tasks.set('поправь вёрстку', {
      domains: ['programming'],
      project: 'Семейный чат',
      applies_to: [],
    });
    expect(
      (await core.contextForTask({ task: 'поправь вёрстку', top_k: 2 })).context.project,
    ).toBeNull();
    ai.tasks.set('поправь вёрстку в семейном чате', {
      domains: [],
      project: 'Семейный чат',
      applies_to: [],
    });
    expect(
      (await core.contextForTask({ task: 'поправь вёрстку в семейном чате', top_k: 2 })).context
        .project,
    ).toBe('Семейный чат');
    const ctx = await core.contextForTask({ task: 'напиши PHP-сервис', top_k: 2 });
    expect(ctx.context.domains).toEqual(['programming']);
    expect(ctx.project_rules).toHaveLength(0);
    expect(ctx.preferences.length).toBeLessThanOrEqual(2);
    expect(ctx.preferences.every((p) => p.preference.domain === 'programming')).toBe(true);
    const all = [...ctx.preferences.map((p) => p.preference), ...ctx.hard_constraints];
    expect(all.some((p) => p.constraint_metrics.includes('function_lines'))).toBe(true);
    // 4 programming rules: shown ranked + hard constraints, the rest is reported, not silently dropped
    expect(all.length + ctx.omitted).toBe(4);

    // a named project returns ALL its rules regardless of top_k
    ai.tasks.set('семейный чат: добавить экран', {
      domains: [],
      project: 'Семейный чат',
      applies_to: [],
    });
    const proj = await core.contextForTask({ task: 'семейный чат: добавить экран', top_k: 1 });
    expect(proj.context.project).toBe('Семейный чат');
    expect(proj.project_rules).toHaveLength(2);
  });
});
