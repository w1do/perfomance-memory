import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Core } from '../src/core.js';
import type { FakeAi } from './fake-ai.js';
import { testCore } from './helpers.js';

const rule = (statement: string, folder_path: string[], domain: string, extra = {}) => ({
  statement,
  polarity: 'like' as const,
  folder_path,
  domain,
  ...extra,
});
const byStatement = (a: { statement: string }, b: { statement: string }) =>
  a.statement.localeCompare(b.statement);

describe('«Распределить»: general rules go back through the folder choice', () => {
  let core: Core;
  let ai: FakeAi;
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    ({ core, ai } = await testCore());
    ai.script('краткие ответы', rule('Краткие ответы', ['ClaudeCode', 'Люблю'], 'ai_assistants'))
      .script(
        'вопросы простыми словами',
        rule('Вопросы простыми словами', ['Разное', 'Люблю'], 'other'),
      )
      .script('горы с палаткой', rule('Горы с палаткой', ['Разное', 'Люблю'], 'other'))
      .script(
        'нейрослоп',
        rule('Нейрослоп', ['ClaudeCode', 'Не люблю'], 'programming', { polarity: 'dislike' }),
      )
      .script(
        'код вместе с тестами',
        rule('Код вместе с тестами', ['Программирование', 'Люблю'], 'programming'),
      )
      .script(
        'на даче поливать вечером',
        rule('Поливать вечером', ['Проекты', 'Дача', 'Люблю'], 'project', { project: 'Дача' }),
      );
    for (const text of [...ai.scripts.keys()]) {
      const r = await core.prefs.save({ text, source: 'text' });
      ids[r.preference?.statement ?? text] = r.preference?.id ?? '';
    }
    // повторный выбор папки: известная тема принимается; выдуманная («AI_Assistants», «Походы») заменяется темой
    // сферы — существующей (ClaudeCode) или, из «Разное», названием сферы (Путешествия); переезд в «Разное» — не перенос
    ai.script(
      'Люблю: Краткие ответы',
      rule('Краткие ответы', ['ClaudeCode', 'Люблю'], 'ai_assistants'),
    )
      .script(
        'Люблю: Вопросы простыми словами',
        rule('Вопросы простыми словами', ['ClaudeCode', 'Люблю'], 'ai_assistants'),
      )
      .script('Люблю: Горы с палаткой', rule('Горы с палаткой', ['Походы', 'Люблю'], 'travel'))
      .script(
        'Не люблю: Нейрослоп',
        rule('Нейрослоп', ['AI_Assistants', 'Не люблю'], 'ai_assistants', { polarity: 'dislike' }),
      )
      .script(
        'Люблю: Код вместе с тестами',
        rule('Код вместе с тестами', ['Разное', 'Люблю'], 'other'),
      );
  });
  afterAll(async () => {
    await core.qdrant.deleteCollection(core.config.QDRANT_COLLECTION);
    await core.qdrant.deleteCollection(core.config.QDRANT_FOLDERS_COLLECTION);
  });

  it('plans only the general rules that belong elsewhere', async () => {
    const plan = (await core.hygiene.placements()).sort(byStatement);
    expect(plan).toEqual([
      {
        id: ids['Вопросы простыми словами'],
        statement: 'Вопросы простыми словами',
        from: ['Разное', 'Люблю'],
        to: ['ClaudeCode', 'Люблю'],
        domain_from: 'other',
        domain_to: 'ai_assistants',
      },
      {
        id: ids['Горы с палаткой'],
        statement: 'Горы с палаткой',
        from: ['Разное', 'Люблю'],
        to: ['Путешествия', 'Люблю'],
        domain_from: 'other',
        domain_to: 'travel',
      },
      {
        id: ids['Нейрослоп'],
        statement: 'Нейрослоп',
        from: ['ClaudeCode', 'Не люблю'],
        to: ['ClaudeCode', 'Не люблю'],
        domain_from: 'programming',
        domain_to: 'ai_assistants',
      },
    ]);
  });

  it('refuses to move a project rule', async () => {
    await expect(
      core.hygiene.place([
        { id: ids['Поливать вечером'] as string, to: ['Сад', 'Люблю'], domain: 'other' },
      ]),
    ).rejects.toThrow('Правила проектов не переносятся');
  });

  it('moves the picked rules, removes the folders they left empty, and the next plan is empty', async () => {
    const plan = await core.hygiene.placements();
    const r = await core.hygiene.place(
      plan.map((p) => ({ id: p.id, to: p.to, domain: p.domain_to })),
    );
    expect(r).toEqual({ moved: 3, folders_removed: 2 });
    const moved = await core.prefs.get(ids['Вопросы простыми словами'] as string);
    expect(moved.folder_path).toEqual(['ClaudeCode', 'Люблю']);
    expect(moved.domain).toBe('ai_assistants');
    expect((await core.prefs.get(ids['Нейрослоп'] as string)).domain).toBe('ai_assistants');
    const paths = (await core.folders.list()).map((f) => f.path.join('/'));
    expect(paths).not.toContain('Разное');
    expect(paths).toContain('Путешествия/Люблю');
    expect(paths).toContain('Проекты/Дача/Люблю');
    expect(await core.hygiene.placements()).toEqual([]);
  });
});

describe('rescue from «Разное» drops a subfolder that repeats the topic', () => {
  it('«Разное › Deploy» with domain devops becomes «Деплой и CI»', async () => {
    const { core, ai } = await testCore();
    ai.script(
      'деплой через dokploy',
      rule('Деплой через Dokploy', ['Разное', 'Deploy', 'Люблю'], 'devops'),
    );
    const { enrichment } = await core.prefs.preview('деплой через dokploy');
    expect(enrichment.folder_path).toEqual(['Деплой и CI', 'Люблю']);
    await core.qdrant.deleteCollection(core.config.QDRANT_COLLECTION);
    await core.qdrant.deleteCollection(core.config.QDRANT_FOLDERS_COLLECTION);
  });
});

describe('a folder named by the domain code is not a topic', () => {
  it('«ai_assistants › Люблю» becomes the topic of the sphere', async () => {
    const { core, ai } = await testCore();
    ai.script('краткие ответы', rule('Краткие ответы', ['ClaudeCode', 'Люблю'], 'ai_assistants'));
    await core.prefs.save({ text: 'краткие ответы', source: 'text' });
    ai.script(
      'правила по mcp',
      rule('Правила по MCP', ['ai_assistants', 'Люблю'], 'ai_assistants'),
    );
    const { enrichment } = await core.prefs.preview('правила по mcp');
    expect(enrichment.folder_path).toEqual(['ClaudeCode', 'Люблю']);
    await core.qdrant.deleteCollection(core.config.QDRANT_COLLECTION);
    await core.qdrant.deleteCollection(core.config.QDRANT_FOLDERS_COLLECTION);
  });
});
