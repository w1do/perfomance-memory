import { z } from 'zod';
import { alignPolarityLeaf, polarityFolderName, sameName, sanitizePath } from '../folders/tree.js';
import { mentions } from '../text/mentions.js';
import {
  PROJECTS_ROOT,
  constraintSchema,
  enrichmentSchema,
  type Constraint,
  type Enrichment,
} from '../types.js';

export class EnrichmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnrichmentError';
  }
}

const looseSchema = z.object({
  kind: z.string().optional(),
  statement: z.string(),
  details: z.string().nullable().optional(),
  polarity: z.string(),
  folder_path: z.array(z.string()),
  domain: z.string(),
  project: z.string().nullable().optional(),
  applies_to: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  constraints: z.array(z.unknown()).optional(),
  conditions: z.array(z.unknown()).optional(),
  strength: z.number().optional(),
  language: z.string().optional(),
});

/** Models sometimes return the string "null" instead of null. */
const text = (v: string | null | undefined): string | null => {
  const t = v?.trim() ?? '';
  return t && !['null', 'none', 'n/a', '-', 'нет'].includes(t.toLowerCase()) ? t : null;
};

const uniqLower = (items: string[], max: number): string[] => {
  const out: string[] = [];
  for (const raw of items) {
    const v = raw.trim().toLowerCase();
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, max);
};

const NEGATE: Record<Constraint['operator'], Constraint['operator']> = {
  '<': '>=',
  '<=': '>',
  '>': '<=',
  '>=': '<',
  '=': '!=',
  '!=': '=',
};

/**
 * The model returns conditions literally ("files longer than 100 lines" → file_lines > 100).
 * A constraint is the requirement to satisfy: kept as is for «like», negated for «dislike».
 */
export function conditionToConstraint(c: Constraint, polarity: 'like' | 'dislike'): Constraint {
  return polarity === 'dislike' ? { ...c, operator: NEGATE[c.operator] } : c;
}

export function constraintMetrics(constraints: Constraint[]): string[] {
  return uniqLower(
    constraints.map((c) => c.metric),
    20,
  );
}

/** Topic folder for a domain when the model filed a rule under a project nobody named. */
const DOMAIN_TOPIC: Record<string, string> = {
  programming: 'Программирование',
  ai_assistants: 'ИИ-ассистенты',
  fishing: 'Рыбалка',
  travel: 'Путешествия',
  food: 'Еда',
  communication: 'Общение',
};

/** Targets that describe scope rather than a named thing, so they need not appear in the phrase. */
const ABSTRACT_TARGETS = new Set(['me', 'any_ai']);
const POLARITY_TAGS = new Set([
  'люблю',
  'не люблю',
  'нравится',
  'не нравится',
  'предпочтения',
  'предпочтение',
  'like',
  'dislike',
]);
const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Validates and cleans raw model output. Never adds information the model did not return.
 * With sourceText, targets the phrase never mentions are dropped (the model must not invent them).
 */
export function normalizeEnrichment(
  raw: unknown,
  opts: { sourceText?: string; projectHint?: string | null } = {},
): Enrichment {
  const parsed = looseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new EnrichmentError(
      `Модель вернула неполную структуру: ${parsed.error.issues[0]?.message ?? ''}`,
    );
  }
  const r = parsed.data;
  const polarity = r.polarity === 'like' ? 'like' : 'dislike';
  const kind = r.kind === 'project_only' ? 'project_only' : 'preference';
  let project = text(r.project);
  let path = sanitizePath(r.folder_path);
  let rawDomain = r.domain;
  // A project must be named by the user (in the phrase or explicitly) — the model must not attach one.
  const named = (p: string) =>
    (opts.projectHint ? sameName(opts.projectHint, p) : false) ||
    mentions(opts.sourceText ?? '', p);
  if (opts.sourceText !== undefined) {
    if (project && !named(project)) project = null;
    const pathProject =
      path[0] !== undefined && sameName(path[0], PROJECTS_ROOT) ? path[1] : undefined;
    if (pathProject && !named(pathProject)) {
      if (rawDomain.trim().toLowerCase() === 'project') rawDomain = 'other';
      const topic = DOMAIN_TOPIC[rawDomain.trim().toLowerCase()] ?? 'Разное';
      path = [topic, polarityFolderName(r.polarity === 'like' ? 'like' : 'dislike')];
    }
  }
  if (kind === 'project_only' && project) path = [PROJECTS_ROOT, project];
  if (kind === 'preference') path = alignPolarityLeaf(path, polarity);
  if (!path.length) throw new EnrichmentError('Модель не предложила папку');

  // model output carries literal `conditions`; an edited preview already carries `constraints`
  const fromModel = r.conditions !== undefined;
  const constraints: Constraint[] = [];
  for (const c of fromModel ? (r.conditions ?? []) : (r.constraints ?? [])) {
    const ok = constraintSchema.safeParse(c);
    if (ok.success)
      constraints.push(fromModel ? conditionToConstraint(ok.data, polarity) : ok.data);
  }
  const statement = r.statement.trim();
  let domain =
    rawDomain
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'other';
  if (domain === 'other' && project && path[0] === PROJECTS_ROOT) domain = 'project';
  const details = text(r.details);
  const result = enrichmentSchema.safeParse({
    kind,
    statement: statement.charAt(0).toUpperCase() + statement.slice(1),
    details,
    polarity,
    folder_path: path,
    domain,
    project,
    applies_to: uniqLower(r.applies_to ?? [], 12).filter(
      (a) =>
        !opts.sourceText || ABSTRACT_TARGETS.has(a) || squash(opts.sourceText).includes(squash(a)),
    ),
    tags: uniqLower(r.tags ?? [], 7).filter(
      (t) => !POLARITY_TAGS.has(t) && !/^\d+$/.test(t) && t.length > 1,
    ),
    constraints,
    strength: Math.min(5, Math.max(1, Math.round(r.strength ?? 3))),
    language: (r.language ?? 'ru').trim().toLowerCase() || 'ru',
  });
  if (!result.success) {
    throw new EnrichmentError(
      `Некорректный ответ модели: ${result.error.issues[0]?.message ?? ''}`,
    );
  }
  return result.data;
}
