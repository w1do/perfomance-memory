/** Типы передачи схемы: зеркало ответов api (core/transfer), без логики. */
export interface ExportRequest {
  all: boolean;
  folder_ids: string[];
  name: string;
  author: string | null;
  description: string | null;
}

export interface ImportSelection {
  all: boolean;
  folders: string[];
}

export type RuleStatus = 'new' | 'duplicate' | 'conflict';

export interface ImportItem {
  statement: string;
  polarity: 'like' | 'dislike';
  level: 'hard' | 'default' | 'taste';
  status: RuleStatus;
}

export interface ImportNode {
  key: string;
  name: string;
  path: string[];
  exists: boolean;
  total: number;
  skipped: number;
  items: ImportItem[];
  children: ImportNode[];
}

export interface ImportPreview {
  header: {
    format: string;
    version: number;
    name: string;
    author: string | null;
    description: string | null;
    exported_at: string;
  };
  counts: {
    folders: number;
    rules: number;
    new_folders: number;
    duplicates: number;
    conflicts: number;
    invalid: number;
  };
  tree: ImportNode[];
  errors: string[];
}

export interface ImportReport {
  rules_total: number;
  rules_created: number;
  folders_created: number;
  duplicates: number;
  conflicts: number;
  errors: number;
  messages: string[];
}

/** Пакет, который отдаёт экспорт: счётчики известны, остальное — как есть. */
export type SchemaPackageFile = { counts: { folders: number; preferences: number } } & Record<
  string,
  unknown
>;
