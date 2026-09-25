import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Core } from '../src/core.js';
import { legacyLevel, stricter } from '../src/level.js';
import { migrateLevels } from '../src/preferences/migrate.js';
import { rationale } from '../src/preferences/rationale.js';
import { formatRule } from '../src/format/text.js';
import { testCore } from './helpers.js';

describe('levels «жёстко / по умолчанию / вкус»', () => {
  it('legacy strength and constraints map to a level', () => {
    expect(legacyLevel({ strength: 5, constraints: [] })).toBe('hard');
    expect(legacyLevel({ strength: 3, constraints: [{}] })).toBe('hard');
    expect(legacyLevel({ strength: 4, constraints: [] })).toBe('default');
    expect(legacyLevel({ strength: 2, constraints: [] })).toBe('taste');
    expect(stricter('taste', 'hard')).toBe('hard');
    expect(stricter('default', 'taste')).toBe('default');
  });

  it('model level wins; strength is derived; «null» strings are not data', () => {
    expect(rationale({ level: 'taste', strength: 5, why: 'null', example_bad: ' ' })).toEqual({
      level: 'taste',
      strength: 1,
      why: null,
      example_good: null,
      example_bad: null,
    });
    expect(rationale({}).level).toBe('default');
  });
});

describe('startup migration of old rules', () => {
  let core: Core;
  beforeAll(async () => {
    ({ core } = await testCore({ SEED_DEMO: 'true' }));
  });
  afterAll(async () => {
    await core.qdrant.deleteCollection(core.config.QDRANT_COLLECTION);
    await core.qdrant.deleteCollection(core.config.QDRANT_FOLDERS_COLLECTION);
  });

  it('assigns levels to points without one, idempotently, and agents see them', async () => {
    const [p] = await core.prefs.all({ metric: 'function_lines' });
    const id = p?.id as string;
    await core.qdrant.deletePayload(core.config.QDRANT_COLLECTION, {
      wait: true,
      points: [id],
      keys: ['level', 'why', 'example_good', 'example_bad'],
    });
    await core.store.setPreferencePayload(id, { strength: 2 });
    expect(await migrateLevels(core.store, core.log)).toBe(1);
    const m = await core.prefs.get(id);
    expect(m.level).toBe('hard'); // есть ограничение → жёстко
    expect(m.strength).toBe(5);
    expect(m.why).toBeNull();
    expect(await migrateLevels(core.store, core.log)).toBe(0);
    expect(formatRule(m)).toContain('[не люблю · жёстко] Функции длиннее 40 строк');
  });
});
