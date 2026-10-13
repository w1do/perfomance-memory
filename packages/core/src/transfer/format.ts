/** Формат пакета схемы предпочтений (версия 1): константы, лимиты, zod-схемы пакета и входов, типы. */
import { z } from 'zod';
import { levelSchema } from '../level.js';
import { constraintSchema, polaritySchema, type Constraint } from '../types.js';

export const SCHEMA_FORMAT = 'preference-memory/schema';
export const SCHEMA_VERSION = 1;
/** Лимит тела запросов импорта (маршруты api). Не env: это свойство формата, а не настройка развёртывания. */
export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const MAX_FOLDERS = 2000;
export const MAX_PREFERENCES = 5000;
export const MAX_HISTORY = 20;
export const MAX_RAW_TEXT = 4000;

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((v) => (v ? v : null));

export const packageFolderSchema = z.object({
  path: z.array(z.string().max(80)).min(1).max(12),
  domain: z.string().trim().max(40).nullable().default(null),
  description: nullableText(300),
});

export const packageHistorySchema = z.object({
  statement: z.string().max(600),
  details: z.string().max(1200).nullable(),
  polarity: polaritySchema,
  folder_path: z.array(z.string().max(80)).max(12),
  strength: z.number().int().min(1).max(5),
  level: levelSchema.optional(),
  constraints: z.array(constraintSchema).max(10),
  raw_text: z.string().max(MAX_RAW_TEXT),
  changed_at: z.iso.datetime({ offset: true }),
  reason: z.string().max(400).nullable(),
});

export const packagePreferenceSchema = z.object({
  statement: z.string().trim().min(1).max(300),
  details: nullableText(600),
  raw_text: z.string().max(MAX_RAW_TEXT).default(''),
  polarity: polaritySchema,
  domain: z.string().trim().max(40),
  project: z.string().trim().max(80).nullable().default(null),
  applies_to: z.array(z.string().max(40)).max(12).default([]),
  tags: z.array(z.string().max(40)).max(12).default([]),
  constraints: z.array(z.unknown()).max(10).default([]),
  level: levelSchema.default('default'),
  why: nullableText(400),
  example_good: nullableText(400),
  example_bad: nullableText(400),
  language: z.string().trim().max(8).default('ru'),
  folder_path: z.array(z.string().max(80)).min(1).max(12),
  history: z.array(packageHistorySchema).max(MAX_HISTORY).default([]),
});

export const packageSchema = z.object({
  format: z.literal(SCHEMA_FORMAT),
  version: z.number().int().min(1).max(SCHEMA_VERSION),
  name: z.string().trim().min(1).max(120),
  author: nullableText(120),
  description: nullableText(2000),
  exported_at: z.iso.datetime({ offset: true }),
  folders: z.array(z.unknown()).max(MAX_FOLDERS),
  preferences: z.array(z.unknown()).max(MAX_PREFERENCES),
});

export const exportInputSchema = z.object({
  all: z.boolean().default(false),
  folder_ids: z.array(z.uuid()).max(MAX_FOLDERS).default([]),
  name: z.string().trim().min(1).max(120),
  author: nullableText(120),
  description: nullableText(2000),
});
export type ExportInput = z.infer<typeof exportInputSchema>;

export const importSelectionSchema = z.object({
  all: z.boolean().default(false),
  folders: z.array(z.string().trim().min(1).max(1200)).max(MAX_FOLDERS).default([]),
});
export type ImportSelection = z.infer<typeof importSelectionSchema>;

export type PackageFolder = z.output<typeof packageFolderSchema>;
export type PackagePreference = Omit<z.output<typeof packagePreferenceSchema>, 'constraints'> & {
  constraints: Constraint[];
};

export interface PackageHeader {
  format: typeof SCHEMA_FORMAT;
  version: number;
  name: string;
  author: string | null;
  description: string | null;
  exported_at: string;
}

export interface SchemaPackage extends PackageHeader {
  counts: { folders: number; preferences: number };
  folders: PackageFolder[];
  preferences: PackagePreference[];
}

export interface ImportReport {
  /** выбранных правил в пакете, включая невалидные */
  rules_total: number;
  rules_created: number;
  folders_created: number;
  duplicates: number;
  conflicts: number;
  errors: number;
  /** до 20 сообщений по-русски, без содержимого секретов */
  messages: string[];
}
