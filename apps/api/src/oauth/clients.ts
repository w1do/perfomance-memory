/**
 * Клиенты OAuth: DCR (/oauth/register — client_id подписан и сам хранит redirect_uris) и CIMD
 * (client_id — https-адрес JSON-документа клиента, например у Claude.ai). Разрешены только https
 * redirect_uri и http://localhost / 127.0.0.1 для локальных клиентов.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { oauth, type Config, type OAuthClient } from '@preference-memory/core';
import { cors } from './metadata.js';

export const allowedRedirect = (uri: string) =>
  /^https:\/\//.test(uri) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(uri);

const registerBody = z.object({
  redirect_uris: z.array(z.string().url()).min(1).max(10),
  client_name: z.string().max(200).optional(),
});

/** Клиент по client_id: подписанный (DCR) или документ по https-адресу (CIMD). */
export async function resolveClient(config: Config, clientId: string): Promise<OAuthClient | null> {
  if (clientId.startsWith('https://')) {
    try {
      const res = await fetch(clientId, {
        signal: AbortSignal.timeout(5000),
        headers: { accept: 'application/json' },
      });
      if (!res.ok) return null;
      const doc = (await res.json()) as {
        client_id?: string;
        redirect_uris?: string[];
        client_name?: string;
      };
      if (doc.client_id !== clientId || !doc.redirect_uris?.length) return null;
      return {
        redirect_uris: doc.redirect_uris.filter(allowedRedirect),
        name: doc.client_name ?? new URL(clientId).host,
      };
    } catch {
      return null;
    }
  }
  return oauth.readClient(config.MCP_TOKEN, clientId);
}

export function oauthRegisterRoute(app: FastifyInstance, config: Config): void {
  app.post('/oauth/register', async (req, reply) => {
    const parsed = registerBody.safeParse(req.body);
    if (!parsed.success || !parsed.data.redirect_uris.every(allowedRedirect)) {
      return cors(reply).status(400).send({ error: 'invalid_redirect_uri' });
    }
    const client = {
      redirect_uris: parsed.data.redirect_uris,
      name: parsed.data.client_name ?? 'MCP-клиент',
    };
    const clientId = oauth.registerClient(config.MCP_TOKEN, client);
    return cors(reply)
      .status(201)
      .send({
        client_id: clientId,
        client_name: client.name,
        redirect_uris: client.redirect_uris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      });
  });
}
