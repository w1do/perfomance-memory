/** Экспорт схемы: выбранные папки (с вложенными и предками пути) и их активные правила, без векторов и id. */
import { FolderError } from '../folders/service.js';
import { joinPath } from '../folders/tree.js';
import type { PrefDeps } from '../preferences/deps.js';
import { PreferenceError } from '../preferences/schemas.js';
import { buildPreferenceFilter } from '../qdrant/filters.js';
import type { FolderPayload, PreferencePayload } from '../types.js';
import {
  MAX_FOLDERS,
  MAX_HISTORY,
  MAX_PREFERENCES,
  MAX_RAW_TEXT,
  SCHEMA_FORMAT,
  SCHEMA_VERSION,
  type ExportInput,
  type PackagePreference,
  type SchemaPackage,
} from './format.js';

const byPath = (a: string[], b: string[]) => joinPath(a).localeCompare(joinPath(b), 'ru');

function selectFolders(all: FolderPayload[], input: ExportInput): FolderPayload[] {
  if (input.all) return all;
  if (input.folder_ids.length === 0) throw new PreferenceError('Выберите папки для экспорта', 400);
  const roots = input.folder_ids.map((id) => {
    const f = all.find((x) => x.id === id);
    if (!f) throw new FolderError('Папка не найдена', 404);
    return f;
  });
  return all.filter((f) =>
    roots.some((r) => f.id === r.id || f.ancestors.includes(joinPath(r.path))),
  );
}

/** Папки-предки нужны, чтобы у пакета был связный путь; их правила не экспортируются. */
function withAncestors(all: FolderPayload[], selected: FolderPayload[]): FolderPayload[] {
  const byKey = new Map(all.map((f) => [joinPath(f.path), f]));
  const ids = new Set(selected.map((f) => f.id));
  const out = [...selected];
  for (const f of selected) {
    for (let i = 1; i < f.path.length; i++) {
      const parent = byKey.get(joinPath(f.path.slice(0, i)));
      if (parent && !ids.has(parent.id)) {
        ids.add(parent.id);
        out.push(parent);
      }
    }
  }
  return out;
}

function toPackageRule(p: PreferencePayload): PackagePreference {
  return {
    statement: p.statement,
    details: p.details,
    raw_text: p.raw_text.slice(0, MAX_RAW_TEXT),
    polarity: p.polarity,
    domain: p.domain,
    project: p.project,
    applies_to: p.applies_to,
    tags: p.tags,
    constraints: p.constraints,
    level: p.level,
    why: p.why,
    example_good: p.example_good,
    example_bad: p.example_bad,
    language: p.language,
    folder_path: p.folder_path,
    history: p.history.slice(-MAX_HISTORY).map((h) => ({
      ...h,
      raw_text: h.raw_text.slice(0, MAX_RAW_TEXT),
      reason: h.reason?.slice(0, 400) ?? null,
    })),
  };
}

export async function buildSchemaPackage(
  deps: PrefDeps,
  input: ExportInput,
): Promise<SchemaPackage> {
  const all = await deps.folders.list();
  const folders = withAncestors(all, selectFolders(all, input));
  const ids = new Set(folders.map((f) => f.id));
  const prefs = await deps.store.allPreferences(buildPreferenceFilter({}));
  const rules = prefs.filter((p) => ids.has(p.folder_id));
  if (folders.length > MAX_FOLDERS || rules.length > MAX_PREFERENCES) {
    throw new PreferenceError(
      `Слишком большая выборка: правил ${rules.length}, папок ${folders.length}. Максимум ${MAX_PREFERENCES} и ${MAX_FOLDERS} — выберите меньше папок`,
      422,
    );
  }
  const sortedFolders = [...folders].sort((a, b) => byPath(a.path, b.path));
  const sortedRules = [...rules].sort(
    (a, b) => byPath(a.folder_path, b.folder_path) || a.created_at.localeCompare(b.created_at),
  );
  deps.log.info({ folders: folders.length, preferences: rules.length }, 'schema exported');
  return {
    format: SCHEMA_FORMAT,
    version: SCHEMA_VERSION,
    name: input.name,
    author: input.author,
    description: input.description,
    exported_at: new Date().toISOString(),
    counts: { folders: folders.length, preferences: rules.length },
    folders: sortedFolders.map((f) => ({
      path: f.path,
      domain: f.domain,
      description: f.description,
    })),
    preferences: sortedRules.map(toPackageRule),
  };
}
