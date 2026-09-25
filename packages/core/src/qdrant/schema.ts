/** Payload index definitions. Every metadata field of PROMPT §2 is indexed. */

export type IndexSchema =
  | 'keyword'
  | 'integer'
  | 'bool'
  | 'datetime'
  | { type: 'text'; tokenizer: 'multilingual'; lowercase: true };

export interface IndexSpec {
  field: string;
  schema: IndexSchema;
}

const TEXT: IndexSchema = { type: 'text', tokenizer: 'multilingual', lowercase: true };

export const PREFERENCE_INDEXES: IndexSpec[] = [
  ...[
    'polarity',
    'domain',
    'project',
    'applies_to',
    'tags',
    'folder_id',
    'folder_ancestors',
    'constraint_metrics',
    'source',
    'language',
    'level',
  ].map((field) => ({ field, schema: 'keyword' as const })),
  { field: 'strength', schema: 'integer' },
  { field: 'folder_depth', schema: 'integer' },
  { field: 'is_active', schema: 'bool' },
  { field: 'created_at', schema: 'datetime' },
  { field: 'updated_at', schema: 'datetime' },
  { field: 'statement', schema: TEXT },
  { field: 'details', schema: TEXT },
  { field: 'why', schema: TEXT },
];

export const FOLDER_INDEXES: IndexSpec[] = [
  { field: 'parent_id', schema: 'keyword' },
  { field: 'ancestors', schema: 'keyword' },
  { field: 'domain', schema: 'keyword' },
  { field: 'depth', schema: 'integer' },
];

export const DENSE = 'dense';
export const SPARSE = 'sparse';

/** Fixed id of the service point that stores the embedding configuration. */
export const CONFIG_POINT_ID = '00000000-0000-4000-8000-000000000001';
export const SCHEMA_VERSION = 1;

export function metaCollectionName(preferencesCollection: string): string {
  return `${preferencesCollection}__service`;
}

export function indexTypeName(schema: IndexSchema): string {
  return typeof schema === 'string' ? schema : schema.type;
}
