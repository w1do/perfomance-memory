/**
 * Главный вход агента (get_context_for_task): по задаче определяет домены и проект, сужает по индексам и отдаёт:
 * все правила названного проекта (без обрезки top_k), все общие правила, которые он наследует (scope.ts), правила работы ассистента
 * (домен ai_assistants — контекст всегда читает агент, поэтому они в каждой задаче), ранжированные правила доменов (top_k), все жёсткие
 * правила этих доменов (уровень «жёстко» или ограничения) и число правил, которые подошли, но не показаны (omitted) — агент видит, что отрезано.
 */
import type { AiProvider, TaskContext } from '../ai/provider.js';
import type { FolderService } from '../folders/service.js';
import { sameName } from '../folders/tree.js';
import type { Logger } from '../logger.js';
import type { PreferenceService } from '../preferences/service.js';
import { mentions } from '../text/mentions.js';
import { foreignTo, projectScope } from './scope.js';
import type { PreferencePayload, ScoredPreference } from '../types.js';

/** Домен правил о том, как ассистент работает с пользователем: их читатель — любой агент, поэтому они входят в каждую задачу. */
const ASSISTANT_DOMAIN = 'ai_assistants';

export interface TaskContextResult {
  context: TaskContext;
  /** все правила названного проекта, сильные первыми */
  project_rules: PreferencePayload[];
  /** общие правила, которые наследует проект, — целиком, без ранжирования (scope.ts) */
  inherited: PreferencePayload[];
  /** правила работы ассистента (домен ai_assistants, вне проектов) — в каждой задаче, без ранжирования */
  assistant: PreferencePayload[];
  /** область проекта: метки и темы, по которым правила наследуются */
  scope: { targets: string[]; topics: string[] };
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
  const { rules, ...area } = ctx.project
    ? await projectScope(deps.prefs, project_rules, ctx, applies)
    : { targets: [], topics: [], rules: [] };
  const assistant = (await deps.prefs.all({ domain: ASSISTANT_DOMAIN, applies_to: applies }))
    .filter((p) => !p.project)
    .sort(byImportance);
  const assistantIds = new Set(assistant.map((p) => p.id));
  const inherited = rules.filter((p) => !assistantIds.has(p.id)).sort(byImportance);
  const shown = new Set([...project_rules, ...inherited, ...assistant].map((p) => p.id));
  const base = { context: ctx, project_rules, inherited, assistant, scope: area };
  const foreign = ctx.project ? foreignTo(ctx.project, area.targets) : () => false;

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
