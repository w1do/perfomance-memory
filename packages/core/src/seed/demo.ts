import type { FolderService } from '../folders/service.js';
import type { Logger } from '../logger.js';
import { buildPayload, embeddingText } from '../preferences/payload.js';
import type { AiProvider } from '../ai/provider.js';
import type { Store } from '../qdrant/store.js';
import { bm25Document } from '../text/bm25.js';
import type { Enrichment } from '../types.js';

type Demo = Omit<Enrichment, 'kind' | 'language'>;

const DEMO: Demo[] = [
  {
    folder_path: ['ChatGPT', 'Не люблю'],
    statement: 'Длинные вступления перед ответом',
    details: 'Сразу к сути, без пересказа вопроса.',
    polarity: 'dislike',
    domain: 'ai_assistants',
    project: null,
    applies_to: ['chatgpt'],
    tags: ['ответы', 'краткость', 'стиль'],
    constraints: [],
    strength: 4,
  },
  {
    folder_path: ['ChatGPT', 'Люблю'],
    statement: 'Ответы списком с конкретными шагами',
    details: null,
    polarity: 'like',
    domain: 'ai_assistants',
    project: null,
    applies_to: ['chatgpt'],
    tags: ['ответы', 'структура', 'шаги'],
    constraints: [],
    strength: 3,
  },
  {
    folder_path: ['Программирование', 'Код', 'Не люблю'],
    statement: 'Функции длиннее 40 строк',
    details: null,
    polarity: 'dislike',
    domain: 'programming',
    project: null,
    applies_to: ['any_ai'],
    tags: ['код', 'функции', 'размер'],
    constraints: [{ metric: 'function_lines', operator: '<=', value: 40, unit: 'lines' }],
    strength: 4,
  },
  {
    folder_path: ['Программирование', 'Код', 'Люблю'],
    statement: 'Понятные имена переменных',
    details: null,
    polarity: 'like',
    domain: 'programming',
    project: null,
    applies_to: ['any_ai'],
    tags: ['код', 'имена', 'читаемость'],
    constraints: [],
    strength: 3,
  },
  {
    folder_path: ['Программирование', 'PHP', 'Люблю'],
    statement: 'Строгая типизация в PHP',
    details: 'declare(strict_types=1) в каждом файле.',
    polarity: 'like',
    domain: 'programming',
    project: null,
    applies_to: ['php'],
    tags: ['php', 'типы', 'строгость'],
    constraints: [],
    strength: 4,
  },
  {
    folder_path: ['Программирование', 'PHP', 'Не люблю'],
    statement: 'Глобальные переменные в PHP',
    details: null,
    polarity: 'dislike',
    domain: 'programming',
    project: null,
    applies_to: ['php'],
    tags: ['php', 'глобальные', 'архитектура'],
    constraints: [],
    strength: 3,
  },
  {
    folder_path: ['Рыбалка', 'Люблю'],
    statement: 'Рыбалка на рассвете у тихой воды',
    details: null,
    polarity: 'like',
    domain: 'fishing',
    project: null,
    applies_to: ['me'],
    tags: ['рыбалка', 'рассвет', 'тишина'],
    constraints: [],
    strength: 4,
  },
  {
    folder_path: ['Рыбалка', 'Не люблю'],
    statement: 'Шумные соседи на берегу',
    details: null,
    polarity: 'dislike',
    domain: 'fishing',
    project: null,
    applies_to: ['me'],
    tags: ['рыбалка', 'шум', 'берег'],
    constraints: [],
    strength: 3,
  },
  {
    folder_path: ['Проекты', 'Семейный чат', 'Люблю'],
    statement: 'Минимальный UI',
    details: null,
    polarity: 'like',
    domain: 'project',
    project: 'Семейный чат',
    applies_to: ['any_ai'],
    tags: ['интерфейс', 'минимализм', 'дизайн'],
    constraints: [],
    strength: 4,
  },
  {
    folder_path: ['Проекты', 'Семейный чат', 'Не люблю'],
    statement: 'Лишние уведомления',
    details: null,
    polarity: 'dislike',
    domain: 'project',
    project: 'Семейный чат',
    applies_to: ['any_ai'],
    tags: ['уведомления', 'шум', 'интерфейс'],
    constraints: [],
    strength: 3,
  },
];

/** Demo data only when SEED_DEMO=true and the base is empty. */
export async function seedDemo(
  store: Store,
  folders: FolderService,
  ai: AiProvider,
  log: Logger,
): Promise<boolean> {
  if ((await store.countPreferences({})) > 0 || (await store.countFolders()) > 0) return false;
  for (const d of DEMO) {
    const { folder } = await folders.ensurePath(d.folder_path, d.domain);
    const payload = buildPayload({
      enrichment: { ...d, kind: 'preference', language: 'ru' },
      folder,
      rawText: `${d.polarity === 'like' ? 'люблю' : 'не люблю'}: ${d.statement}`,
      source: 'text',
    });
    const text = embeddingText(payload);
    const [dense] = await ai.embed([text]);
    await store.upsertPreference(payload, dense as number[], bm25Document(text));
  }
  await folders.recount();
  log.info({ preferences: DEMO.length }, 'demo data seeded (SEED_DEMO=true)');
  return true;
}
