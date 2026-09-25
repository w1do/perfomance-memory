/** Входы сервиса правил: сохранение, ручная правка (zod), список, ключи фасетов и ошибка с HTTP-статусом. */
import { z } from 'zod';
import {
  constraintSchema,
  domainSchema,
  folderPathSchema,
  polaritySchema,
  type Source,
} from '../types.js';

export class PreferenceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 422,
  ) {
    super(message);
    this.name = 'PreferenceError';
  }
}

export interface SaveInput {
  text?: string | undefined;
  preview?: { text: string; enrichment: unknown } | undefined;
  source: Source;
  projectHint?: string | null | undefined;
}

export const preferencePatchSchema = z
  .object({
    statement: z.string().trim().min(1).max(300),
    details: z.string().trim().max(600).nullable(),
    polarity: polaritySchema,
    folder_path: folderPathSchema,
    domain: domainSchema,
    project: z.string().trim().min(1).max(80).nullable(),
    applies_to: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(12),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(7),
    constraints: z.array(constraintSchema).max(10),
    strength: z.number().int().min(1).max(5),
  })
  .partial()
  .strict();
export type PreferencePatch = z.infer<typeof preferencePatchSchema>;

export interface ListOptions {
  q?: string | undefined;
  limit?: number | undefined;
  cursor?: string | null | undefined;
}

export const FACET_KEYS = [
  'domain',
  'project',
  'polarity',
  'applies_to',
  'tags',
  'constraint_metrics',
  'source',
  'language',
] as const;
