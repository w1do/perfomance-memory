/**
 * OAuth discovery (MCP 2025-06-18): метаданные защищённого ресурса (RFC 9728) и сервера авторизации (RFC 8414).
 * Адреса строятся от PUBLIC_URL — в проде он должен быть https://ваш-домен.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Config } from '@preference-memory/core';

export const cors = (reply: FastifyReply) =>
  reply.header('access-control-allow-origin', '*').header('cache-control', 'no-store');

export function oauthMetadataRoutes(app: FastifyInstance, config: Config): void {
  const base = config.PUBLIC_URL;
  const resource = {
    resource: `${base}/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp'],
    resource_name: 'Память предпочтений',
  };
  const server = {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp'],
    client_id_metadata_document_supported: true,
  };
  for (const path of [
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-protected-resource/mcp',
  ]) {
    app.get(path, async (_req, reply) => cors(reply).send(resource));
  }
  for (const path of [
    '/.well-known/oauth-authorization-server',
    '/.well-known/openid-configuration',
  ]) {
    app.get(path, async (_req, reply) => cors(reply).send(server));
  }
}
