import { findNode } from '../folders/tree.js';
import type { Constraint, FolderNode, PreferencePayload } from '../types.js';

export function formatConstraint(c: Constraint): string {
  return `${c.metric} ${c.operator} ${String(c.value)}${c.unit ? ` ${c.unit}` : ''}`;
}

export function strengthDots(n: number): string {
  return '●'.repeat(n) + '○'.repeat(Math.max(0, 5 - n));
}

function byImportance(a: PreferencePayload, b: PreferencePayload): number {
  return b.strength - a.strength || b.updated_at.localeCompare(a.updated_at);
}

function renderPreference(p: PreferencePayload): string[] {
  const lines = [`- ${p.statement} · сила ${p.strength}/5 ${strengthDots(p.strength)}`];
  if (p.details) lines.push(`  ${p.details}`);
  if (p.constraints.length) {
    lines.push(
      `  Ограничения: ${p.constraints.map((c) => `\`${formatConstraint(c)}\``).join(', ')}`,
    );
  }
  const meta: string[] = [];
  if (p.applies_to.length) meta.push(`относится к: \`${p.applies_to.join('`, `')}\``);
  if (p.tags.length) meta.push(`теги: \`${p.tags.join('`, `')}\``);
  if (meta.length) lines.push(`  ${meta.join(' · ')}`);
  return lines;
}

function heading(level: number, text: string): string {
  return level <= 6 ? `${'#'.repeat(level)} ${text}` : `**${text}**`;
}

/**
 * The main PREFERENCES.md: the whole folder tree as headings, rules under them,
 * constraints in monospace, strength next to each rule.
 */
export function buildMarkdown(
  tree: FolderNode[],
  prefs: PreferencePayload[],
  opts: { rootPath?: string[] | undefined; generatedAt?: string } = {},
): string {
  const byFolder = new Map<string, PreferencePayload[]>();
  for (const p of prefs) {
    const list = byFolder.get(p.folder_id) ?? [];
    list.push(p);
    byFolder.set(p.folder_id, list);
  }
  const generated = opts.generatedAt ?? new Date().toISOString();

  let roots = tree;
  let title = 'Мои предпочтения';
  if (opts.rootPath?.length) {
    const node = findNode(tree, opts.rootPath);
    roots = node ? [node] : [];
    title = `Мои предпочтения — ${opts.rootPath.join(' › ')}`;
  }
  const folderCount = (list: FolderNode[]): number =>
    list.reduce((s, n) => s + 1 + folderCount(n.children), 0);
  const ruleCount = roots.reduce((s, n) => s + n.total_count, 0);

  const out: string[] = [
    `# ${title}`,
    '',
    `> Обновлено: ${generated} · правил: ${ruleCount} · папок: ${folderCount(roots)}`,
    '> Сила — от 1 до 5. Ограничения (constraints) — обязательные условия.',
    '',
  ];
  if (!roots.length) {
    out.push('_Пока пусто._', '');
    return out.join('\n');
  }
  const walk = (nodes: FolderNode[], level: number) => {
    for (const n of nodes) {
      const label = level === 2 && opts.rootPath?.length ? n.path.join(' › ') : n.name;
      out.push(heading(level, label), '');
      const own = (byFolder.get(n.id) ?? []).sort(byImportance);
      if (own.length) {
        for (const p of own) out.push(...renderPreference(p));
        out.push('');
      }
      walk(n.children, level + 1);
    }
  };
  walk(roots, 2);
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}
