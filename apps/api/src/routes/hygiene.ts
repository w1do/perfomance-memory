/** Гигиена памяти: найти дубли, слить группу в одно правило, пометить «не дубли», «Распределить» по папкам. Логика — core.hygiene. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { domainSchema, folderPathSchema, type Core } from '@preference-memory/core';

export function hygieneRoutes(app: FastifyInstance, core: Core): void {
  app.get('/api/hygiene/duplicates', async () => ({ groups: await core.hygiene.duplicates() }));

  app.post('/api/hygiene/merge', async (req) => {
    const body = z
      .object({ keep: z.uuid(), remove: z.array(z.uuid()).min(1).max(50) })
      .parse(req.body);
    return core.hygiene.merge(body.keep, body.remove);
  });

  app.get('/api/hygiene/placements', async () => ({
    placements: await core.hygiene.placements(),
  }));

  app.post('/api/hygiene/place', async (req) => {
    const move = z.object({ id: z.uuid(), to: folderPathSchema, domain: domainSchema });
    const body = z.object({ moves: z.array(move).min(1).max(500) }).parse(req.body);
    return core.hygiene.place(body.moves);
  });

  app.post('/api/hygiene/distinct', async (req) => {
    const body = z.object({ ids: z.array(z.uuid()).min(2).max(50) }).parse(req.body);
    await core.hygiene.distinct(body.ids);
    return { ok: true };
  });
}
