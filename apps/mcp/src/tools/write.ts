/** add_preference — тот же конвейер, что в интерфейсе (source = mcp). Регистрируется только при MCP_ALLOW_WRITE. */
import { z } from 'zod';
import { formatByFolder, type Core } from '@preference-memory/core';
import { logged, type Server } from './common.js';

const LABELS = {
  created: 'создано',
  updated: 'обновлено (конфликт)',
  duplicate: 'дубль',
  project_created: 'проект создан',
} as const;

export function registerWriteTool(server: Server, core: Core): void {
  server.addTool({
    name: 'add_preference',
    description:
      'Save a new user preference from a natural-language phrase. Runs the same pipeline as the UI: enrichment (level, why, examples), folder choice, conflict/duplicate detection.',
    parameters: z.object({
      text: z
        .string()
        .min(1)
        .max(2000)
        .describe('The phrase, e.g. "I dislike files longer than 100 lines"'),
      project: z
        .string()
        .max(80)
        .optional()
        .describe('Project name if the rule belongs to a project'),
      level: z
        .enum(['hard', 'default', 'taste'])
        .optional()
        .describe(
          'hard = violating it is a defect; default = follow unless there is a stated reason; taste = mild preference. Omit to infer from the phrase',
        ),
      why: z
        .string()
        .max(400)
        .optional()
        .describe('Why the rule matters, only as the user said it'),
      example_good: z
        .string()
        .max(400)
        .optional()
        .describe('Example of doing it right, if the user gave one'),
      example_bad: z
        .string()
        .max(400)
        .optional()
        .describe('Example of doing it wrong, if the user gave one'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, title: 'Add preference' },
    execute: logged(core, 'add_preference', async (a) => {
      const r = await core.prefs.save({
        text: a.text,
        source: 'mcp',
        projectHint: a.project ?? null,
        explicit: {
          level: a.level,
          why: a.why,
          example_good: a.example_good,
          example_bad: a.example_bad,
        },
      });
      const lines = [`Результат: ${LABELS[r.action]} · папка: ${r.folder.path.join(' › ')}`];
      if (r.preference) lines.push(formatByFolder([r.preference]));
      if (r.replaced) lines.push(`Прежняя версия: ${r.replaced.statement}`);
      return { text: lines.join('\n\n'), count: r.preference ? 1 : 0 };
    }),
  });
}
