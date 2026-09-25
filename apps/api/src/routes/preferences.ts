import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { preferencePatchSchema, type Core } from '@preference-memory/core';
import { listQuerySchema, toFilter } from '../query.js';

const idParams = z.object({ id: z.uuid() });

export function preferenceRoutes(app: FastifyInstance, core: Core): void {
  app.post('/api/preferences/preview', async (req) => {
    const body = z
      .object({
        text: z.string().trim().min(1).max(2000),
        project: z.string().trim().max(80).optional(),
      })
      .parse(req.body);
    return core.prefs.preview(body.text, body.project);
  });

  app.post('/api/preferences', async (req) => {
    const body = z
      .object({
        text: z.string().trim().min(1).max(2000).optional(),
        preview: z
          .object({
            text: z.string().trim().min(1).max(2000),
            enrichment: z.record(z.string(), z.unknown()),
          })
          .optional(),
        source: z.enum(['voice', 'text']).default('text'),
      })
      .refine((b) => b.text || b.preview, { message: 'нужен text или preview' })
      .parse(req.body);
    return core.prefs.save({ text: body.text, preview: body.preview, source: body.source });
  });

  app.get('/api/preferences', async (req) => {
    const q = listQuerySchema.parse(req.query);
    return core.prefs.list(toFilter(q), { q: q.q, limit: q.limit, cursor: q.cursor });
  });

  app.get('/api/preferences/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    return core.prefs.get(id);
  });

  app.patch('/api/preferences/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    return core.prefs.update(id, preferencePatchSchema.parse(req.body));
  });

  app.delete('/api/preferences/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    await core.prefs.remove(id);
    return { ok: true };
  });
}
