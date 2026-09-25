/**
 * Уровень правила — что агенту делать при нарушении:
 * hard «жёстко» — нарушение = дефект; default «по умолчанию» — отступить можно, объяснив почему; taste «вкус» —
 * мягкое предпочтение. Числовая strength (1–5, есть в ТЗ и в индексе) выводится из уровня: 5 / 3 / 1.
 */
import { z } from 'zod';

export const levelSchema = z.enum(['hard', 'default', 'taste']);
export type Level = z.infer<typeof levelSchema>;

export const LEVELS: readonly Level[] = ['hard', 'default', 'taste'];

export const LEVEL_STRENGTH: Record<Level, number> = { hard: 5, default: 3, taste: 1 };

export const LEVEL_LABEL: Record<Level, string> = {
  hard: 'жёстко',
  default: 'по умолчанию',
  taste: 'вкус',
};

/** Что уровень значит для агента — одна фраза, её видят агенты в ответах MCP и в PREFERENCES.md. */
export const LEVEL_MEANING: Record<Level, string> = {
  hard: 'соблюдать всегда, нарушение = дефект',
  default: 'соблюдать; отступить можно, только объяснив почему',
  taste: 'учитывать, если нет причин поступить иначе',
};

export function parseLevel(v: unknown): Level | null {
  const r = levelSchema.safeParse(typeof v === 'string' ? v.trim().toLowerCase() : v);
  return r.success ? r.data : null;
}

/** Старые правила (до уровней): с ограничениями или силой 5 → жёстко, 1–2 → вкус, остальное → по умолчанию. */
export function legacyLevel(p: { strength?: number | null; constraints?: unknown[] }): Level {
  const s = p.strength ?? 3;
  if ((p.constraints?.length ?? 0) > 0 || s >= 5) return 'hard';
  if (s <= 2) return 'taste';
  return 'default';
}

/** Более строгий из двух уровней (для дублей: повтор правила не ослабляет его). */
export function stricter(a: Level, b: Level): Level {
  return LEVELS.indexOf(a) <= LEVELS.indexOf(b) ? a : b;
}
