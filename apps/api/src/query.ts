import { z } from 'zod';
import type { PreferenceFilter } from '@preference-memory/core';

/** Comma-separated or repeated query params → string[] */
const csv = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) =>
    v === undefined
      ? undefined
      : (Array.isArray(v) ? v : [v])
          .flatMap((s) => s.split(','))
          .map((s) => s.trim())
          .filter(Boolean),
  );

export const filterQuerySchema = z.object({
  folder: z.string().trim().min(1).optional(),
  domain: csv,
  project: z.string().trim().min(1).optional(),
  polarity: z.enum(['like', 'dislike']).optional(),
  applies_to: csv,
  tags: csv,
  metric: z.string().trim().min(1).optional(),
  min_strength: z.coerce.number().int().min(1).max(5).optional(),
  level: z.enum(['hard', 'default', 'taste']).optional(),
  updated_after: z.iso.datetime({ offset: true }).or(z.iso.date()).optional(),
  source: z.enum(['voice', 'text', 'mcp']).optional(),
});

export const listQuerySchema = filterQuerySchema.extend({
  q: z.string().trim().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.string().max(100).optional(),
});

export function toFilter(q: z.infer<typeof filterQuerySchema>): PreferenceFilter {
  return {
    folder: q.folder,
    domain: q.domain,
    project: q.project,
    polarity: q.polarity,
    applies_to: q.applies_to,
    tags: q.tags,
    metric: q.metric,
    min_strength: q.min_strength,
    level: q.level,
    updated_after: q.updated_after,
    source: q.source,
  };
}
