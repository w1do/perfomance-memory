/**
 * Наследование «общее → стек → проект»: в контекст названного проекта целиком (без ранжирования) входят общие
 * правила его стека. Стек — цели applies_to правил проекта с подразумеваемыми (laravel ⇒ php, gitlab_ci ⇒ gitlab).
 * Общее правило (без project) входит, если (1) его цель есть в стеке, (2) оно лежит в папке технологии стека
 * («Laravel») или (3) у него нет целей, а его область — область стека: задачи, проекта или правил из (1)–(2).
 */
import type { PreferenceService } from '../preferences/service.js';
import { canonicalTarget, withImplied } from '../text/glossary.js';
import type { PreferencePayload } from '../types.js';

/** Области без предмета не распространяются: «project» — это сам проект, «other» — разное. */
const NOT_A_STACK = new Set(['project', 'other']);

export interface ProjectStack {
  targets: string[];
  rules: PreferencePayload[];
}

export async function projectStack(
  prefs: PreferenceService,
  projectRules: PreferencePayload[],
  taskDomains: string[],
  applies: string[] | undefined,
): Promise<ProjectStack> {
  const targets = withImplied(projectRules.flatMap((p) => p.applies_to));
  const general = (await prefs.all({ applies_to: applies })).filter((p) => !p.project);
  const byTarget = (p: PreferencePayload) =>
    p.applies_to.some((t) => targets.has(t)) ||
    targets.has(canonicalTarget(p.folder_path[0] ?? ''));
  const matched = general.filter(byTarget);
  const domains = new Set(
    [...taskDomains, ...projectRules.map((p) => p.domain), ...matched.map((p) => p.domain)].filter(
      (d) => !NOT_A_STACK.has(d),
    ),
  );
  const rules = general.filter(
    (p) => byTarget(p) || (!p.applies_to.length && domains.has(p.domain)),
  );
  return { targets: [...targets].sort(), rules };
}

/**
 * Для задачи по проекту чужое не ранжируется: правила других проектов и общие правила, привязанные только к
 * технологиям вне стека (правило про Next в проекте на Laravel). Жёсткие правила это не касается.
 */
export function foreignTo(project: string, stack: string[]) {
  const own = new Set(stack);
  return (p: PreferencePayload): boolean =>
    (p.project !== null && p.project !== project) ||
    (p.project === null && p.applies_to.length > 0 && !p.applies_to.some((t) => own.has(t)));
}
