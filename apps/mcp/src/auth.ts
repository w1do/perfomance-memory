/**
 * FastMCP `authenticate`: токен MCP_TOKEN принимается в `Authorization: Bearer <токен>` (Claude Code, Cursor, Codex…)
 * или в `X-Api-Key: <токен>` (коннекторы Claude.ai / Desktop, где Authorization занят под OAuth). Иначе — HTTP 401.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export interface McpAuth extends Record<string, unknown> {
  client: 'bearer' | 'api-key';
}

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Все предъявленные токены: Bearer и X-Api-Key проверяются независимо, подходит любой верный. */
function presented(req: IncomingMessage): { token: string; client: McpAuth['client'] }[] {
  const out: { token: string; client: McpAuth['client'] }[] = [];
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '');
  if (bearer?.[1]) out.push({ token: bearer[1].trim(), client: 'bearer' });
  const apiKey = req.headers['x-api-key'];
  const value = Array.isArray(apiKey) ? apiKey[0] : apiKey;
  if (value?.trim()) out.push({ token: value.trim(), client: 'api-key' });
  return out;
}

export function bearerAuth(token: string) {
  const expected = digest(token);
  return async (req: IncomingMessage): Promise<McpAuth> => {
    const got = presented(req).find((c) => timingSafeEqual(digest(c.token), expected));
    if (!got) {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'content-type': 'application/json', 'www-authenticate': 'Bearer' },
      });
    }
    return { client: got.client };
  };
}
