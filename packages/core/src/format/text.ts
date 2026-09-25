import { formatConstraint } from '../export/markdown.js';
import type { FolderNode, PreferencePayload } from '../types.js';

/** One compact line (plus optional details) per rule — what agents read. */
export function formatRule(p: PreferencePayload): string {
  const mark = p.polarity === 'like' ? '[люблю]' : '[не люблю]';
  const parts = [`- ${mark} ${p.statement} (сила ${p.strength}/5)`];
  if (p.constraints.length) {
    parts.push(
      `  constraints: ${p.constraints.map((c) => `\`${formatConstraint(c)}\``).join(', ')}`,
    );
  }
  if (p.details) parts.push(`  ${p.details}`);
  const meta: string[] = [];
  if (p.applies_to.length) meta.push(`applies_to: ${p.applies_to.join(', ')}`);
  if (p.project) meta.push(`project: ${p.project}`);
  meta.push(`id: ${p.id}`);
  parts.push(`  ${meta.join(' · ')}`);
  return parts.join('\n');
}

/** Rules grouped by folder path. */
export function formatByFolder(prefs: PreferencePayload[]): string {
  if (!prefs.length) return 'Правил не найдено.';
  const groups = new Map<string, PreferencePayload[]>();
  for (const p of prefs) {
    const key = p.folder_path.join(' › ');
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups]
    .map(([path, list]) => `## ${path}\n${list.map(formatRule).join('\n')}`)
    .join('\n\n');
}

/** Indented folder tree with counters. */
export function formatTree(nodes: FolderNode[], indent = 0): string {
  return nodes
    .map((n) => {
      const line = `${'  '.repeat(indent)}- ${n.name} (${n.total_count})`;
      const children = formatTree(n.children, indent + 1);
      return children ? `${line}\n${children}` : line;
    })
    .join('\n');
}
