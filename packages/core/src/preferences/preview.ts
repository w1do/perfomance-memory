/**
 * Превью: обогащение фразы без сохранения. Модель видит текущее дерево папок, топ-3 похожих папки, известные
 * домены и проекты; ответ проходит normalizeEnrichment с защитами от выдумок (guards.ts). Опечатки в новых
 * папках и тегах исправляются: имя, отличающееся от существующего на 1–2 буквы, заменяется существующим (fuzzy.ts).
 */
import { closest, snapPath } from '../text/fuzzy.js';
import { KNOWN_DOMAINS, PROJECTS_ROOT, type Enrichment, type Preview } from '../types.js';
import type { PrefDeps } from './deps.js';
import { normalizeEnrichment } from './normalize.js';
import { PreferenceError } from './schemas.js';

export async function knownDomains(deps: PrefDeps): Promise<string[]> {
  const used = await deps.store.facet('domain', {}, 100);
  return [...new Set([...KNOWN_DOMAINS, ...used.map((u) => u.value)])];
}

export async function previewText(
  deps: PrefDeps,
  text: string,
  projectHint?: string | null,
): Promise<Preview> {
  const clean = text.trim();
  if (!clean) throw new PreferenceError('Пустой текст', 400);
  const [queryVector] = await deps.ai.embed([clean]);
  const [tree, similar, projects, domains] = await Promise.all([
    deps.folders.pathLines(),
    deps.folders.similar(queryVector as number[], 3),
    deps.folders.projects(),
    knownDomains(deps),
  ]);
  const raw = await deps.ai.enrich({
    text: clean,
    folderTree: tree,
    similarFolders: similar,
    knownDomains: domains,
    projects: projects.map((p) => p.name),
    projectHint: projectHint ?? null,
  });
  const enrichment = await snapTypos(
    deps,
    normalizeEnrichment(raw, { sourceText: clean, projectHint: projectHint ?? null }),
    tree,
  );
  const existing = await deps.folders.byPath(enrichment.folder_path);
  return { text: clean, enrichment, folder_exists: existing !== null, similar_folders: similar };
}

/** Папка и теги с опечаткой приклеиваются к уже существующим. */
async function snapTypos(deps: PrefDeps, e: Enrichment, tree: string[]): Promise<Enrichment> {
  const tags = (await deps.store.facet('tags', {}, 1000)).map((t) => t.value);
  const snapped = e.tags.map((t) => closest(t, tags) ?? t);
  const folder_path = snapPath(
    e.folder_path,
    tree.map((line) => line.split(' / ')),
  );
  const inProject = e.project !== null && folder_path[0] === PROJECTS_ROOT;
  return {
    ...e,
    folder_path,
    project: inProject ? (folder_path[1] ?? e.project) : e.project,
    tags: [...new Set(snapped)],
  };
}
