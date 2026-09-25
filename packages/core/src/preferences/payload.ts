import { randomUUID } from 'node:crypto';
import { ancestorsOf } from '../folders/tree.js';
import type {
  Enrichment,
  FolderPayload,
  HistoryEntry,
  PreferencePayload,
  Source,
} from '../types.js';
import { constraintMetrics } from './normalize.js';

/** Text used for both dense and sparse vectors: statement + details + folder path + tags. */
export function embeddingText(
  p: Pick<PreferencePayload, 'statement' | 'details' | 'folder_path' | 'tags'>,
): string {
  return [
    p.statement,
    p.details ?? '',
    `Папка: ${p.folder_path.join(' / ')}`,
    p.tags.length ? `Теги: ${p.tags.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('. ');
}

export function folderFields(
  folder: FolderPayload,
): Pick<
  PreferencePayload,
  'folder_id' | 'folder_name' | 'folder_path' | 'folder_ancestors' | 'folder_depth'
> {
  return {
    folder_id: folder.id,
    folder_name: folder.name,
    folder_path: folder.path,
    folder_ancestors: ancestorsOf(folder.path),
    folder_depth: folder.path.length,
  };
}

export function buildPayload(args: {
  enrichment: Enrichment;
  folder: FolderPayload;
  rawText: string;
  source: Source;
  now?: string;
  id?: string;
}): PreferencePayload {
  const now = args.now ?? new Date().toISOString();
  const e = args.enrichment;
  return {
    id: args.id ?? randomUUID(),
    statement: e.statement,
    details: e.details,
    raw_text: args.rawText,
    polarity: e.polarity,
    domain: e.domain,
    project: e.project,
    applies_to: e.applies_to,
    tags: e.tags,
    constraints: e.constraints,
    constraint_metrics: constraintMetrics(e.constraints),
    strength: e.strength,
    language: e.language,
    ...folderFields(args.folder),
    source: args.source,
    is_active: true,
    history: [],
    created_at: now,
    updated_at: now,
  };
}

export function snapshot(p: PreferencePayload, reason: string | null, now: string): HistoryEntry {
  return {
    statement: p.statement,
    details: p.details,
    polarity: p.polarity,
    folder_path: p.folder_path,
    strength: p.strength,
    constraints: p.constraints,
    raw_text: p.raw_text,
    changed_at: now,
    reason,
  };
}
