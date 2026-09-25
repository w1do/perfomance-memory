import {
  DISLIKE_FOLDER,
  LIKE_FOLDER,
  PATH_SEPARATOR,
  PROJECTS_ROOT,
  type FolderNode,
  type FolderPayload,
  type Polarity,
} from '../types.js';

export const joinPath = (path: string[]): string => path.join(PATH_SEPARATOR);

export const splitPath = (path: string): string[] =>
  path
    .split(PATH_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);

/** All prefixes of a path: ["A","B","C"] → ["A","A/B","A/B/C"]. */
export function ancestorsOf(path: string[]): string[] {
  return path.map((_, i) => joinPath(path.slice(0, i + 1)));
}

/** Case/ё-insensitive name comparison used to match existing folders. */
export function sameName(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
  return norm(a) === norm(b);
}

export function polarityFolderName(polarity: Polarity): string {
  return polarity === 'like' ? LIKE_FOLDER : DISLIKE_FOLDER;
}

export function polarityOfFolderName(name: string): Polarity | null {
  if (sameName(name, LIKE_FOLDER)) return 'like';
  if (sameName(name, DISLIKE_FOLDER)) return 'dislike';
  return null;
}

/** For a path ending in «Люблю»/«Не люблю» returns the sibling path of the other polarity. */
export function siblingPolarityPath(path: string[], polarity: Polarity): string[] | null {
  const leaf = path[path.length - 1];
  if (leaf === undefined || polarityOfFolderName(leaf) === null) return null;
  return [...path.slice(0, -1), polarityFolderName(polarity)];
}

function sortKey(node: FolderPayload): [number, string] {
  // Topics alphabetically, «Проекты» last; leaves «Люблю» before «Не люблю».
  if (node.depth === 1 && sameName(node.name, PROJECTS_ROOT)) return [2, node.name];
  const pol = polarityOfFolderName(node.name);
  if (pol) return [pol === 'like' ? 0 : 1, node.name];
  return [0, node.name];
}

export function compareFolders(a: FolderPayload, b: FolderPayload): number {
  const [ga, na] = sortKey(a);
  const [gb, nb] = sortKey(b);
  return ga !== gb ? ga - gb : na.localeCompare(nb, 'ru');
}

/** Builds a nested tree from flat folder payloads; total_count includes nested folders. */
export function buildTree(folders: FolderPayload[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  for (const f of folders) nodes.set(f.id, { ...f, children: [], total_count: 0 });
  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const finish = (list: FolderNode[]): number => {
    list.sort(compareFolders);
    let sum = 0;
    for (const n of list) {
      n.total_count = n.preference_count + finish(n.children);
      sum += n.total_count;
    }
    return sum;
  };
  finish(roots);
  return roots;
}

export function flattenTree(nodes: FolderNode[]): FolderNode[] {
  const out: FolderNode[] = [];
  const walk = (list: FolderNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export function findNode(nodes: FolderNode[], path: string[]): FolderNode | null {
  let level = nodes;
  let found: FolderNode | null = null;
  for (const name of path) {
    found = level.find((n) => sameName(n.name, name)) ?? null;
    if (!found) return null;
    level = found.children;
  }
  return found;
}

/** Cleans a folder path coming from the model: trims, removes «/», drops empties. */
export function sanitizePath(path: string[]): string[] {
  return path
    .map((s) =>
      s
        .replace(/[/\\]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((s) => s.length > 0)
    .map((s) => s.slice(0, 80));
}

/**
 * Правило всегда лежит в листе «Люблю» / «Не люблю»: неверный лист меняется на соседний,
 * а если путь кончается папкой темы (модель, редактор, перетаскивание) — лист добавляется.
 */
export function withPolarityLeaf(path: string[], polarity: Polarity): string[] {
  return siblingPolarityPath(path, polarity) ?? [...path, polarityFolderName(polarity)];
}

/** Makes the polarity leaf match the polarity (the model sometimes mixes them up). */
export function alignPolarityLeaf(path: string[], polarity: Polarity): string[] {
  return siblingPolarityPath(path, polarity) ?? path;
}
