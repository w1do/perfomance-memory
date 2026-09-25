/** Ресурсы MCP (preferences://main, preferences://folder/{path}) и промпт apply_my_preferences. */
import { normalizeFolderPath, type Core } from '@preference-memory/core';
import type { Server } from './tools/common.js';

export function registerResources(server: Server, core: Core): void {
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
}
