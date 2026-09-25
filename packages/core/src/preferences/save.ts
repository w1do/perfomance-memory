/**
 * Сохранение обогащённого правила: только проект → папка проекта; иначе проверка конфликта и одно из трёх —
 * дубль (обновить дату, усилить уровень, дополнить «почему»), конфликт (обновить, прежняя версия в history, при смене полярности — соседний
 * лист), новое (создать). Лист «Люблю»/«Не люблю» гарантирован withPolarityLeaf.
 */
import { withPolarityLeaf } from '../folders/tree.js';
import { LEVEL_STRENGTH, stricter } from '../level.js';
import { bm25Document } from '../text/bm25.js';
import {
  PROJECTS_ROOT,
  type Enrichment,
  type PreferencePayload,
  type SaveResult,
  type Source,
} from '../types.js';
import { findConflict } from './conflict.js';
import { upsertWithVectors, type PrefDeps } from './deps.js';
import { constraintMetrics } from './normalize.js';
import { buildPayload, embeddingText, folderFields, snapshot } from './payload.js';

export async function saveEnrichment(
  deps: PrefDeps,
  e: Enrichment,
  rawText: string,
  source: Source,
): Promise<SaveResult> {
  const { folders, log } = deps;
  if (e.kind === 'project_only') {
    const name = e.project ?? e.folder_path[e.folder_path.length - 1] ?? '';
    const { folder } = await folders.ensurePath([PROJECTS_ROOT, name], 'project');
    log.info({ action: 'project_created', folder: folder.path }, 'pipeline');
    return { action: 'project_created', preference: null, folder };
  }

  const draftText = embeddingText(e);
  const [draftDense] = await deps.ai.embed([draftText]);
  const dense = draftDense as number[];
  const { decision, target } = await findConflict(deps, e, rawText, dense, draftText);
  const now = new Date().toISOString();

  if (target && decision.decision === 'duplicate') {
    // повтор не ослабляет правило и дополняет пустые «почему» и примеры, но не затирает их
    const level = stricter(target.level, e.level);
    const extra = {
      level,
      strength: LEVEL_STRENGTH[level],
      why: target.why ?? e.why,
      example_good: target.example_good ?? e.example_good,
      example_bad: target.example_bad ?? e.example_bad,
      updated_at: now,
    };
    const updated: PreferencePayload = { ...target, ...extra };
    if (extra.why !== target.why) await upsertWithVectors(deps, updated);
    else await deps.store.setPreferencePayload(target.id, extra);
    const folder = await folders.byId(target.folder_id);
    log.info({ action: 'duplicate', id: target.id }, 'pipeline');
    return { action: 'duplicate', preference: updated, folder, reason: decision.reason };
  }

  if (target && decision.decision === 'conflict') {
    const path = withPolarityLeaf(target.folder_path, e.polarity);
    const { folder } = await folders.ensurePath(path, e.domain);
    const replaced = snapshot(target, decision.reason, now);
    const updated: PreferencePayload = {
      ...target,
      statement: e.statement,
      details: e.details,
      raw_text: rawText,
      polarity: e.polarity,
      domain: e.domain,
      project: e.project,
      applies_to: e.applies_to,
      tags: e.tags,
      constraints: e.constraints,
      constraint_metrics: constraintMetrics(e.constraints),
      level: e.level,
      strength: e.strength,
      why: e.why,
      example_good: e.example_good,
      example_bad: e.example_bad,
      language: e.language,
      ...folderFields(folder),
      source,
      is_active: true,
      history: [...target.history, replaced],
      updated_at: now,
    };
    await upsertWithVectors(deps, updated);
    log.info(
      { action: 'updated', id: target.id, moved: path.join('/') !== target.folder_path.join('/') },
      'pipeline',
    );
    return { action: 'updated', preference: updated, replaced, folder, reason: decision.reason };
  }

  const { folder } = await folders.ensurePath(e.folder_path, e.domain);
  const payload = buildPayload({ enrichment: e, folder, rawText, source, now });
  const finalText = embeddingText(payload);
  if (finalText === draftText)
    await deps.store.upsertPreference(payload, dense, bm25Document(finalText));
  else await upsertWithVectors(deps, payload);
  log.info({ action: 'created', id: payload.id, folder: folder.path }, 'pipeline');
  return { action: 'created', preference: payload, folder };
}
