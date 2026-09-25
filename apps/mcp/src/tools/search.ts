/** get_preferences — фильтр по метаданным + гибридный поиск (dense + BM25), результат по папкам. */
import { z } from 'zod';
import { formatByFolder, normalizeFolderPath, type Core } from '@preference-memory/core';
import { csvList, logged, topK, type Server } from './common.js';

export function registerSearchTool(server: Server, core: Core): void {
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
          'programming, devops, ai_assistants, fishing, travel, food, communication, project, other…',
        ),
      project: z.string().max(80).optional().describe('Project name'),
      polarity: z.enum(['like', 'dislike']).optional(),
      level: z
        .enum(['hard', 'default', 'taste'])
        .optional()
        .describe('hard = must, default = follow unless justified, taste = mild'),
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
          level: a.level,
          applies_to: a.applies_to,
          tags: a.tags,
        },
        a.top_k ?? core.config.SEARCH_TOP_K,
      );
      return { text: formatByFolder(hits.map((h) => h.preference)), count: hits.length };
    }),
  });
}
