import { z } from 'zod';

export const KNOWN_DOMAINS = [
  'programming',
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
  strength: z.number().int().min(1).max(5),
  language: z.string().trim().toLowerCase().min(2).max(8),
});
export type Enrichment = z.infer<typeof enrichmentSchema>;

/** Full payload of a point in the preferences collection. Every field is always present. */
export interface PreferencePayload {
  id: string;
  statement: string;
  details: string | null;
  raw_text: string;
  polarity: Polarity;
  domain: string;
  project: string | null;
  applies_to: string[];
  tags: string[];
  constraints: Constraint[];
  constraint_metrics: string[];
  strength: number;
  language: string;
  folder_id: string;
  folder_name: string;
  folder_path: string[];
  folder_ancestors: string[];
  folder_depth: number;
  source: Source;
  is_active: boolean;
  history: HistoryEntry[];
  created_at: string;
  updated_at: string;
}

export interface FolderPayload {
  id: string;
  name: string;
  parent_id: string | null;
  path: string[];
  ancestors: string[];
  depth: number;
  domain: string | null;
  description: string | null;
  preference_count: number;
  created_at: string;
}

export interface FolderNode extends FolderPayload {
  children: FolderNode[];
  /** preferences in this folder and all nested folders */
  total_count: number;
}

export interface PreferenceFilter {
  folder?: string | string[] | undefined;
  domain?: string | string[] | undefined;
  project?: string | undefined;
  polarity?: Polarity | undefined;
  applies_to?: string[] | undefined;
  tags?: string[] | undefined;
  metric?: string | undefined;
  min_strength?: number | undefined;
  updated_after?: string | undefined;
  source?: Source | undefined;
  include_inactive?: boolean | undefined;
}

export interface ScoredPreference {
  preference: PreferencePayload;
  score: number | null;
}

export type SaveAction = 'created' | 'updated' | 'duplicate' | 'project_created';

export interface SaveResult {
  action: SaveAction;
  preference: PreferencePayload | null;
  replaced?: HistoryEntry | undefined;
  folder: FolderPayload;
  reason?: string | null;
}

export interface Preview {
  text: string;
  enrichment: Enrichment;
  folder_exists: boolean;
  similar_folders: { path: string[]; score: number }[];
}
