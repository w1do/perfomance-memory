/**
 * Точка из Qdrant → PreferencePayload. Qdrant не хранит null, записанный через set_payload, а у правил,
 * сохранённых до появления уровней, нет level / why / примеров / distinct_from — здесь они всегда присутствуют.
 */
import { LEVEL_STRENGTH, legacyLevel, parseLevel } from '../level.js';
import type { PreferencePayload } from '../types.js';

export function asPreference(raw: unknown): PreferencePayload {
  const p = raw as PreferencePayload;
  const level = parseLevel(p.level) ?? legacyLevel(p);
  return {
    ...p,
    level,
    strength: LEVEL_STRENGTH[level],
    why: p.why ?? null,
    example_good: p.example_good ?? null,
    example_bad: p.example_bad ?? null,
    distinct_from: p.distinct_from ?? [],
  };
}
