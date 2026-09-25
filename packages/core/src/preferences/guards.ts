/**
 * Защиты от выдумок модели (ТЗ: «не выдумывать данные»): проект — только если назван; цели applies_to — только
 * названные во фразе (с учётом синонимов словаря) плюс me/any_ai; названные, но пропущенные моделью цели
 * извлекаются из фразы; теги без слов полярности.
 */
import { polarityFolderName, sameName } from '../folders/tree.js';
import { canonicalTarget, detectTargets, targetMentioned } from '../text/glossary.js';
import { mentions } from '../text/mentions.js';
import { PROJECTS_ROOT, type Polarity } from '../types.js';

/** Тематическая папка для домена, когда модель положила правило в проект, который не назван. */
const DOMAIN_TOPIC: Record<string, string> = {
  programming: 'Программирование',
  devops: 'Деплой и CI',
  ai_assistants: 'ИИ-ассистенты',
  fishing: 'Рыбалка',
  travel: 'Путешествия',
  food: 'Еда',
  communication: 'Общение',
};
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

export function guardProject(args: {
  path: string[];
  project: string | null;
  domain: string;
  polarity: Polarity;
  sourceText: string;
  projectHint: string | null;
}): { path: string[]; project: string | null; domain: string } {
  let { path, project, domain } = args;
  const named = (p: string) =>
    (args.projectHint ? sameName(args.projectHint, p) : false) || mentions(args.sourceText, p);
  if (project && !named(project)) project = null;
  const pathProject =
    path[0] !== undefined && sameName(path[0], PROJECTS_ROOT) ? path[1] : undefined;
  if (pathProject && !named(pathProject)) {
    if (domain.trim().toLowerCase() === 'project') domain = 'other';
    const topic = DOMAIN_TOPIC[domain.trim().toLowerCase()] ?? 'Разное';
    path = [topic, polarityFolderName(args.polarity)];
  }
  return { path, project, domain };
}

export function guardTargets(targets: string[], sourceText?: string): string[] {
  const canon = [...new Set(targets.map(canonicalTarget).filter(Boolean))];
  if (sourceText === undefined) return canon.slice(0, 12);
  const kept = canon.filter((t) => ABSTRACT_TARGETS.has(t) || targetMentioned(sourceText, t));
  const concrete = kept.filter((t) => !ABSTRACT_TARGETS.has(t));
  const found = concrete.length ? [] : detectTargets(sourceText);
  return [...new Set([...found, ...kept])].slice(0, 12);
}

export const cleanTags = (tags: string[]): string[] =>
  tags.filter((t) => !POLARITY_TAGS.has(t) && !/^\d+$/.test(t) && t.length > 1);
