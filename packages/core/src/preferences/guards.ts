/**
 * Защиты от выдумок модели (ТЗ: «не выдумывать данные»): проект — только если назван; цели applies_to — только
 * названные во фразе (как есть или транслитом); уже известные в памяти метки, пропущенные моделью, извлекаются из
 * фразы; файлы и пути — не метки, а теги (splitTargets); me / any_ai не хранятся; теги без слов полярности.
 */
import { polarityFolderName, polarityOfFolderName, sameName } from '../folders/tree.js';
import { canonicalTarget, detectTargets, looksLikePath, targetMentioned } from '../text/targets.js';
import { mentions } from '../text/mentions.js';
import { tokenize } from '../text/tokenize.js';
import { MISC_FOLDER, PROJECTS_ROOT, type Polarity } from '../types.js';

/** Тематическая папка для домена, когда модель положила правило в проект, который не назван. */
/** Название темы по умолчанию для сферы, пока в памяти нет её правил. */
export const DOMAIN_TOPIC: Record<string, string> = {
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
  const inProjects = path[0] !== undefined && sameName(path[0], PROJECTS_ROOT);
  const pathProject = inProjects ? path[1] : undefined;
  // «Проекты» без названного проекта («ларавел-проект», «проекты вообще») — это общее правило, не проект
  const leafOnly = pathProject === undefined || polarityOfFolderName(pathProject) !== null;
  if (inProjects && (leafOnly || !named(pathProject as string))) {
    if (domain.trim().toLowerCase() === 'project') domain = 'other';
    const topic = DOMAIN_TOPIC[domain.trim().toLowerCase()] ?? MISC_FOLDER;
    path = [topic, polarityFolderName(args.polarity)];
  }
  return { path, project, domain };
}

/**
 * sourceText — фраза пользователя (с исправленным моделью написанием), known — метки, уже известные в памяти.
 * Без sourceText (правка превью) метки остаются как введены.
 */
export function guardTargets(
  targets: string[],
  sourceText?: string,
  known: string[] = [],
): string[] {
  const canon = [...new Set(targets.map(canonicalTarget).filter(Boolean))];
  if (sourceText === undefined) return canon.slice(0, 12);
  const kept = canon.filter((t) => !ABSTRACT_TARGETS.has(t) && targetMentioned(sourceText, t));
  const found = kept.some((t) => !looksLikePath(t)) ? [] : detectTargets(sourceText, known);
  return [...new Set([...found, ...kept])].slice(0, 12);
}

/** me / any_ai убираются; файлы, пути и пакеты с «/» — не предмет правила, они уходят в теги. */
export function splitTargets(values: string[]): { targets: string[]; extra: string[] } {
  const targets: string[] = [];
  const extra: string[] = [];
  for (const v of values) {
    const path = looksLikePath(v);
    const t = path ? v.trim().toLowerCase() : canonicalTarget(v);
    if (!t || ABSTRACT_TARGETS.has(t)) continue;
    const bucket = path ? extra : targets;
    if (!bucket.includes(t)) bucket.push(t);
  }
  return { targets, extra };
}

/** Теги без слов полярности, чисел и служебных слов («не», «и», «для»). */
export const cleanTags = (tags: string[]): string[] =>
  tags.filter(
    (t) => !POLARITY_TAGS.has(t) && !/^\d+$/.test(t) && t.length > 1 && tokenize(t).length > 0,
  );
