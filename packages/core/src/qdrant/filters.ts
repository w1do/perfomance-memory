import type { PreferenceFilter } from '../types.js';

export interface FieldCondition {
  key: string;
  match?: { value: string | number | boolean } | { any: string[] };
  range?: { gte?: number; gt?: string | number; lte?: number };
  is_empty?: { key: string };
}

export type Condition = FieldCondition | { is_empty: { key: string } } | QFilter;

export interface QFilter {
  must?: Condition[];
  should?: Condition[];
  must_not?: Condition[];
  min_should?: { conditions: Condition[]; min_count: number };
}

const list = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : (Array.isArray(v) ? v : [v]).map((s) => s.trim()).filter(Boolean);

function matchOne(key: string, values: string[]): FieldCondition {
  return values.length === 1
    ? { key, match: { value: values[0] as string } }
    : { key, match: { any: values } };
}

/** Normalises "A / B/C" → "A/B/C" (the folder_ancestors form). */
export function normalizeFolderPath(path: string): string {
  return path
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('/');
}

/** Metadata filter for the preferences collection. Every condition hits a payload index. */
export function buildPreferenceFilter(f: PreferenceFilter = {}): QFilter {
  const must: Condition[] = [];
  if (!f.include_inactive) must.push({ key: 'is_active', match: { value: true } });
  const folders = list(f.folder).map(normalizeFolderPath).filter(Boolean);
  if (folders.length) must.push(matchOne('folder_ancestors', folders));
  const domains = list(f.domain).map((d) => d.toLowerCase());
  if (domains.length) must.push(matchOne('domain', domains));
  if (f.project) must.push({ key: 'project', match: { value: f.project } });
  if (f.polarity) must.push({ key: 'polarity', match: { value: f.polarity } });
  const applies = list(f.applies_to).map((a) => a.toLowerCase());
  if (applies.length) must.push({ key: 'applies_to', match: { any: applies } });
  const tags = list(f.tags).map((t) => t.toLowerCase());
  if (tags.length) must.push({ key: 'tags', match: { any: tags } });
  if (f.metric) must.push({ key: 'constraint_metrics', match: { value: f.metric.toLowerCase() } });
  if (f.min_strength !== undefined) must.push({ key: 'strength', range: { gte: f.min_strength } });
  if (f.updated_after) must.push({ key: 'updated_at', range: { gt: f.updated_after } });
  if (f.source) must.push({ key: 'source', match: { value: f.source } });
  return { must };
}

export function andFilter(...filters: (QFilter | undefined)[]): QFilter {
  const must: Condition[] = [];
  for (const f of filters) if (f) must.push(f);
  return { must };
}
