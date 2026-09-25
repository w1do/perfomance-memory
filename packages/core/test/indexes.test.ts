import { describe, expect, it } from 'vitest';
import { createCore } from '../src/core.js';
import { createLogger } from '../src/logger.js';
import { FOLDER_INDEXES, PREFERENCE_INDEXES, indexTypeName } from '../src/qdrant/schema.js';
import { readStoredConfig } from '../src/qdrant/setup.js';
import { FakeAi } from './fake-ai.js';
import { testCore } from './helpers.js';

describe('Qdrant schema after startup', () => {
  it('creates every payload index with the right type (idempotently)', async () => {
    const { core, config } = await testCore();
    await core.bootstrap({ owner: true }); // second start must be a no-op
    const prefs = await core.qdrant.getCollection(config.QDRANT_COLLECTION);
    const schema = prefs.payload_schema as Record<string, { data_type: string }>;
    for (const spec of PREFERENCE_INDEXES) {
      expect(schema[spec.field]?.data_type, spec.field).toBe(indexTypeName(spec.schema));
    }
    expect(Object.keys(schema).sort()).toEqual(PREFERENCE_INDEXES.map((s) => s.field).sort());
    const folders = await core.qdrant.getCollection(config.QDRANT_FOLDERS_COLLECTION);
    const fschema = folders.payload_schema as Record<string, { data_type: string }>;
    for (const spec of FOLDER_INDEXES) {
      expect(fschema[spec.field]?.data_type, spec.field).toBe(indexTypeName(spec.schema));
    }
    const vectors = prefs.config.params.vectors as Record<
      string,
      { size: number; distance: string }
    >;
    expect(vectors.dense).toMatchObject({ size: 64, distance: 'Cosine' });
    expect(prefs.config.params.sparse_vectors?.sparse?.modifier).toBe('idf');
  });

  it('stores the embedding config point', async () => {
    const { core, config } = await testCore();
    expect(await readStoredConfig(core.qdrant, config)).toMatchObject({
      embed_model: 'text-embedding-3-small',
      embed_dim: 64,
    });
  });

  it('reindexes automatically when EMBED_DIM changes, keeping payload', async () => {
    const { core, ai, config, dataDir } = await testCore();
    ai.script('люблю рыбалку', {
      statement: 'Рыбалка',
      polarity: 'like',
      folder_path: ['Рыбалка', 'Люблю'],
      domain: 'fishing',
      tags: ['рыбалка', 'отдых', 'природа'],
    });
    const saved = await core.prefs.save({ text: 'люблю рыбалку', source: 'text' });

    const config2 = { ...config, EMBED_DIM: 32, OPENAI_EMBED_MODEL: 'text-embedding-3-large' };
    const core2 = createCore({
      config: config2,
      log: createLogger('silent', 't'),
      ai: new FakeAi(32),
      dataDir,
    });
    await core2.bootstrap({ owner: true });

    const info = await core2.qdrant.getCollection(config.QDRANT_COLLECTION);
    expect((info.config.params.vectors as Record<string, { size: number }>).dense?.size).toBe(32);
    const p = await core2.prefs.get(saved.preference?.id as string);
    expect(p.statement).toBe('Рыбалка');
    expect(p.folder_path).toEqual(['Рыбалка', 'Люблю']);
    expect(await readStoredConfig(core2.qdrant, config2)).toMatchObject({
      embed_dim: 32,
      embed_model: 'text-embedding-3-large',
    });
    const schema = info.payload_schema as Record<string, unknown>;
    expect(Object.keys(schema)).toHaveLength(PREFERENCE_INDEXES.length);
  });
});
