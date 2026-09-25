import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Core } from '../src/core.js';
import type { FakeAi } from './fake-ai.js';
import { testCore } from './helpers.js';

const TASK = 'Дача: собраться на рыбалку в выходные';
const FEEDER_TASK = 'Дача: взять фидер на рыбалку';
const like2 = (statement: string, folder_path: string[], domain: string) => ({
  statement,
  polarity: 'like' as const,
  folder_path,
  domain,
});
const names = (list: { statement: string }[]) => list.map((p) => p.statement).sort();

describe('inheritance «general → project» from data, any sphere', () => {
  let core: Core;
  let ai: FakeAi;
  beforeAll(async () => {
    ({ core, ai } = await testCore());
    const like = (statement: string, folder_path: string[], domain: string, extra = {}) => ({
      statement,
      polarity: 'like' as const,
      folder_path,
      domain,
      ...extra,
    });
    const fish = (s: string, path: string[], extra = {}) => like(s, path, 'fishing', extra);
    ai.script(
      'на даче люблю рыбачить со спиннингом',
      like('Рыбалка на пруду у дачи', ['Проекты', 'Дача', 'Люблю'], 'project', {
        project: 'Дача',
        applies_to: ['спиннинг'],
      }),
    )
      .script(
        'спиннинг лёгкий до 10 грамм',
        fish('Лёгкий спиннинг до 10 г', ['Рыбалка', 'Снасти', 'Люблю'], {
          applies_to: ['спиннинг'],
        }),
      )
      .script(
        'плетёнка вместо лески',
        fish('Плетёнка вместо лески', ['Рыбалка', 'Снасти', 'Люблю']),
      )
      .script('вставать не раньше пяти', fish('Вставать не раньше пяти', ['Рыбалка', 'Люблю']))
      .script(
        'фидер с кормушкой',
        fish('Фидер с кормушкой', ['Рыбалка', 'Фидер', 'Люблю'], { applies_to: ['фидер'] }),
      )
      .script('острая еда', like('Острая еда', ['Еда', 'Люблю'], 'food'))
      .script(
        'код вместе с тестами',
        like('Код вместе с тестами', ['Программирование', 'Люблю'], 'programming'),
      );
    for (const text of ai.scripts.keys()) await core.prefs.save({ text, source: 'text' });
    ai.tasks.set(TASK, { domains: ['fishing'], project: 'Дача', applies_to: [] });
    ai.tasks.set(FEEDER_TASK, { domains: ['fishing'], project: 'Дача', applies_to: ['фидер'] });
  });
  afterAll(async () => {
    await core.qdrant.deleteCollection(core.config.QDRANT_COLLECTION);
    await core.qdrant.deleteCollection(core.config.QDRANT_FOLDERS_COLLECTION);
  });

  it('a project inherits every general rule of its labels, topics and domains, whatever top_k is', async () => {
    const res = await core.contextForTask({ task: TASK, top_k: 1 });
    expect(names(res.project_rules)).toEqual(['Рыбалка на пруду у дачи']);
    expect(res.scope).toEqual({ targets: ['спиннинг'], topics: ['Рыбалка/Снасти'] });
    expect(names(res.inherited)).toEqual(
      ['Вставать не раньше пяти', 'Лёгкий спиннинг до 10 г', 'Плетёнка вместо лески'].sort(),
    );
    // другой предмет той же сферы, другая сфера — не наследуются и не ранжируются
    const all = names([...res.inherited, ...res.preferences.map((h) => h.preference)]);
    expect(all).not.toContain('Фидер с кормушкой');
    expect(all).not.toContain('Острая еда');
    expect(all).not.toContain('Код вместе с тестами');
  });

  it('labels named in the task join the project scope', async () => {
    const res = await core.contextForTask({ task: FEEDER_TASK, top_k: 1 });
    expect(res.scope.targets).toEqual(['спиннинг', 'фидер']);
    expect(names(res.inherited)).toContain('Фидер с кормушкой');
  });

  it('«Разное» with a known sphere gets its topic from the data (or the default name)', async () => {
    ai.script(
      'тихие места для рыбалки',
      like2('Тихие места', ['Разное', 'Люблю'], 'fishing'),
    ).script('горы с палаткой', like2('Горы с палаткой', ['Разное', 'Люблю'], 'travel'));
    expect((await core.prefs.preview('тихие места для рыбалки')).enrichment.folder_path).toEqual([
      'Рыбалка',
      'Люблю',
    ]);
    expect((await core.prefs.preview('горы с палаткой')).enrichment.folder_path).toEqual([
      'Путешествия',
      'Люблю',
    ]);
  });

  it('without a project nothing is inherited', async () => {
    const res = await core.contextForTask({ task: 'просто задача', top_k: 5 });
    expect(res.inherited).toEqual([]);
  });
});
