import { z } from 'zod';
import { sanitizePath, withPolarityLeaf } from '../folders/tree.js';
import { cleanTags, guardProject, guardTargets } from './guards.js';
import { rationale, text } from './rationale.js';
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
  level: z.string().optional(),
  strength: z.number().optional(),
  why: z.string().nullable().optional(),
  example_good: z.string().nullable().optional(),
  example_bad: z.string().nullable().optional(),
  language: z.string().optional(),
});

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
  if (opts.sourceText !== undefined) {
    ({
      path,
      project,
      domain: rawDomain,
    } = guardProject({
      path,
      project,
      domain: rawDomain,
      polarity,
      sourceText: opts.sourceText,
      projectHint: opts.projectHint ?? null,
    }));
  }
  if (kind === 'project_only' && project) path = [PROJECTS_ROOT, project];
  if (kind === 'preference') path = withPolarityLeaf(path, polarity);
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
    applies_to: guardTargets(uniqLower(r.applies_to ?? [], 12), opts.sourceText),
    tags: cleanTags(uniqLower(r.tags ?? [], 7)),
    constraints,
    ...rationale(r),
    language: (r.language ?? 'ru').trim().toLowerCase() || 'ru',
  });
  if (!result.success) {
    throw new EnrichmentError(
      `Некорректный ответ модели: ${result.error.issues[0]?.message ?? ''}`,
    );
  }
  return result.data;
}
