import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Core } from '@preference-memory/core';
import { registerAuth } from './auth.js';
import { errorHandler } from './errors.js';
import { folderRoutes } from './routes/folders.js';
import { metaRoutes, type MetaOptions } from './routes/meta.js';
import { preferenceRoutes } from './routes/preferences.js';
import { transcribeRoutes } from './routes/transcribe.js';

export async function buildServer(core: Core, opts: MetaOptions): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: core.log.child({ module: 'http' }) as FastifyBaseLogger,
    bodyLimit: 1_048_576,
    trustProxy: true,
  });
  app.setErrorHandler(errorHandler);
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: core.config.MAX_AUDIO_MB * 1024 * 1024, files: 1 },
  });
  registerAuth(app, core.config);
  metaRoutes(app, core, opts);
  transcribeRoutes(app, core);
  preferenceRoutes(app, core);
  folderRoutes(app, core);
  return app;
}
