/** Формы данных в Qdrant и ответах сервиса: точка правила, папка, узел дерева, фильтр, результаты. */
import type { Level } from './level.js';
import type { Constraint, HistoryEntry, Polarity, Source, Enrichment } from './types.js';

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
  level: Level;
  /** 5 / 3 / 1 — выводится из level */
  strength: number;
  why: string | null;
  example_good: string | null;
  example_bad: string | null;
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
  level?: Level | Level[] | undefined;
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
