import { z } from 'zod';
import { levelSchema } from './level.js';

export const KNOWN_DOMAINS = [
  'programming',
  'devops',
  'ai_assistants',
  'fishing',
  'travel',
  'food',
  'communication',
  'project',
  'other',
] as const;

export const PROJECTS_ROOT = 'Проекты';
export const LIKE_FOLDER = 'Люблю';
export const DISLIKE_FOLDER = 'Не люблю';
export const PATH_SEPARATOR = '/';

export const polaritySchema = z.enum(['like', 'dislike']);
export type Polarity = z.infer<typeof polaritySchema>;

export const sourceSchema = z.enum(['voice', 'text', 'mcp']);
export type Source = z.infer<typeof sourceSchema>;

export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_]{1,39}$/, 'domain: латиница в snake_case');

export const folderNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((v) => !v.includes(PATH_SEPARATOR), 'имя папки не может содержать «/»');

export const folderPathSchema = z.array(folderNameSchema).min(1).max(12);

export const constraintOperatorSchema = z.enum(['<', '<=', '=', '!=', '>=', '>']);
export const constraintSchema = z.object({
  metric: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{1,59}$/),
  operator: constraintOperatorSchema,
  value: z.union([z.number(), z.string().min(1).max(80), z.boolean()]),
  unit: z.string().trim().max(30).nullable(),
});
export type Constraint = z.infer<typeof constraintSchema>;

export const historyEntrySchema = z.object({
  statement: z.string(),
  details: z.string().nullable(),
  polarity: polaritySchema,
  folder_path: z.array(z.string()),
  strength: z.number().int(),
  level: levelSchema.optional(),
  constraints: z.array(constraintSchema),
  raw_text: z.string(),
  changed_at: z.string(),
  reason: z.string().nullable(),
});
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

/** What the LLM returns for one user phrase (after normalisation). */
export const enrichmentSchema = z.object({
  kind: z.enum(['preference', 'project_only']),
  statement: z.string().trim().min(1).max(300),
  details: z.string().trim().max(600).nullable(),
  polarity: polaritySchema,
  folder_path: folderPathSchema,
  domain: domainSchema,
  project: z.string().trim().min(1).max(80).nullable(),
  applies_to: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(12),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(7),
  constraints: z.array(constraintSchema).max(10),
  /** жёстко / по умолчанию / вкус; strength выводится из него */
  level: levelSchema,
  strength: z.number().int().min(1).max(5),
  /** почему правило важно — только со слов пользователя */
  why: z.string().trim().max(400).nullable(),
  /** пример «так» и «не так» — только если пользователь его привёл */
  example_good: z.string().trim().max(400).nullable(),
  example_bad: z.string().trim().max(400).nullable(),
  language: z.string().trim().toLowerCase().min(2).max(8),
});
export type Enrichment = z.infer<typeof enrichmentSchema>;

export * from './payloadTypes.js';
export * from './level.js';
