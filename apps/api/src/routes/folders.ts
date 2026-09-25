import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { domainSchema, type Core } from '@preference-memory/core';

const idParams = z.object({ id: z.uuid() });
const nullableText = z.string().trim().max(300).nullable();

export function folderRoutes(app: FastifyInstance, core: Core): void {
  app.get('/api/folders', async () => ({ tree: await core.folders.tree() }));

  app.post('/api/folders', async (req, reply) => {
    const body = z
      .object({
        name: z.string(),
        parent_id: z.uuid().nullable().optional(),
        domain: domainSchema.nullable().optional(),
        description: nullableText.optional(),
      })
      .parse(req.body);
    const folder = await core.prefs.write(() => core.folders.create(body));
    return reply.status(201).send(folder);
  });

  app.patch('/api/folders/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    const body = z
      .object({
        name: z.string().optional(),
        parent_id: z.uuid().nullable().optional(),
        domain: domainSchema.nullable().optional(),
        description: nullableText.optional(),
      })
      .strict()
      .parse(req.body);
    return core.prefs.write(() => core.folders.update(id, body));
  });

  app.delete('/api/folders/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    const { force } = z.object({ force: z.enum(['true', 'false']).optional() }).parse(req.query);
    return core.prefs.write(() => core.folders.remove(id, force === 'true'));
  });
}
