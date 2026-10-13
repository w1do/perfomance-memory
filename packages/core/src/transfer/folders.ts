/** Слияние папок пакета с существующим деревом по пути (без учёта регистра и ё/е), запись и уборка новых папок. */
import { folderEmbeddingText } from '../folders/service.js';
import { newFolderPayload } from '../folders/payload.js';
import { sameName } from '../folders/tree.js';
import type { PrefDeps } from '../preferences/deps.js';
import { PROJECTS_ROOT, type FolderPayload } from '../types.js';
import type { ImportReport } from './format.js';
import { EMBED_BATCH, errorMessage } from './embed.js';
import { pathKey, prefixes } from './keys.js';
import type { WriteState } from './types.js';

export interface FolderMeta {
  domain: string | null;
  description: string | null;
}

export interface WantedFolder {
  path: string[];
  domain: string | null;
}

/** Чистая функция: решает, какие папки создать, без записи. */
export function planFolders(
  existing: FolderPayload[],
  wanted: WantedFolder[],
  meta: Map<string, FolderMeta>,
): { byKey: Map<string, FolderPayload>; created: FolderPayload[] } {
  const byKey = new Map(existing.map((f) => [pathKey(f.path), f]));
  const created: FolderPayload[] = [];
  const sorted = [...wanted].sort((a, b) => a.path.length - b.path.length);
  for (const w of sorted) {
    for (const prefix of prefixes(w.path)) {
      const k = pathKey(prefix);
      if (byKey.has(k)) continue;
      const parent = byKey.get(pathKey(prefix.slice(0, -1))) ?? null;
      const name = prefix[prefix.length - 1] ?? '';
      const m = meta.get(k);
      const isProjectsRoot = prefix.length === 1 && sameName(name, PROJECTS_ROOT);
      const domain = isProjectsRoot ? 'project' : (m?.domain ?? w.domain);
      const folder = newFolderPayload(name, parent, domain, m?.description ?? null);
      byKey.set(k, folder);
      created.push(folder);
    }
  }
  return { byKey, created };
}

/** Записывает новые папки батчами: эмбеддинг папки, затем upsert. Ошибка пробрасывается наверх. */
export async function writeFolders(deps: PrefDeps, created: FolderPayload[]): Promise<void> {
  for (let i = 0; i < created.length; i += EMBED_BATCH) {
    const chunk = created.slice(i, i + EMBED_BATCH);
    const vectors = await deps.ai.embed(chunk.map(folderEmbeddingText));
    await deps.store.upsertFolders(
      chunk.map((payload, j) => ({ payload, dense: vectors[j] as number[] })),
    );
  }
}

/** Удаление папок best-effort: true, если удалено; ошибка только пишется в лог. */
export async function dropFolders(deps: PrefDeps, ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    await deps.store.deleteFolders(ids);
    return true;
  } catch (err) {
    deps.log.warn({ err: errorMessage(err) }, 'import folders cleanup failed');
    return false;
  }
}

/** Папки, созданные импортом, но без правил (после сбоя батча), удаляются; счётчик отчёта — по факту. */
export async function removeOrphans(
  deps: PrefDeps,
  st: WriteState,
  report: ImportReport,
): Promise<void> {
  const orphans = st.created.filter((f) => !st.keep.has(pathKey(f.path)));
  const removed = await dropFolders(
    deps,
    orphans.map((f) => f.id),
  );
  if (removed) report.folders_created -= orphans.length;
  else if (orphans.length) st.leftover = true;
}
