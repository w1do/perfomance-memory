/** Общие фикстуры тестов передачи схемы: три исходных правила и очистка коллекций. */
import type { Core } from '../src/core.js';
import type { FakeAi } from './fake-ai.js';

export const CHATGPT_TEXT = 'не люблю, когда ChatGPT отвечает грубо';
export const CODE_TEXT = 'не люблю, когда файл с кодом больше 100 строк';
export const UI_TEXT = 'в проекте Семейный чат люблю минимальный UI';

/** Сохраняет три правила: ChatGPT (не люблю), файлы длиннее 100 строк (hard, constraint), минимальный UI (проект). */
export async function seedSource(core: Core, ai: FakeAi): Promise<void> {
  ai.script(CHATGPT_TEXT, {
    statement: 'Грубые ответы ChatGPT',
    polarity: 'dislike',
    folder_path: ['ChatGPT', 'Не люблю'],
    domain: 'ai_assistants',
    applies_to: ['chatgpt'],
    tags: ['chatgpt', 'тон'],
  })
    .script(CODE_TEXT, {
      statement: 'Файлы длиннее 100 строк',
      polarity: 'dislike',
      folder_path: ['Программирование', 'Код', 'Не люблю'],
      domain: 'programming',
      tags: ['код', 'размер файла'],
      constraints: [{ metric: 'file_lines', operator: '<=', value: 100, unit: 'lines' }],
      level: 'hard',
      why: 'Длинные файлы трудно читать',
    })
    .script(UI_TEXT, {
      statement: 'Минимальный UI',
      polarity: 'like',
      folder_path: ['Проекты', 'Семейный чат', 'Люблю'],
      domain: 'project',
      project: 'Семейный чат',
      tags: ['ui'],
    });
  for (const text of [CHATGPT_TEXT, CODE_TEXT, UI_TEXT]) {
    await core.prefs.save({ text, source: 'text' });
  }
}

/** Пакет схемы для применения напрямую (без файла). */
export const packageOf = (preferences: unknown[], folders: unknown[] = []) => ({
  format: 'preference-memory/schema',
  version: 1,
  name: 'Чужая схема',
  exported_at: '2026-10-13T10:00:00.000Z',
  folders,
  preferences,
});

/** Правило пакета с валидными полями; over переопределяет любое поле. */
export const ruleOf = (over: Record<string, unknown> = {}) => ({
  statement: 'Минимальный интерфейс без лишних элементов',
  polarity: 'like',
  domain: 'programming',
  folder_path: ['Интерфейсы', 'Люблю'],
  tags: ['ui', 'минимализм'],
  ...over,
});

/** Правило с неверной полярностью: пропускается при разборе. */
export const brokenRule = (over: Record<string, unknown> = {}) =>
  ruleOf({ polarity: 'maybe', ...over });

export const SEL_ALL = { all: true, folders: [] as string[] };

export const LEFTOVER_MESSAGE =
  'Не удалось убрать созданные пустые папки — они могли остаться, удалите их вручную';

export async function dropCollections(core: Core): Promise<void> {
  await core.qdrant.deleteCollection(core.config.QDRANT_COLLECTION);
  await core.qdrant.deleteCollection(core.config.QDRANT_FOLDERS_COLLECTION);
}
