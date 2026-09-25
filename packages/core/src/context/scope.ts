/**
 * Наследование «общее → проект» для любой сферы: в контекст названного проекта целиком (без ранжирования) входят
 * общие правила его области. Ничего не зашито — область выводится из данных:
 * - метки: applies_to правил проекта и метки, названные в задаче;
 * - темы: папки (без листа «Люблю»/«Не люблю») общих правил с этими метками или папки, названные как метка;
 * - области (domain): задачи, проекта и правил, подошедших по меткам.
 * Общее правило входит, если у него есть метка области, оно лежит в теме области или у него нет меток, а его
 * domain — домен области. Служебные домены «project» и «other» ничего не говорят о предмете и не наследуются.
 */
import type { PreferenceService } from '../preferences/service.js';
import { canonicalTarget, squash } from '../text/targets.js';
import { DISLIKE_FOLDER, LIKE_FOLDER, type PreferencePayload } from '../types.js';

const NOT_A_SUBJECT = new Set(['project', 'other']);

const LEAVES = new Set([LIKE_FOLDER, DISLIKE_FOLDER]);

/** Тема правила — его папка без листа «Люблю»/«Не люблю»: «Деплой и CI», «Рыбалка/Снасти». */
const topicOf = (p: PreferencePayload) =>
  (LEAVES.has(p.folder_path.at(-1) ?? '') ? p.folder_path.slice(0, -1) : p.folder_path).join('/');

export interface ProjectScope {
  targets: string[];
  topics: string[];
  rules: PreferencePayload[];
}

export async function projectScope(
  prefs: PreferenceService,
  projectRules: PreferencePayload[],
  task: { domains: string[]; applies_to: string[] },
  applies: string[] | undefined,
): Promise<ProjectScope> {
  const targets = new Set(
    [...projectRules.flatMap((p) => p.applies_to), ...task.applies_to.map(canonicalTarget)].filter(
      Boolean,
    ),
  );
  const named = new Set([...targets].map(squash));
  const general = (await prefs.all({ applies_to: applies })).filter((p) => !p.project);
  const byTarget = (p: PreferencePayload) =>
    p.applies_to.some((t) => targets.has(t)) || p.folder_path.some((n) => named.has(squash(n)));
  const matched = general.filter(byTarget);
  const topics = new Set(matched.map(topicOf));
  const domains = new Set(
    [...task.domains, ...projectRules.map((p) => p.domain), ...matched.map((p) => p.domain)].filter(
      (d) => !NOT_A_SUBJECT.has(d),
    ),
  );
  const rules = general.filter(
    (p) => byTarget(p) || topics.has(topicOf(p)) || (!p.applies_to.length && domains.has(p.domain)),
  );
  return { targets: [...targets].sort(), topics: [...topics].sort(), rules };
}

/**
 * Для задачи по проекту чужое не ранжируется: правила других проектов и общие правила, привязанные только к
 * меткам вне области проекта. Жёсткие правила это не касается.
 */
export function foreignTo(project: string, targets: string[]) {
  const own = new Set(targets);
  return (p: PreferencePayload): boolean =>
    (p.project !== null && p.project !== project) ||
    (p.project === null && p.applies_to.length > 0 && !p.applies_to.some((t) => own.has(t)));
}
