import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Core } from '../src/core.js';
import type { FakeAi } from './fake-ai.js';
import { testCore } from './helpers.js';

const PROJECT_TASK = 'Дача: полить огород';
const FOOD_TASK = 'сварить суп';
const names = (list: { statement: string }[]) => list.map((p) => p.statement).sort();

describe('rules on how the assistant works reach every task', () => {
  let core: Core;
  let ai: FakeAi;
  beforeAll(async () => {
    ({ core, ai } = await testCore());
    ai.script('вопросы простыми словами', {
      statement: 'Вопросы простыми словами',
      polarity: 'like',
      folder_path: ['ClaudeCode', 'Люблю'],
      domain: 'ai_assistants',
      applies_to: ['claude'],
    })
      .script('в проекте Школа агент отчитывается таблицей', {
        statement: 'Отчёт агента таблицей',
        polarity: 'like',
        folder_path: ['Проекты', 'Школа', 'Люблю'],
        domain: 'ai_assistants',
        project: 'Школа',
      })
      .script('на даче поливать вечером', {
        statement: 'Поливать вечером',
        polarity: 'like',
        folder_path: ['Проекты', 'Дача', 'Люблю'],
        domain: 'project',
        project: 'Дача',
      })
      .script('острая еда', {
        statement: 'Острая еда',
        polarity: 'like',
        folder_path: ['Еда', 'Люблю'],
        domain: 'food',
      });
    for (const text of ai.scripts.keys()) await core.prefs.save({ text, source: 'text' });
    ai.tasks.set(PROJECT_TASK, { domains: [], project: 'Дача', applies_to: [] });
    ai.tasks.set(FOOD_TASK, { domains: ['food'], project: null, applies_to: [] });
  });
  afterAll(async () => {
    await core.qdrant.deleteCollection(core.config.QDRANT_COLLECTION);
    await core.qdrant.deleteCollection(core.config.QDRANT_FOLDERS_COLLECTION);
  });

  it('a project task carries them once, in their own group', async () => {
    const res = await core.contextForTask({ task: PROJECT_TASK, top_k: 5 });
    expect(names(res.project_rules)).toEqual(['Поливать вечером']);
    expect(names(res.assistant)).toEqual(['Вопросы простыми словами']);
    const elsewhere = names([
      ...res.project_rules,
      ...res.inherited,
      ...res.preferences.map((h) => h.preference),
      ...res.hard_constraints,
    ]);
    expect(elsewhere).not.toContain('Вопросы простыми словами');
  });

  it('a task outside any project carries them too', async () => {
    const res = await core.contextForTask({ task: FOOD_TASK, top_k: 5 });
    expect(names(res.assistant)).toEqual(['Вопросы простыми словами']);
    expect(names(res.preferences.map((h) => h.preference))).toEqual(['Острая еда']);
  });

  it('an assistant rule of a project stays with that project', async () => {
    const res = await core.contextForTask({ task: PROJECT_TASK, top_k: 5 });
    expect(names(res.assistant)).not.toContain('Отчёт агента таблицей');
  });
});
