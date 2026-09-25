/**
 * MCP-сервер на FastMCP: авторизация Bearer/X-Api-Key (auth.ts), инструменты (tools/*), ресурсы и промпт
 * (resources.ts). add_preference регистрируется только при MCP_ALLOW_WRITE=true.
 */
import { FastMCP } from 'fastmcp';
import type { Core } from '@preference-memory/core';
import { bearerAuth, type McpAuth } from './auth.js';
import { registerResources } from './resources.js';
import { registerContextTool } from './tools/context.js';
import { registerFolderTools } from './tools/folders.js';
import { registerSearchTool } from './tools/search.js';
import { registerWriteTool } from './tools/write.js';

export const VERSION = '1.0.0';

export function buildMcpServer(core: Core, opts: { authenticate?: boolean } = {}) {
  const server = new FastMCP<McpAuth>({
    name: 'preference-memory',
    version: VERSION,
    instructions:
      "Personal memory of the user's likes, dislikes and hard constraints, organised in folders. " +
      'Call get_context_for_task at the start of every task and follow the returned constraints strictly.',
    health: { enabled: true, path: '/health', message: 'ok', status: 200 },
    ...(opts.authenticate === false ? {} : { authenticate: bearerAuth(core.config.MCP_TOKEN) }),
  });
  registerContextTool(server, core);
  registerSearchTool(server, core);
  registerFolderTools(server, core);
  if (core.config.MCP_ALLOW_WRITE) registerWriteTool(server, core);
  registerResources(server, core);
  return server;
}
