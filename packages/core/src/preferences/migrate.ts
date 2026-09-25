/**
 * Миграция при старте (владелец — api): правилам до появления уровней записывается level (из силы и
 * ограничений, см. legacyLevel — его подставляет уже чтение, qdrant/payloadDefaults.ts) и strength по уровню.
 * Идемпотентна: выбираются только точки без level (is_empty по индексу). Векторы не меняются.
 */
import type { Logger } from '../logger.js';
import type { Store } from '../qdrant/store.js';

export async function migrateLevels(store: Store, log: Logger): Promise<number> {
  const stale = await store.allPreferences({ must: [{ is_empty: { key: 'level' } }] });
  for (const p of stale) {
    await store.setPreferencePayload(p.id, { level: p.level, strength: p.strength });
  }
  if (stale.length) log.info({ migrated: stale.length }, 'preference levels migrated');
  return stale.length;
}
