/**
 * get_context_for_task — главный инструмент. Ответ: жёсткие ограничения, ВСЕ правила названного проекта,
 * правила по задаче (top_k), прочие правила с ограничениями и строка «ещё N не показано», если что-то отрезано.
 */
import { z } from 'zod';
import {
  formatByFolder,
  formatConstraint,
  type Core,
  type PreferencePayload,
} from '@preference-memory/core';
import { csvList, logged, topK, type Server } from './common.js';

function hardConstraintsBlock(prefs: PreferencePayload[]): string {
  const lines = prefs.flatMap((p) =>
    p.constraints.map(
      (c) => `- \`${formatConstraint(c)}\` — ${p.statement} (${p.folder_path.join(' › ')})`,
    ),
  );
  return lines.length ? `# Жёсткие ограничения\n${lines.join('\n')}` : '';
}

export function registerContextTool(server: Server, core: Core): void {
  server.addTool({
    name: 'get_context_for_task',
    description:
      "Call this at the start of any task to load the user's likes, dislikes and hard constraints. " +
      'Detects the relevant domain/project from the task description (name the project in the task to get ALL its rules), ' +
      'filters by metadata and returns the rules grouped by folder, with all constraints. Reports how many matching rules were not shown.',
    parameters: z.object({
      task: z
        .string()
        .min(1)
        .max(4000)
        .describe('What you are about to do, in any language; include the project name'),
      applies_to: csvList
        .optional()
        .describe('Optional: only rules for these targets, e.g. ["php", "claude"]'),
      top_k: topK.describe('Max ranked rules outside the project (default SEARCH_TOP_K)'),
    }),
    annotations: { readOnlyHint: true, title: 'Load preferences for a task' },
    execute: logged(core, 'get_context_for_task', async (args) => {
      const res = await core.contextForTask(args);
      const ranked = res.preferences.map((p) => p.preference);
      const scope = [
        res.context.domains.length ? `domains: ${res.context.domains.join(', ')}` : null,
        res.context.project ? `project: ${res.context.project}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      const parts = [
        `Контекст задачи — ${scope || 'все области'}`,
        hardConstraintsBlock([...res.project_rules, ...ranked, ...res.hard_constraints]),
        res.project_rules.length
          ? `# Проект ${res.context.project} — все правила (${res.project_rules.length})\n${formatByFolder(res.project_rules)}`
          : '',
        ranked.length ? `# Правила по задаче\n${formatByFolder(ranked)}` : '',
        res.hard_constraints.length
          ? `# Прочие правила с ограничениями\n${formatByFolder(res.hard_constraints)}`
          : '',
        res.omitted
          ? `Ещё ${res.omitted} правил в этих областях не показано — get_preferences с запросом или get_folder вернут их.`
          : '',
      ];
      const count = res.project_rules.length + ranked.length + res.hard_constraints.length;
      const text = parts.filter(Boolean).join('\n\n');
      return { text: count ? text : `${parts[0]}\n\nПравил не найдено.`, count };
    }),
  });
}
