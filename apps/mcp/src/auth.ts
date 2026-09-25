import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export interface McpAuth extends Record<string, unknown> {
  client: 'bearer';
}

const digest = (s: string) => createHash('sha256').update(s).digest();

/** FastMCP `authenticate`: Authorization: Bearer <MCP_TOKEN>, otherwise HTTP 401. */
export function bearerAuth(token: string) {
  const expected = digest(token);
  return async (req: IncomingMessage): Promise<McpAuth> => {
    const header = req.headers.authorization ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match || !timingSafeEqual(digest((match[1] ?? '').trim()), expected)) {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'content-type': 'application/json', 'www-authenticate': 'Bearer' },
      });
    }
    return { client: 'bearer' };
  };
}
