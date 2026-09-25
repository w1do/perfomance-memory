import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import {
  PROJECTS_ROOT,
  flattenTree,
  formatByFolder,
  formatConstraint,
  formatTree,
  normalizeFolderPath,
  splitPath,
  type Core,
  type PreferencePayload,
} from '@preference-memory/core';
import { bearerAuth, type McpAuth } from './auth.js';

export const VERSION = '1.0.0';

const csvList = z.array(z.string().min(1).max(60)).max(20);
const topK = z.number().int().min(1).max(100).optional();

/** Wraps a tool body with a structured call log: tool name, duration, result count. No arguments, no secrets. */
function logged<A>(
  core: Core,
  tool: string,
  fn: (args: A) => Promise<{ text: string; count: number }>,
) {
  return async (args: A): Promise<string> => {
    const started = Date.now();
    try {
      const { text, count } = await fn(args);
      core.log.info({ tool, ms: Date.now() - started, results: count }, 'mcp tool call');
      return text;
    } catch (err) {
      core.log.warn(
        { tool, ms: Date.now() - started, error: (err as Error).message },
        'mcp tool failed',
      );
      throw err;
    }
  };
}

function hardConstraintsBlock(prefs: PreferencePayload[]): string {
  const lines = prefs.flatMap((p) =>
    p.constraints.map(
      (c) => `- \`${formatConstraint(c)}\` — ${p.statement} (${p.folder_path.join(' › ')})`,
    ),
  );
  return lines.length ? `# Жёсткие ограничения\n${lines.join('\n')}` : '';
}

export function buildMcpServer(core: Core, opts: { authenticate?: boolean } = {}) {
  const { config } = core;
  const server = new FastMCP<McpAuth>({
    name: 'preference-memory',
    version: VERSION,
    instructions:
      "Personal memory of the user's likes, dislikes and hard constraints, organised in folders. " +
      'Call get_context_for_task at the start of every task and follow the returned constraints strictly.',
    health: { enabled: true, path: '/health', message: 'ok', status: 200 },
    ...(opts.authenticate === false ? {} : { authenticate: bearerAuth(config.MCP_TOKEN) }),
  });

  server.addTool({
    name: 'get_context_for_task',
    description:
      "Call this at the start of any task to load the user's likes, dislikes and hard constraints. " +
      'Detects the relevant domain/project from the task description, filters by metadata and returns the matching rules grouped by folder, with all constraints.',
    parameters: z.object({
      task: z.string().min(1).max(4000).describe('What you are about to do, in any language'),
      applies_to: csvList
        .optional()
        .describe('Optional: only rules for these targets, e.g. ["php", "claude"]'),
      top_k: topK.describe('Max ranked rules (default SEARCH_TOP_K)'),
    }),
    annotations: { readOnlyHint: true, title: 'Load preferences for a task' },
    execute: logged(core, 'get_context_for_task', async (args) => {
      const res = await core.contextForTask(args);
      const scope = [
        res.context.domains.length ? `domains: ${res.context.domains.join(', ')}` : null,
        res.context.project ? `project: ${res.context.project}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      const parts = [
        `Контекст задачи — ${scope || 'все области'}`,
        hardConstraintsBlock([
          ...res.preferences.map((p) => p.preference),
          ...res.hard_constraints,
        ]),
        `# Правила\n${formatByFolder(res.preferences.map((p) => p.preference))}`,
      ];
      if (res.hard_constraints.length) {
        parts.push(`# Прочие правила с ограничениями\n${formatByFolder(res.hard_constraints)}`);
      }
      return {
        text: parts.filter(Boolean).join('\n\n'),
        count: res.preferences.length + res.hard_constraints.length,
      };
    }),
  });

  server.addTool({
    name: 'get_preferences',
    description:
      'Search the user preferences: metadata filters first, then hybrid (dense + BM25) ranking. Results grouped by folder.',
    parameters: z.object({
      query: z.string().min(1).max(1000).describe('Free-text search query'),
      folder: z
        .string()
        .max(500)
        .optional()
        .describe('Folder path like "Programming/Code"; includes nested folders'),
      domain: z
        .string()
        .max(40)
        .optional()
        .describe(
          'programming, ai_assistants, fishing, travel, food, communication, project, other…',
        ),
      project: z.string().max(80).optional().describe('Project name'),
      polarity: z.enum(['like', 'dislike']).optional(),
      applies_to: csvList.optional().describe('Targets, e.g. ["chatgpt"], ["php"]'),
      tags: csvList.optional().describe('Any of these tags'),
      top_k: topK,
    }),
    annotations: { readOnlyHint: true, title: 'Search preferences' },
    execute: logged(core, 'get_preferences', async (a) => {
      const hits = await core.prefs.search(
        a.query,
        {
          folder: a.folder ? normalizeFolderPath(a.folder) : undefined,
          domain: a.domain,
          project: a.project,
          polarity: a.polarity,
          applies_to: a.applies_to,
          tags: a.tags,
        },
        a.top_k ?? config.SEARCH_TOP_K,
      );
      return { text: formatByFolder(hits.map((h) => h.preference)), count: hits.length };
    }),
  });

  const folderPage = async (path: string[], cursor: string | undefined, limit: number) => {
    const node = await core.folders.byPath(path);
    if (!node) return { text: `Папка «${path.join(' / ')}» не найдена.`, count: 0 };
    const page = await core.prefs.page({ folder: path.join('/') }, limit, cursor ?? null);
    const sub = node.children.length ? `Подпапки:\n${formatTree(node.children)}` : 'Подпапок нет.';
    const text = [
      `# ${node.path.join(' › ')} — правил: ${node.total_count}`,
      sub,
      formatByFolder(page.items),
      page.next ? `next_cursor: ${page.next}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    return { text, count: page.items.length };
  };

  server.addTool({
    name: 'get_folder',
    description:
      'Get a folder (with nested folders) and its rules. Large folders are paginated: pass next_cursor back as cursor.',
    parameters: z.object({
      path: z
        .string()
        .min(1)
        .max(500)
        .describe('Folder path, segments separated by "/", e.g. "Projects/Dacha"'),
      cursor: z.string().max(100).optional().describe('next_cursor from a previous call'),
      limit: z.number().int().min(1).max(200).optional().describe('Rules per page (default 50)'),
    }),
    annotations: { readOnlyHint: true, title: 'Get folder' },
    execute: logged(core, 'get_folder', (a) =>
      folderPage(splitPath(a.path), a.cursor, a.limit ?? 50),
    ),
  });

  server.addTool({
    name: 'list_folders',
    description: 'List the whole folder tree with rule counters (nested counts included).',
    parameters: z.object({}),
    annotations: { readOnlyHint: true, title: 'List folders' },
    execute: logged(core, 'list_folders', async () => {
      const tree = await core.folders.tree();
      return {
        text: tree.length ? formatTree(tree) : 'Папок пока нет.',
        count: flattenTree(tree).length,
      };
    }),
  });

  server.addTool({
    name: 'list_projects',
    description: `List the user's projects (folders inside "${PROJECTS_ROOT}") with rule counters.`,
    parameters: z.object({}),
    annotations: { readOnlyHint: true, title: 'List projects' },
    execute: logged(core, 'list_projects', async () => {
      const projects = await core.folders.projects();
      const text = projects.length
        ? projects.map((p) => `- ${p.name} (${p.total_count})`).join('\n')
        : 'Проектов пока нет.';
      return { text, count: projects.length };
    }),
  });

  server.addTool({
    name: 'get_project',
    description: 'Get all rules of one project, grouped by folder.',
    parameters: z.object({
      name: z.string().min(1).max(80).describe('Project name'),
      cursor: z.string().max(100).optional(),
    }),
    annotations: { readOnlyHint: true, title: 'Get project' },
    execute: logged(core, 'get_project', (a) => folderPage([PROJECTS_ROOT, a.name], a.cursor, 50)),
  });

  if (config.MCP_ALLOW_WRITE) {
    server.addTool({
      name: 'add_preference',
      description:
        'Save a new user preference from a natural-language phrase. Runs the same pipeline as the UI: enrichment, folder choice, conflict/duplicate detection.',
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
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, title: 'Add preference' },
      execute: logged(core, 'add_preference', async (a) => {
        const r = await core.prefs.save({
          text: a.text,
          source: 'mcp',
          projectHint: a.project ?? null,
        });
        const labels = {
          created: 'создано',
          updated: 'обновлено (конфликт)',
          duplicate: 'дубль',
          project_created: 'проект создан',
        };
        const lines = [`Результат: ${labels[r.action]} · папка: ${r.folder.path.join(' › ')}`];
        if (r.preference) lines.push(formatByFolder([r.preference]));
        if (r.replaced) lines.push(`Прежняя версия: ${r.replaced.statement}`);
        return { text: lines.join('\n\n'), count: r.preference ? 1 : 0 };
      }),
    });
  }

  server.addResource({
    uri: 'preferences://main',
    name: 'PREFERENCES.md',
    description: 'The main file: the whole folder tree with every rule',
    mimeType: 'text/markdown',
    async load() {
      return { text: await core.exportMarkdown() };
    },
  });

  server.addResourceTemplate({
    uriTemplate: 'preferences://folder/{path}',
    name: 'Folder branch',
    description: 'PREFERENCES.md for one branch; path segments separated by "/" (URL-encoded)',
    mimeType: 'text/markdown',
    arguments: [
      { name: 'path', description: 'Folder path, e.g. Programming/Code', required: true },
    ],
    async load({ path }) {
      return { text: await core.exportMarkdown(normalizeFolderPath(decodeURIComponent(path))) };
    },
  });

  server.addPrompt({
    name: 'apply_my_preferences',
    description: "Load the user's preferences for the current task and follow them",
    arguments: [{ name: 'task', description: 'The task you are going to do', required: false }],
    load: async (args) =>
      `Перед началом работы загрузи мои предпочтения: вызови инструмент get_context_for_task` +
      (args.task ? ` с task="${args.task}"` : ' с описанием текущей задачи') +
      `. Строго соблюдай все constraints, учитывай «люблю» и избегай «не люблю». Если правило противоречит задаче — спроси меня.`,
  });

  return server;
}
