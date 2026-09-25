export type Polarity = 'like' | 'dislike';
/** жёстко / по умолчанию / вкус */
export type Level = 'hard' | 'default' | 'taste';

/** «почему» и пример «так / не так» — только со слов пользователя */
export interface Rationale {
  why: string | null;
  example_good: string | null;
  example_bad: string | null;
}

export interface Constraint {
  metric: string;
  operator: '<' | '<=' | '=' | '!=' | '>=' | '>';
  value: number | string | boolean;
  unit: string | null;
}

export interface HistoryEntry {
  statement: string;
  details: string | null;
  polarity: Polarity;
  folder_path: string[];
  strength: number;
  level?: Level;
  constraints: Constraint[];
  raw_text: string;
  changed_at: string;
  reason: string | null;
}

export interface Preference extends Rationale {
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
  strength: number;
  language: string;
  folder_id: string;
  folder_name: string;
  folder_path: string[];
  folder_ancestors: string[];
  folder_depth: number;
  source: 'voice' | 'text' | 'mcp';
  is_active: boolean;
  history: HistoryEntry[];
  created_at: string;
  updated_at: string;
}

export interface FolderNode {
  id: string;
  name: string;
  parent_id: string | null;
  path: string[];
  depth: number;
  domain: string | null;
  description: string | null;
  preference_count: number;
  total_count: number;
  children: FolderNode[];
}

export interface Enrichment extends Rationale {
  kind: 'preference' | 'project_only';
  statement: string;
  details: string | null;
  polarity: Polarity;
  folder_path: string[];
  domain: string;
  project: string | null;
  applies_to: string[];
  tags: string[];
  constraints: Constraint[];
  level: Level;
  strength: number;
  language: string;
}

export interface Preview {
  text: string;
  enrichment: Enrichment;
  folder_exists: boolean;
  similar_folders: { path: string[]; score: number }[];
}

export interface SaveResult {
  action: 'created' | 'updated' | 'duplicate' | 'project_created';
  preference: Preference | null;
  replaced?: HistoryEntry;
  folder: { path: string[] };
  reason?: string | null;
}

export interface Stats {
  total: number;
  like: number;
  dislike: number;
  folders: number;
  projects: number;
  last: Preference | null;
}

export interface Status {
  services: { api: string; qdrant: string; mcp: string };
  models: { stt: string; llm: string; embed: string; embed_dim: number; stt_language: string };
  mcp: { url: string; allow_write: boolean };
  public_url: string;
  auth_enabled: boolean;
  max_audio_mb: number;
  links: {
    telegram: string;
    contact: string;
    studio: string;
    studio_name: string;
    youtube: string;
  };
}

export type Facets = Record<string, { value: string; count: number }[]>;

export interface Filters {
  folder?: string;
  domain?: string;
  project?: string;
  polarity?: Polarity;
  applies_to?: string;
  tags?: string;
  metric?: string;
  level?: Level;
  q?: string;
}
