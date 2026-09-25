/** Папки и проекты: get_folder (постранично с cursor), list_folders, list_projects, get_project. */
import { z } from 'zod';
import {
  PROJECTS_ROOT,
  flattenTree,
  formatByFolder,
  formatTree,
  splitPath,
  type Core,
} from '@preference-memory/core';
import { logged, type Server } from './common.js';

async function folderPage(core: Core, path: string[], cursor: string | undefined, limit: number) {
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
}

export function registerFolderTools(server: Server, core: Core): void {
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
      folderPage(core, splitPath(a.path), a.cursor, a.limit ?? 50),
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
    execute: logged(core, 'get_project', (a) =>
      folderPage(core, [PROJECTS_ROOT, a.name], a.cursor, 50),
    ),
  });
}
