/**
 * Вход в веб-интерфейс по ADMIN_EMAIL и ADMIN_PASSWORD из .env. Сессия — подписанная httpOnly-cookie
 * (без токенов во фронтенде); ключ подписи выводится из обеих переменных, их смена разлогинивает всех.
 * Все /api/* закрыты, кроме health и auth/*. MCP (/mcp) защищён отдельно — Bearer MCP_TOKEN.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Config } from '@preference-memory/core';
import { LoginLimiter } from './rateLimit.js';

export const SESSION_COOKIE = 'pm_session';
const SESSION_DAYS = 30;

const digest = (s: string) => createHash('sha256').update(s).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

/** Stateless signed session: "<expiresMs>.<hmac>". */
export class Sessions {
  private readonly key: Buffer;

  constructor(
    private readonly email: string,
    private readonly password: string,
  ) {
    this.key = digest(`preference-memory-session:${email.toLowerCase()}:${password}`);
  }

  checkCredentials(email: string, password: string): boolean {
    const emailOk = same(email.trim().toLowerCase(), this.email.toLowerCase());
    const passwordOk = same(password, this.password);
    return emailOk && passwordOk;
  }

  issue(now = Date.now()): { value: string; maxAge: number } {
    const exp = now + SESSION_DAYS * 86_400_000;
    const sig = createHmac('sha256', this.key).update(String(exp)).digest('base64url');
    return { value: `${exp}.${sig}`, maxAge: SESSION_DAYS * 86_400 };
  }

  verify(value: string | undefined, now = Date.now()): boolean {
    if (!value) return false;
    const [exp, sig] = value.split('.');
    if (!exp || !sig || Number(exp) < now) return false;
    const want = createHmac('sha256', this.key).update(exp).digest();
    const got = Buffer.from(sig, 'base64url');
    return got.length === want.length && timingSafeEqual(got, want);
  }
}

const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/auth/login',
  '/api/auth/me',
  '/api/auth/logout',
]);
const loginBody = z.object({ email: z.string().max(320), password: z.string().max(500) });

export function registerAuth(app: FastifyInstance, config: Config): void {
  const sessions = new Sessions(config.ADMIN_EMAIL, config.ADMIN_PASSWORD);
  const limiter = new LoginLimiter();
  const secure = config.PUBLIC_URL.startsWith('https://');

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split('?')[0] ?? '';
    if (PUBLIC_PATHS.has(path)) return;
    if (!sessions.verify(req.cookies[SESSION_COOKIE])) {
      return reply.status(401).send({ error: 'Нужен вход' });
    }
  });

  app.get('/api/auth/me', async (req) => ({
    auth_required: true,
    authenticated: sessions.verify(req.cookies[SESSION_COOKIE]),
  }));

  app.post('/api/auth/login', async (req, reply) => {
    const wait = limiter.retryAfter(req.ip);
    if (wait > 0) {
      return reply
        .status(429)
        .header('retry-after', String(wait))
        .send({ error: `Слишком много попыток. Повторите через ${Math.ceil(wait / 60)} мин.` });
    }
    const { email, password } = loginBody.parse(req.body);
    if (!sessions.checkCredentials(email, password)) {
      limiter.fail(req.ip);
      req.log.warn({ ip: req.ip }, 'login failed');
      await new Promise((r) => setTimeout(r, 600));
      return reply.status(401).send({ error: 'Неверный email или пароль' });
    }
    limiter.reset(req.ip);
    const s = sessions.issue();
    reply.setCookie(SESSION_COOKIE, s.value, {
      httpOnly: true,
      sameSite: 'strict',
      secure,
      path: '/',
      maxAge: s.maxAge,
    });
    return { ok: true };
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });
}
