import type { AiProvider, TaskContext } from '../ai/provider.js';
import type { FolderService } from '../folders/service.js';
import { sameName } from '../folders/tree.js';
import type { Logger } from '../logger.js';
import { mentions } from '../text/mentions.js';
import type { PreferenceService } from '../preferences/service.js';
import type { PreferencePayload, ScoredPreference } from '../types.js';

export interface TaskContextResult {
  context: TaskContext;
  preferences: ScoredPreference[];
  /** constraint-bearing rules of the detected domains that did not make the ranked top */
  hard_constraints: PreferencePayload[];
}

/**
 * Main agent entry: detects domain/project of the task, narrows by metadata indexes,
 * ranks with hybrid search and always adds every hard constraint of those domains.
 */
export async function contextForTask(
  deps: { ai: AiProvider; prefs: PreferenceService; folders: FolderService; log: Logger },
  input: { task: string; applies_to?: string[] | undefined; top_k: number },
): Promise<TaskContextResult> {
  const [facets, projectNodes] = await Promise.all([deps.prefs.facets(), deps.folders.projects()]);
  const domains = (facets.domain ?? []).map((d) => d.value);
  const projects = projectNodes.map((p) => p.name);

  let ctx: TaskContext = { domains: [], project: null, applies_to: [] };
  try {
    const raw = await deps.ai.classifyTask(input.task, domains, projects);
    ctx = {
      domains: (raw.domains ?? []).filter((d) => domains.includes(d)),
      // a project counts only if the task names it — the model must not attach one on its own
      project:
        projects.find((p) => raw.project && sameName(p, raw.project) && mentions(input.task, p)) ??
        null,
      applies_to: (raw.applies_to ?? []).map((a) => a.toLowerCase()),
    };
  } catch (err) {
    deps.log.warn(
      { err: (err as Error).message },
      'task classification failed, searching everywhere',
    );
  }

  const scopes: { domain?: string[]; project?: string }[] = [];
  if (ctx.domains.length) scopes.push({ domain: ctx.domains });
  if (ctx.project) scopes.push({ project: ctx.project });
  if (!scopes.length) scopes.push({});

  const applies = input.applies_to?.length ? input.applies_to : undefined;
  const seen = new Map<string, ScoredPreference>();
  for (const scope of scopes) {
    const hits = await deps.prefs.search(
      input.task,
      { ...scope, applies_to: applies },
      input.top_k,
    );
    for (const h of hits) if (!seen.has(h.preference.id)) seen.set(h.preference.id, h);
  }
  const preferences = [...seen.values()]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, input.top_k);

  const hard: PreferencePayload[] = [];
  if (ctx.domains.length || ctx.project) {
    for (const scope of scopes) {
      const all = await deps.prefs.all({ ...scope, applies_to: applies });
      for (const p of all) {
        if (p.constraints.length && !seen.has(p.id) && !hard.some((h) => h.id === p.id))
          hard.push(p);
      }
    }
  }
  return { context: ctx, preferences, hard_constraints: hard };
}
