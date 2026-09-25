/**
 * OAuth для коннекторов (Claude.ai, ChatGPT): подписанные stateless-артефакты без хранилища.
 * client_id (DCR), код авторизации, access и refresh токены — base64url(JSON) + HMAC-SHA256.
 * Ключ выводится из MCP_TOKEN: api выдаёт, mcp проверяет; смена MCP_TOKEN отзывает все выданные токены.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

type Kind = 'client' | 'code' | 'access' | 'refresh';

export interface OAuthClient {
  redirect_uris: string[];
  name: string;
}
export interface OAuthCode {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string;
}
export interface OAuthGrant {
  client_id: string;
  scope: string;
}

export const ACCESS_TTL_S = 7 * 86_400;
export const REFRESH_TTL_S = 90 * 86_400;
export const CODE_TTL_S = 300;

const key = (secret: string) =>
  createHash('sha256').update(`preference-memory-oauth:${secret}`).digest();
const b64 = (s: string) => Buffer.from(s).toString('base64url');

function sign(secret: string, kind: Kind, data: object, ttlS: number | null): string {
  const body = b64(
    JSON.stringify({ k: kind, e: ttlS ? Math.floor(Date.now() / 1000) + ttlS : 0, d: data }),
  );
  const sig = createHmac('sha256', key(secret)).update(body).digest('base64url');
  return `pm.${body}.${sig}`;
}

function open<T>(secret: string, kind: Kind, token: string): T | null {
  const [prefix, body, sig] = token.split('.');
  if (prefix !== 'pm' || !body || !sig) return null;
  const want = createHmac('sha256', key(secret)).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString()) as {
      k: Kind;
      e: number;
      d: T;
    };
    if (parsed.k !== kind) return null;
    if (parsed.e && parsed.e < Math.floor(Date.now() / 1000)) return null;
    return parsed.d;
  } catch {
    return null;
  }
}

export const oauth = {
  /** DCR: client_id сам несёт разрешённые redirect_uris — регистрацию не нужно хранить. */
  registerClient: (secret: string, client: OAuthClient) => sign(secret, 'client', client, null),
  readClient: (secret: string, clientId: string) => open<OAuthClient>(secret, 'client', clientId),
  issueCode: (secret: string, code: OAuthCode) => sign(secret, 'code', code, CODE_TTL_S),
  readCode: (secret: string, code: string) => open<OAuthCode>(secret, 'code', code),
  issueAccess: (secret: string, g: OAuthGrant) => sign(secret, 'access', g, ACCESS_TTL_S),
  issueRefresh: (secret: string, g: OAuthGrant) => sign(secret, 'refresh', g, REFRESH_TTL_S),
  verifyAccess: (secret: string, token: string) => open<OAuthGrant>(secret, 'access', token),
  readRefresh: (secret: string, token: string) => open<OAuthGrant>(secret, 'refresh', token),
};

/** PKCE S256: base64url(sha256(verifier)) === challenge. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  const got = Buffer.from(createHash('sha256').update(verifier).digest('base64url'));
  const want = Buffer.from(challenge);
  return got.length === want.length && timingSafeEqual(got, want);
}
