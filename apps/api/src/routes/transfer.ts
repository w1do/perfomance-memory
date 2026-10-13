/** Экспорт и импорт схемы предпочтений (JSON-пакет). Логика — core.transfer; здесь только разбор тела. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  IMPORT_MAX_BYTES,
  exportInputSchema,
  importSelectionSchema,
  type Core,
} from '@preference-memory/core';

const pkgBody = z.record(z.string(), z.unknown());

export function transferRoutes(app: FastifyInstance, core: Core): void {
  app.post('/api/export/schema', async (req) =>
    core.transfer.export(exportInputSchema.parse(req.body)),
  );

  app.post('/api/import/schema/preview', { bodyLimit: IMPORT_MAX_BYTES }, async (req) => {
    const body = z.object({ package: pkgBody }).parse(req.body);
    return core.transfer.preview(body.package);
  });

  app.post('/api/import/schema/apply', { bodyLimit: IMPORT_MAX_BYTES }, async (req) => {
    const body = z.object({ package: pkgBody, selection: importSelectionSchema }).parse(req.body);
    return core.transfer.apply(body.package, body.selection);
  });
}
