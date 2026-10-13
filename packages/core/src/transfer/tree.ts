/** Дерево предпросмотра импорта: папки и правила пакета по путям, со счётчиками и статусами дублей. */
import type { Level } from '../level.js';
import type { Polarity } from '../types.js';
import type { RuleStatus } from './dedup.js';
import type { ParsedFolder, ParsedRule } from './parse.js';
import { pathKey } from './keys.js';

export interface ImportItem {
  statement: string;
  polarity: Polarity;
  level: Level;
  status: RuleStatus;
}

export interface ImportNode {
  key: string;
  name: string;
  path: string[];
  /** папка уже есть у получателя */
  exists: boolean;
  /** правил в этой папке и во вложенных */
  total: number;
  /** из них дословные дубли или противоречия */
  skipped: number;
  items: ImportItem[];
  children: ImportNode[];
}

export function buildImportTree(
  folders: ParsedFolder[],
  rules: ParsedRule[],
  statuses: RuleStatus[],
  existingKeys: Set<string>,
): ImportNode[] {
  const nodes = new Map<string, ImportNode>();
  const nodeFor = (path: string[]): ImportNode => {
    for (let i = 1; i <= path.length; i++) {
      const prefix = path.slice(0, i);
      const key = pathKey(prefix);
      if (!nodes.has(key)) {
        nodes.set(key, {
          key,
          name: prefix[i - 1] ?? '',
          path: prefix,
          exists: existingKeys.has(key),
          total: 0,
          skipped: 0,
          items: [],
          children: [],
        });
      }
    }
    return nodes.get(pathKey(path)) as ImportNode;
  };
  for (const f of folders) nodeFor(f.path);
  rules.forEach((r, i) => {
    nodeFor(r.enrichment.folder_path).items.push({
      statement: r.enrichment.statement,
      polarity: r.enrichment.polarity,
      level: r.enrichment.level,
      status: statuses[i] ?? 'new',
    });
  });

  const roots: ImportNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.path.length > 1 ? nodes.get(pathKey(node.path.slice(0, -1))) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sum = (n: ImportNode): void => {
    n.children.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    n.total = n.items.length;
    n.skipped = n.items.filter((it) => it.status !== 'new').length;
    for (const c of n.children) {
      sum(c);
      n.total += c.total;
      n.skipped += c.skipped;
    }
  };
  roots.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  roots.forEach(sum);
  return roots;
}
