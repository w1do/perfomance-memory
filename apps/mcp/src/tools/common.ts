/** Общее для инструментов MCP: тип сервера, журнал вызова (имя, длительность, число результатов — без аргументов и секретов), схемы. */
import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import type { Core } from '@preference-memory/core';
import type { McpAuth } from '../auth.js';

export type Server = FastMCP<McpAuth>;

export const csvList = z.array(z.string().min(1).max(60)).max(20);
export const topK = z.number().int().min(1).max(100).optional();

export function logged<A>(
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
