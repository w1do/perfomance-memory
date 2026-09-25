/**
 * Уровень, «почему» и пример «так / не так» из ответа модели или отредактированного превью.
 * Ничего не выдумывается: пустые и «null»-строки → null; уровня нет → из старой силы или «по умолчанию».
 */
import { LEVEL_STRENGTH, legacyLevel, parseLevel, type Level } from '../level.js';
import type { Enrichment } from '../types.js';

/** Models sometimes return the string "null" instead of null. */
export const text = (v: string | null | undefined): string | null => {
  const t = v?.trim() ?? '';
  return t && !['null', 'none', 'n/a', '-', 'нет'].includes(t.toLowerCase()) ? t : null;
};

export interface RawRationale {
  level?: string | undefined;
  strength?: number | undefined;
  why?: string | null | undefined;
  example_good?: string | null | undefined;
  example_bad?: string | null | undefined;
}

export interface Rationale {
  level: Level;
  strength: number;
  why: string | null;
  example_good: string | null;
  example_bad: string | null;
}

export function rationale(r: RawRationale): Rationale {
  const level =
    parseLevel(r.level) ??
    (r.strength !== undefined ? legacyLevel({ strength: r.strength }) : 'default');
  return {
    level,
    strength: LEVEL_STRENGTH[level],
    why: text(r.why),
    example_good: text(r.example_good),
    example_bad: text(r.example_bad),
  };
}

/** Ручная правка: поле не передано — прежнее значение; передано пустым — очистить. */
export const blank = (next: string | null | undefined, prev: string | null): string | null =>
  next === undefined ? prev : text(next);

/** Явные поля (MCP add_preference) поверх вывода модели; пустые не затирают, strength — по уровню. */
export function withExplicit(e: Enrichment, x: Partial<Rationale> | undefined): Enrichment {
  if (!x) return e;
  const level = x.level ?? e.level;
  return {
    ...e,
    level,
    strength: LEVEL_STRENGTH[level],
    why: text(x.why) ?? e.why,
    example_good: text(x.example_good) ?? e.example_good,
    example_bad: text(x.example_bad) ?? e.example_bad,
  };
}
