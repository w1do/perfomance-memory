/** Предпросмотр импорта: разбор, дословные дубли и дерево — без OpenAI и без записи в Qdrant. */
import type { PrefDeps } from '../preferences/deps.js';
import { buildPreferenceFilter } from '../qdrant/filters.js';
import type { PackageHeader } from './format.js';
import { ExactIndex, type RuleStatus } from './dedup.js';
import { pathKey } from './keys.js';
import { parsePackage } from './parse.js';
import { buildImportTree, type ImportNode } from './tree.js';

export interface ImportPreview {
  header: PackageHeader;
  counts: {
    folders: number;
    rules: number;
    new_folders: number;
    duplicates: number;
    conflicts: number;
    invalid: number;
  };
  tree: ImportNode[];
  errors: string[];
}

function flatten(nodes: ImportNode[]): ImportNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

export async function previewImport(deps: PrefDeps, raw: unknown): Promise<ImportPreview> {
  const p = parsePackage(raw);
  const [existing, folders] = await Promise.all([
    deps.store.allPreferences(buildPreferenceFilter({})),
    deps.folders.list(),
  ]);
  // дубли внутри самого пакета тоже считаются: второе вхождение — дубль первого
  const index = new ExactIndex(existing);
  const statuses: RuleStatus[] = p.rules.map((r) => {
    const status = index.classify(r.enrichment);
    if (status === 'new') index.add(r.enrichment);
    return status;
  });
  const tree = buildImportTree(
    p.folders,
    p.rules,
    statuses,
    new Set(folders.map((f) => pathKey(f.path))),
  );
  const nodes = flatten(tree);
  const count = (s: RuleStatus) => statuses.filter((x) => x === s).length;
  return {
    header: p.header,
    counts: {
      folders: nodes.length,
      rules: p.rules.length,
      new_folders: nodes.filter((n) => !n.exists).length,
      duplicates: count('duplicate'),
      conflicts: count('conflict'),
      invalid: p.invalid,
    },
    tree,
    errors: p.errors,
  };
}
