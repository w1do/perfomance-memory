import { randomUUID } from 'node:crypto';
import type { AiProvider } from '../ai/provider.js';
import type { Store } from '../qdrant/store.js';
import { PROJECTS_ROOT, folderNameSchema, type FolderNode, type FolderPayload } from '../types.js';
import { ancestorsOf, buildTree, findNode, flattenTree, joinPath, sameName } from './tree.js';

export class FolderError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = 'FolderError';
  }
}

export function folderEmbeddingText(
  f: Pick<FolderPayload, 'name' | 'description' | 'path'>,
): string {
  return [f.name, f.description ?? '', `Путь: ${f.path.join(' / ')}`].filter(Boolean).join('. ');
}

export interface CreateFolderInput {
  name: string;
  parent_id?: string | null | undefined;
  domain?: string | null | undefined;
  description?: string | null | undefined;
}

export interface UpdateFolderInput {
  name?: string | undefined;
  /** null moves the folder to the top level */
  parent_id?: string | null | undefined;
  domain?: string | null | undefined;
  description?: string | null | undefined;
}

export class FolderService {
  constructor(
    private readonly store: Store,
    private readonly ai: AiProvider,
  ) {}

  list(): Promise<FolderPayload[]> {
    return this.store.allFolders();
  }

  async tree(): Promise<FolderNode[]> {
    return buildTree(await this.list());
  }

  async byId(id: string): Promise<FolderPayload> {
    const f = (await this.list()).find((x) => x.id === id);
    if (!f) throw new FolderError('Папка не найдена', 404);
    return f;
  }

  async byPath(path: string[]): Promise<FolderNode | null> {
    return findNode(await this.tree(), path);
  }

  /** Project folders: direct children of «Проекты». */
  async projects(): Promise<FolderNode[]> {
    const root = (await this.tree()).find((n) => n.depth === 1 && sameName(n.name, PROJECTS_ROOT));
    return root?.children ?? [];
  }

  private async embedFolders(folders: FolderPayload[]): Promise<void> {
    if (!folders.length) return;
    const vectors = await this.ai.embed(folders.map(folderEmbeddingText));
    await this.store.upsertFolders(
      folders.map((payload, i) => ({ payload, dense: vectors[i] as number[] })),
    );
  }

  private newFolder(
    name: string,
    parent: FolderPayload | null,
    domain: string | null,
    description: string | null,
  ): FolderPayload {
    const path = parent ? [...parent.path, name] : [name];
    return {
      id: randomUUID(),
      name,
      parent_id: parent?.id ?? null,
      path,
      ancestors: ancestorsOf(path),
      depth: path.length,
      domain,
      description,
      preference_count: 0,
      created_at: new Date().toISOString(),
    };
  }

  /** Returns the folder at `path`, creating missing levels. Existing names match case-insensitively. */
  async ensurePath(
    path: string[],
    domain: string | null,
  ): Promise<{ folder: FolderPayload; created: FolderPayload[] }> {
    if (!path.length) throw new FolderError('Пустой путь папки', 400);
    const all = await this.list();
    const created: FolderPayload[] = [];
    let parent: FolderPayload | null = null;
    for (const rawName of path) {
      const name = folderNameSchema.parse(rawName);
      const parentId: string | null = parent ? parent.id : null;
      const existing: FolderPayload | undefined = all.find(
        (f) => f.parent_id === parentId && sameName(f.name, name),
      );
      if (existing) {
        parent = existing;
        continue;
      }
      const isProjectsRoot = parent === null && sameName(name, PROJECTS_ROOT);
      const folder = this.newFolder(name, parent, isProjectsRoot ? 'project' : domain, null);
      all.push(folder);
      created.push(folder);
      parent = folder;
    }
    await this.embedFolders(created);
    return { folder: parent as FolderPayload, created };
  }

  async create(input: CreateFolderInput): Promise<FolderPayload> {
    const name = folderNameSchema.parse(input.name);
    const all = await this.list();
    const parent = input.parent_id ? all.find((f) => f.id === input.parent_id) : null;
    if (input.parent_id && !parent) throw new FolderError('Родительская папка не найдена', 404);
    const parentId = parent?.id ?? null;
    if (all.some((f) => f.parent_id === parentId && sameName(f.name, name))) {
      throw new FolderError('Папка с таким именем уже есть', 409);
    }
    const folder = this.newFolder(
      name,
      parent ?? null,
      input.domain ?? parent?.domain ?? null,
      input.description ?? null,
    );
    await this.embedFolders([folder]);
    return folder;
  }

  /**
   * Rename and/or move. Recomputes path/ancestors/depth of the folder and all descendants,
   * then batch set_payload on nested preferences (folder_path, folder_ancestors, folder_depth, folder_name).
   */
  async update(id: string, input: UpdateFolderInput): Promise<FolderPayload> {
    const all = await this.list();
    const folder = all.find((f) => f.id === id);
    if (!folder) throw new FolderError('Папка не найдена', 404);
    const name = input.name !== undefined ? folderNameSchema.parse(input.name) : folder.name;
    let parent: FolderPayload | null = all.find((f) => f.id === folder.parent_id) ?? null;
    if (input.parent_id !== undefined) {
      parent = input.parent_id ? (all.find((f) => f.id === input.parent_id) ?? null) : null;
      if (input.parent_id && !parent)
        throw new FolderError('Новая родительская папка не найдена', 404);
      if (parent && (parent.id === id || parent.ancestors.includes(joinPath(folder.path)))) {
        throw new FolderError('Нельзя перенести папку внутрь самой себя', 400);
      }
    }
    const parentId = parent?.id ?? null;
    if (all.some((f) => f.id !== id && f.parent_id === parentId && sameName(f.name, name))) {
      throw new FolderError('В этой папке уже есть папка с таким именем', 409);
    }

    const oldPrefix = folder.path;
    const newPrefix = parent ? [...parent.path, name] : [name];
    const oldKey = joinPath(oldPrefix);
    const affected = all.filter((f) => f.id === id || f.ancestors.includes(oldKey));
    const updated: FolderPayload[] = affected.map((f) => {
      const path = [...newPrefix, ...f.path.slice(oldPrefix.length)];
      return {
        ...f,
        ...(f.id === id
          ? {
              name,
              parent_id: parentId,
              domain: input.domain !== undefined ? input.domain : f.domain,
              description: input.description !== undefined ? input.description : f.description,
            }
          : {}),
        path,
        ancestors: ancestorsOf(path),
        depth: path.length,
      };
    });

    await this.embedFolders(updated);
    await this.store.batchSetPreferencePayload(
      updated.map((f) => ({
        filter: { must: [{ key: 'folder_id', match: { value: f.id } }] },
        payload: {
          folder_name: f.name,
          folder_path: f.path,
          folder_ancestors: f.ancestors,
          folder_depth: f.depth,
        },
      })),
    );
    return updated.find((f) => f.id === id) as FolderPayload;
  }

  /** Deletes a folder. Non-empty folders (children or rules) need force=true, which removes everything nested. */
  async remove(id: string, force: boolean): Promise<{ folders: number; preferences: number }> {
    const all = await this.list();
    const folder = all.find((f) => f.id === id);
    if (!folder) throw new FolderError('Папка не найдена', 404);
    const key = joinPath(folder.path);
    const nested = all.filter((f) => f.id === id || f.ancestors.includes(key));
    const prefs = await this.store.allPreferences({
      must: [{ key: 'folder_id', match: { any: nested.map((f) => f.id) } }],
    });
    if (!force && (nested.length > 1 || prefs.length > 0)) {
      throw new FolderError(
        `Папка не пуста: вложенных папок ${nested.length - 1}, правил ${prefs.length}. Подтвердите удаление.`,
        409,
      );
    }
    await this.store.deletePreferences(prefs.map((p) => p.id));
    await this.store.deleteFolders(nested.map((f) => f.id));
    return { folders: nested.length, preferences: prefs.length };
  }

  /** Recomputes preference_count of every folder with one facet query on folder_id. */
  async recount(): Promise<void> {
    const all = await this.list();
    const facet = await this.store.facet(
      'folder_id',
      { must: [{ key: 'is_active', match: { value: true } }] },
      10_000,
    );
    const counts = new Map(facet.map((h) => [h.value, h.count]));
    const changes = all
      .filter((f) => (counts.get(f.id) ?? 0) !== f.preference_count)
      .map((f) => ({ id: f.id, payload: { preference_count: counts.get(f.id) ?? 0 } }));
    await this.store.setFolderPayloads(changes);
  }

  async similar(dense: number[], limit = 3): Promise<{ path: string[]; score: number }[]> {
    const hits = await this.store.similarFolders(dense, limit);
    return hits.map((h) => ({ path: h.folder.path, score: h.score }));
  }

  /** Folder paths as text lines for the enrichment prompt. */
  async pathLines(): Promise<string[]> {
    return flattenTree(await this.tree()).map((n) => n.path.join(' / '));
  }
}
