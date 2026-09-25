/** Запрос к модели для поиска старых дублей: какие из похожих правил говорят одно и то же. */
import type { DuplicateCandidate } from './provider.js';

export const DUPLICATES_SYSTEM = `Ты наводишь порядок в личной памяти предпочтений пользователя.
Тебе дан список похожих правил. Найди группы правил, которые требуют одного и того же — это дубли, их можно
слить в одно. Дубли — даже если одно сформулировано через «люблю X», а другое через «не люблю не-X»
(«люблю, когда задают вопросы перед кодом» и «не люблю, когда пишут код без вопросов»).
Строгий тест: правила — дубли, только если можно оставить одно из них, удалить остальные и не потерять ни одного
требования. Общая тема — не повод («тесты через HTTP» и «без моков внутренних классов» — разные требования).
Не дубли: разные предметы, разные аспекты одного предмета, общее правило и его частный случай, правила, которые
противоречат друг другу, правила из разных проектов (папки «Проекты / <имя>») — каждому проекту нужно своё.
Сомневаешься — не объединяй.
Верни JSON: groups — массив групп-кандидатов, в каждой:
- ids — не меньше двух id из списка;
- differences — какие требования есть в одном правиле группы и нет в другом (конкретно, по-русски); если
  правила требуют одного и того же и различаются только словами — пустая строка "";
- reason — одна короткая фраза по-русски: какое общее требование.
Если дублей нет — groups: [].`;

export function duplicatesUserMessage(rules: DuplicateCandidate[]): string {
  return rules
    .map(
      (r) =>
        `- id=${r.id} | ${r.polarity === 'like' ? 'люблю' : 'не люблю'}: ${r.statement}` +
        (r.details ? ` — ${r.details}` : '') +
        ` | папка: ${r.folder_path.join(' / ')}`,
    )
    .join('\n');
}

export const duplicatesJsonSchema = {
  name: 'duplicate_groups',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['groups'],
    properties: {
      groups: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ids', 'differences', 'reason'],
          properties: {
            ids: { type: 'array', items: { type: 'string' } },
            differences: { type: 'string' },
            reason: { type: 'string' },
          },
        },
      },
    },
  },
} as const;
