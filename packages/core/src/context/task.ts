/**
 * Главный вход агента (get_context_for_task): по задаче определяет домены и проект, сужает по индексам и отдаёт:
 * все правила названного проекта (без обрезки top_k), все общие правила его стека (stack.ts), ранжированные правила доменов (top_k), все жёсткие
 * правила этих доменов (уровень «жёстко» или ограничения) и число правил, которые подошли, но не показаны (omitted) — агент видит, что отрезано.
 */
import type { AiProvider, TaskContext } from '../ai/provider.js';
import type { FolderService } from '../folders/service.js';
import { sameName } from '../folders/tree.js';
import type { Logger } from '../logger.js';
import type { PreferenceService } from '../preferences/service.js';
import { mentions } from '../text/mentions.js';
import { foreignTo, projectStack } from './stack.js';
import type { PreferencePayload, ScoredPreference } from '../types.js';

export interface TaskContextResult {
  context: TaskContext;
  /** все правила названного проекта, сильные первыми */
  project_rules: PreferencePayload[];
  /** общие правила стека проекта — целиком, без ранжирования (stack.ts) */
  stack_rules: PreferencePayload[];
  /** стек проекта: цели его правил с подразумеваемыми */
  stack: string[];
  /** ранжированные правила доменов задачи (вне проекта), не больше top_k */
  preferences: ScoredPreference[];
  /** жёсткие правила доменов (уровень «жёстко» или с ограничениями), не попавшие в ранжированный список */
  hard_constraints: PreferencePayload[];
  /** сколько правил доменов подошло, но не показано */
  omitted: number;
}

type Deps = { ai: AiProvider; prefs: PreferenceService; folders: FolderService; log: Logger };

const byImportance = (a: PreferencePayload, b: PreferencePayload) =>
  b.strength - a.strength || b.updated_at.localeCompare(a.updated_at);

async function classify(deps: Deps, task: string): Promise<TaskContext> {
  const [facets, projectNodes] = await Promise.all([deps.prefs.facets(), deps.folders.projects()]);
  const domains = (facets.domain ?? []).map((d) => d.value);
  const projects = projectNodes.map((p) => p.name);
  try {
    const raw = await deps.ai.classifyTask(task, domains, projects);
    return {
      domains: (raw.domains ?? []).filter((d) => domains.includes(d) && d !== 'project'),
      // проект засчитывается, только если он назван в задаче — модель не приписывает его сама
      project:
        projects.find((p) => raw.project && sameName(p, raw.project) && mentions(task, p)) ??
        projects.find((p) => mentions(task, p)) ??
        null,
      applies_to: (raw.applies_to ?? []).map((a) => a.toLowerCase()),
    };
  } catch (err) {
    deps.log.warn(
      { err: (err as Error).message },
      'task classification failed, searching everywhere',
    );
    return {
      domains: [],
      project: projects.find((p) => mentions(task, p)) ?? null,
      applies_to: [],
    };
  }
}

export async function contextForTask(
  deps: Deps,
  input: { task: string; applies_to?: string[] | undefined; top_k: number },
): Promise<TaskContextResult> {
  const ctx = await classify(deps, input.task);
  const applies = input.applies_to?.length ? input.applies_to : undefined;

  const project_rules = ctx.project
    ? (await deps.prefs.all({ project: ctx.project, applies_to: applies })).sort(byImportance)
    : [];
  const { targets: stack, rules } = ctx.project
    ? await projectStack(deps.prefs, project_rules, ctx.domains, applies)
    : { targets: [], rules: [] };
  const stack_rules = rules.sort(byImportance);
  const shown = new Set([...project_rules, ...stack_rules].map((p) => p.id));
  const base = { context: ctx, project_rules, stack_rules, stack };
  const foreign = ctx.project ? foreignTo(ctx.project, stack) : () => false;

  // Домены задачи; без доменов и без проекта — поиск по всей памяти.
  const scope = ctx.domains.length ? { domain: ctx.domains } : ctx.project ? null : {};
  if (!scope) return { ...base, preferences: [], hard_constraints: [], omitted: 0 };

  const hits = await deps.prefs.search(
    input.task,
    { ...scope, applies_to: applies },
    input.top_k + shown.size,
  );
  const preferences = hits
    .filter((h) => !shown.has(h.preference.id) && !foreign(h.preference))
    .slice(0, input.top_k);
  preferences.forEach((h) => shown.add(h.preference.id));

  const inScope = await deps.prefs.all({ ...scope, applies_to: applies });
  const hard_constraints = ctx.domains.length
    ? inScope
        .filter((p) => (p.constraints.length || p.level === 'hard') && !shown.has(p.id))
        .sort(byImportance)
    : [];
  hard_constraints.forEach((p) => shown.add(p.id));
  const omitted = inScope.filter((p) => !shown.has(p.id) && !foreign(p)).length;
  return { ...base, preferences, hard_constraints, omitted };
}
