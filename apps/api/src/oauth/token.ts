/**
 * /oauth/token: authorization_code (+ PKCE S256) и refresh_token → access_token (7 дней) + refresh_token (90 дней).
 * Публичные клиенты без секрета (token_endpoint_auth_method: none), как требует MCP для коннекторов.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  ACCESS_TTL_S,
  oauth,
  pkceMatches,
  type Config,
  type OAuthGrant,
} from '@preference-memory/core';
import { cors } from './metadata.js';

const fail = (reply: FastifyReply, error: string, description: string) =>
  cors(reply).status(400).send({ error, error_description: description });

function tokens(config: Config, grant: OAuthGrant) {
  return {
    access_token: oauth.issueAccess(config.MCP_TOKEN, grant),
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_S,
    refresh_token: oauth.issueRefresh(config.MCP_TOKEN, grant),
    scope: grant.scope,
  };
}

export function oauthTokenRoute(app: FastifyInstance, config: Config): void {
  app.post('/oauth/token', async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, string | undefined>;
    if (b.grant_type === 'authorization_code') {
      const code = b.code ? oauth.readCode(config.MCP_TOKEN, b.code) : null;
      if (!code) return fail(reply, 'invalid_grant', 'код недействителен или истёк');
      if (b.client_id && b.client_id !== code.client_id)
        return fail(reply, 'invalid_grant', 'client_id не совпадает');
      if (b.redirect_uri && b.redirect_uri !== code.redirect_uri) {
        return fail(reply, 'invalid_grant', 'redirect_uri не совпадает');
      }
      if (!b.code_verifier || !pkceMatches(b.code_verifier, code.code_challenge)) {
        return fail(reply, 'invalid_grant', 'PKCE: code_verifier не подходит');
      }
      return cors(reply).send(tokens(config, { client_id: code.client_id, scope: code.scope }));
    }
    if (b.grant_type === 'refresh_token') {
      const grant = b.refresh_token ? oauth.readRefresh(config.MCP_TOKEN, b.refresh_token) : null;
      if (!grant || (b.client_id && b.client_id !== grant.client_id)) {
        return fail(reply, 'invalid_grant', 'refresh_token недействителен');
      }
      return cors(reply).send(tokens(config, grant));
    }
    return fail(
      reply,
      'unsupported_grant_type',
      'поддерживаются authorization_code и refresh_token',
    );
  });
}
