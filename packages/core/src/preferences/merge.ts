/**
 * Слияние дублей в одно правило: списки (теги, цели, ограничения) объединяются, уровень берётся строже, пустые
 * пояснение / «почему» / примеры дополняются из слитых, а сами слитые правила уходят в history оставшегося.
 */
import { LEVEL_STRENGTH, LEVELS, stricter } from '../level.js';
import type { PreferencePayload } from '../types.js';
import { constraintMetrics } from './normalize.js';
import { snapshot } from './payload.js';

function union<T>(lists: T[][], max: number): T[] {
  const seen = new Map<string, T>();
  for (const item of lists.flat()) {
    const key = JSON.stringify(item);
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()].slice(0, max);
}

const info = (p: PreferencePayload) =>
  [p.details, p.why, p.example_good, p.example_bad].filter(Boolean).length + p.constraints.length;

/**
 * Какое правило оставить: строже по уровню, с большим числом заполненных полей, в более конкретной папке
 * («Проекты / Headless / Люблю», а не «Разное / Люблю»), потом более старое.
 */
export function pickKeep(group: PreferencePayload[]): PreferencePayload {
  return [...group].sort(
    (a, b) =>
      LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) ||
      info(b) - info(a) ||
      b.folder_depth - a.folder_depth ||
      a.created_at.localeCompare(b.created_at),
  )[0] as PreferencePayload;
}

export function mergeRules(
  keep: PreferencePayload,
  others: PreferencePayload[],
  now: string,
): PreferencePayload {
  const all = [keep, ...others];
  const level = all.map((p) => p.level).reduce(stricter);
  const first = (k: 'details' | 'why' | 'example_good' | 'example_bad') =>
    all.map((p) => p[k]).find((v) => v) ?? null;
  const constraints = union(
    all.map((p) => p.constraints),
    10,
  );
  const merged = new Set([keep.id, ...others.map((o) => o.id)]);
  return {
    ...keep,
    details: first('details'),
    why: first('why'),
    example_good: first('example_good'),
    example_bad: first('example_bad'),
    applies_to: union(
      all.map((p) => p.applies_to),
      12,
    ),
    tags: union(
      all.map((p) => p.tags),
      7,
    ),
    constraints,
    constraint_metrics: constraintMetrics(constraints),
    level,
    strength: LEVEL_STRENGTH[level],
    distinct_from: union(
      all.map((p) => p.distinct_from),
      1000,
    ).filter((id) => !merged.has(id)),
    history: [...keep.history, ...others.map((o) => snapshot(o, 'слито как дубль', now))],
    created_at: all.map((p) => p.created_at).sort()[0] ?? keep.created_at,
    updated_at: now,
  };
}
