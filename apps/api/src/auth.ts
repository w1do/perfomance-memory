import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Config } from '@preference-memory/core';

export const SESSION_COOKIE = 'pm_session';
const SESSION_DAYS = 30;

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Stateless signed session: "<expiresMs>.<hmac>". Key is derived from WEB_PASSWORD. */
export class Sessions {
  private readonly key: Buffer;

  constructor(private readonly password: string) {
    this.key = digest(`preference-memory-session:${password}`);
  }

  get enabled(): boolean {
    return this.password.length > 0;
  }

  checkPassword(candidate: string): boolean {
    return timingSafeEqual(digest(candidate), digest(this.password));
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

export function registerAuth(app: FastifyInstance, config: Config): void {
  const sessions = new Sessions(config.WEB_PASSWORD);
  const secure = config.PUBLIC_URL.startsWith('https://');

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!sessions.enabled) return;
    const path = req.url.split('?')[0] ?? '';
    if (PUBLIC_PATHS.has(path)) return;
    if (!sessions.verify(req.cookies[SESSION_COOKIE])) {
      return reply.status(401).send({ error: 'Нужен вход по паролю' });
    }
  });

  app.get('/api/auth/me', async (req) => ({
    auth_required: sessions.enabled,
    authenticated: !sessions.enabled || sessions.verify(req.cookies[SESSION_COOKIE]),
  }));

  app.post('/api/auth/login', async (req, reply) => {
    const { password } = z.object({ password: z.string().max(500) }).parse(req.body);
    if (!sessions.enabled) return { ok: true };
    if (!sessions.checkPassword(password)) {
      await new Promise((r) => setTimeout(r, 600));
      return reply.status(401).send({ error: 'Неверный пароль' });
    }
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
