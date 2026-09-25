/** Ручная правка правила: смысловые изменения — в history, векторы пересчитываются, правило остаётся в листе
 * полярности, applies_to — только из словаря (остальное в теги), strength — по уровню. */
import { withPolarityLeaf } from '../folders/tree.js';
import { LEVEL_STRENGTH } from '../level.js';
import type { PreferencePayload } from '../types.js';
import { upsertWithVectors, type PrefDeps } from './deps.js';
import { splitTargets } from './guards.js';
import { constraintMetrics } from './normalize.js';
import { folderFields, snapshot } from './payload.js';
import { blank } from './rationale.js';
import { PreferenceError, type PreferencePatch } from './schemas.js';

export async function getOrThrow(deps: PrefDeps, id: string): Promise<PreferencePayload> {
  const p = await deps.store.getPreference(id);
  if (!p) throw new PreferenceError('Правило не найдено', 404);
  return p;
}

export async function updatePreference(
  deps: PrefDeps,
  id: string,
  patch: PreferencePatch,
): Promise<PreferencePayload> {
  const old = await getOrThrow(deps, id);
  const now = new Date().toISOString();
  const path = withPolarityLeaf(
    patch.folder_path ?? old.folder_path,
    patch.polarity ?? old.polarity,
  );
  const domain = patch.domain ?? old.domain;
  const { folder } = await deps.folders.ensurePath(path, domain);
  const constraints = patch.constraints ?? old.constraints;
  // applies_to — только из словаря; остальное переезжает в теги
  const split = splitTargets(patch.applies_to ?? old.applies_to);
  const tags = [...new Set([...(patch.tags ?? old.tags), ...split.extra])].slice(0, 7);
  const meaningChanged =
    (patch.statement !== undefined && patch.statement !== old.statement) ||
    (patch.polarity !== undefined && patch.polarity !== old.polarity) ||
    (patch.level !== undefined && patch.level !== old.level) ||
    (patch.constraints !== undefined &&
      JSON.stringify(patch.constraints) !== JSON.stringify(old.constraints));
  const updated: PreferencePayload = {
    ...old,
    ...patch,
    domain,
    applies_to: split.targets,
    tags,
    strength: LEVEL_STRENGTH[patch.level ?? old.level],
    why: blank(patch.why, old.why),
    example_good: blank(patch.example_good, old.example_good),
    example_bad: blank(patch.example_bad, old.example_bad),
    constraints,
    constraint_metrics: constraintMetrics(constraints),
    ...folderFields(folder),
    history: meaningChanged ? [...old.history, snapshot(old, 'ручная правка', now)] : old.history,
    updated_at: now,
  };
  await upsertWithVectors(deps, updated);
  return updated;
}
