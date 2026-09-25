import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Core } from '../src/core.js';
import { withImplied } from '../src/text/glossary.js';
import { testCore } from './helpers.js';

const TASK = 'Шоп: сделать модуль заказов';

describe('project stack inheritance in get_context_for_task', () => {
  let core: Core;
  beforeAll(async () => {
    const made = await testCore();
    core = made.core;
    const like = (statement: string, folder_path: string[], domain: string, extra = {}) => ({
      statement,
      polarity: 'like' as const,
      folder_path,
      domain,
      ...extra,
    });
    made.ai
      .script(
        'в проекте Шоп на laravel люблю модули',
        like('Модули в Шопе', ['Проекты', 'Шоп', 'Люблю'], 'project', {
          project: 'Шоп',
          applies_to: ['laravel'],
        }),
      )
      .script(
        'php: phpdoc у каждого класса',
        like('PHPDoc у каждого класса', ['Программирование', 'PHP', 'Люблю'], 'programming', {
          applies_to: ['php'],
        }),
      )
      .script(
        'код коммитится с тестами',
        like('Код вместе с тестами', ['Программирование', 'Код', 'Люблю'], 'programming'),
      )
      .script(
        'команды через tools',
        like('Команды через единую точку входа', ['Laravel', 'Люблю'], 'other'),
      )
      .script(
        'next: ключ только на сервере',
        like('Ключ только на сервере Next', ['Программирование', 'Люблю'], 'programming', {
          applies_to: ['next'],
        }),
      )
      .script(
        'проект поднимается одной командой',
        like('Подъём одной командой', ['Деплой и CI', 'Люблю'], 'devops'),
      )
      .script(
        'фронтенд на компонентах',
        like('Фронтенд на компонентах', ['Frontends', 'Люблю'], 'frontend'),
      );
    for (const text of made.ai.scripts.keys()) await core.prefs.save({ text, source: 'text' });
    made.ai.tasks.set(TASK, { domains: ['programming'], project: 'Шоп', applies_to: [] });
  });
  afterAll(async () => {
    await core.qdrant.deleteCollection(core.config.QDRANT_COLLECTION);
    await core.qdrant.deleteCollection(core.config.QDRANT_FOLDERS_COLLECTION);
  });

  it('stack targets include what they imply', () => {
    expect([...withImplied(['octane', 'gitlab_ci'])].sort()).toEqual(
      ['git', 'gitlab', 'gitlab_ci', 'laravel', 'octane', 'php'].sort(),
    );
  });

  it('returns every general rule of the stack, whatever top_k is', async () => {
    const res = await core.contextForTask({ task: TASK, top_k: 1 });
    expect(res.project_rules.map((p) => p.statement)).toEqual(['Модули в Шопе']);
    expect(res.stack).toEqual(['laravel', 'php']);
    expect(res.stack_rules.map((p) => p.statement).sort()).toEqual(
      [
        'Код вместе с тестами',
        'Команды через единую точку входа',
        'PHPDoc у каждого класса',
      ].sort(),
    );
    const all = [...res.stack_rules, ...res.preferences.map((h) => h.preference)];
    expect(all.map((p) => p.statement)).not.toContain('Ключ только на сервере Next');
    expect(res.stack_rules.map((p) => p.statement)).not.toContain('Подъём одной командой');
  });

  it('without a project there is no stack', async () => {
    const res = await core.contextForTask({ task: 'просто задача', top_k: 5 });
    expect(res.stack_rules).toEqual([]);
  });
});
