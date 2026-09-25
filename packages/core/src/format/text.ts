import { formatConstraint } from '../export/markdown.js';
import { LEVEL_LABEL } from '../level.js';
import type { FolderNode, PreferencePayload } from '../types.js';

/** One compact line (plus optional details) per rule — what agents read. */
export function formatRule(p: PreferencePayload): string {
  const mark = `[${p.polarity === 'like' ? 'люблю' : 'не люблю'} · ${LEVEL_LABEL[p.level]}]`;
  const parts = [`- ${mark} ${p.statement}`];
  if (p.constraints.length) {
    parts.push(
      `  constraints: ${p.constraints.map((c) => `\`${formatConstraint(c)}\``).join(', ')}`,
    );
  }
  if (p.details) parts.push(`  ${p.details}`);
  if (p.why) parts.push(`  почему: ${p.why}`);
  if (p.example_good) parts.push(`  так: ${p.example_good}`);
  if (p.example_bad) parts.push(`  не так: ${p.example_bad}`);
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

/** «1 правило», «4 правила», «12 правил» — число с существительным в нужной форме. */
export function rulesCount(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  const word =
    d === 1 && dd !== 11
      ? 'правило'
      : d >= 2 && d <= 4 && (dd < 12 || dd > 14)
        ? 'правила'
        : 'правил';
  return `${n} ${word}`;
}
