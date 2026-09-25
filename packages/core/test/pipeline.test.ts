import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Core } from '../src/core.js';
import type { FakeAi } from './fake-ai.js';
import { testCore } from './helpers.js';

describe('pipeline: enrichment → folder → conflict → upsert → PREFERENCES.md', () => {
  let core: Core;
  let ai: FakeAi;
  let dataDir: string;

  beforeAll(async () => {
    ({ core, ai, dataDir } = await testCore());
    ai.script('не люблю, когда ChatGPT отвечает грубо', {
      statement: 'Грубые ответы ChatGPT',
      polarity: 'dislike',
      folder_path: ['ChatGPT', 'Не люблю'],
      domain: 'ai_assistants',
      applies_to: ['chatgpt'],
      tags: ['chatgpt', 'тон', 'ответы'],
      level: 'default',
    })
      .script('люблю, когда ChatGPT отвечает дерзко', {
        statement: 'Дерзкие ответы ChatGPT',
        polarity: 'like',
        folder_path: ['ChatGPT', 'Люблю'],
        domain: 'ai_assistants',
        applies_to: ['chatgpt'],
        tags: ['chatgpt', 'тон', 'ответы'],
        level: 'default',
      })
      .script('снова: люблю, когда ChatGPT отвечает дерзко', {
        statement: 'Дерзкие ответы ChatGPT',
        polarity: 'like',
        folder_path: ['ChatGPT', 'Люблю'],
        domain: 'ai_assistants',
        applies_to: ['chatgpt'],
        tags: ['chatgpt', 'тон', 'ответы'],
        level: 'hard',
        why: 'так веселее',
      })
      .script('не люблю файлы с кодом больше 100 строк', {
        statement: 'Файлы с кодом больше 100 строк',
        polarity: 'dislike',
        folder_path: ['Программирование', 'Код', 'Не люблю'],
        domain: 'programming',
        applies_to: ['any_ai'],
        tags: ['код', 'файлы', 'размер'],
        constraints: [{ metric: 'file_lines', operator: '<=', value: 100, unit: 'lines' }],
      })
      .script('на рыбалке не люблю вставать раньше пяти', {
        statement: 'Вставать раньше пяти утра',
        polarity: 'dislike',
        folder_path: ['Рыбалка', 'Не люблю'],
        domain: 'fishing',
        applies_to: ['me'],
        tags: ['рыбалка', 'подъём', 'утро'],
        constraints: [{ metric: 'wake_up_hour', operator: '>=', value: 5, unit: 'hour' }],
      })
      .script('создай проект Дача, там люблю всё делать без покраски', {
        statement: 'Всё делать без покраски',
        polarity: 'like',
        folder_path: ['Проекты', 'Дача', 'Люблю'],
        domain: 'project',
        project: 'Дача',
        applies_to: ['me'],
        tags: ['дача', 'покраска', 'ремонт'],
      })
      .script('создай проект Баня', {
        kind: 'project_only',
        statement: 'Баня',
        polarity: 'like',
        folder_path: ['Проекты', 'Баня'],
        domain: 'project',
        project: 'Баня',
      });
  });

  it('creates a new rule in a new folder with all metadata', async () => {
    const r = await core.prefs.save({
      text: 'не люблю, когда ChatGPT отвечает грубо',
      source: 'voice',
    });
    expect(r.action).toBe('created');
    expect(r.preference?.folder_path).toEqual(['ChatGPT', 'Не люблю']);
    expect(r.preference?.folder_ancestors).toEqual(['ChatGPT', 'ChatGPT/Не люблю']);
    expect(r.preference?.source).toBe('voice');
    expect(r.preference?.raw_text).toBe('не люблю, когда ChatGPT отвечает грубо');
    expect(r.folder.preference_count).toBe(0); // payload before recount
    const folder = await core.folders.byPath(['ChatGPT', 'Не люблю']);
    expect(folder?.preference_count).toBe(1);
  });

  it('opposite polarity → conflict: updated with history and moved to the sibling folder', async () => {
    const before = await core.prefs.all({ folder: 'ChatGPT' });
    const r = await core.prefs.save({
      text: 'люблю, когда ChatGPT отвечает дерзко',
      source: 'text',
    });
    expect(r.action).toBe('updated');
    expect(r.preference?.id).toBe(before[0]?.id);
    expect(r.preference?.polarity).toBe('like');
    expect(r.preference?.folder_path).toEqual(['ChatGPT', 'Люблю']);
    expect(r.preference?.history).toHaveLength(1);
    expect(r.preference?.history[0]).toMatchObject({
      statement: 'Грубые ответы ChatGPT',
      polarity: 'dislike',
      folder_path: ['ChatGPT', 'Не люблю'],
    });
    expect(r.replaced?.statement).toBe('Грубые ответы ChatGPT');
    expect(await core.prefs.all({ folder: 'ChatGPT' })).toHaveLength(1);
    expect((await core.folders.byPath(['ChatGPT', 'Не люблю']))?.preference_count).toBe(0);
    expect((await core.folders.byPath(['ChatGPT', 'Люблю']))?.preference_count).toBe(1);
  });

  it('same meaning → duplicate: level only gets stricter, empty why is filled', async () => {
    const [prev] = await core.prefs.all({ folder: 'ChatGPT' });
    const r = await core.prefs.save({
      text: 'снова: люблю, когда ChatGPT отвечает дерзко',
      source: 'text',
    });
    expect(r.action).toBe('duplicate');
    expect(r.preference?.id).toBe(prev?.id);
    const now = await core.prefs.get(prev?.id as string);
    expect(now.level).toBe('hard');
    expect(now.strength).toBe(5);
    expect(now.why).toBe('так веселее');
    expect(now.history).toHaveLength(1);
    expect(now.updated_at > (prev?.updated_at ?? '')).toBe(true);
  });

  it('different domain → new rule with constraints', async () => {
    const r = await core.prefs.save({
      text: 'не люблю файлы с кодом больше 100 строк',
      source: 'text',
    });
    expect(r.action).toBe('created');
    expect(r.preference?.folder_path).toEqual(['Программирование', 'Код', 'Не люблю']);
    expect(r.preference?.constraints).toEqual([
      { metric: 'file_lines', operator: '<=', value: 100, unit: 'lines' },
    ]);
    expect(r.preference?.constraint_metrics).toEqual(['file_lines']);
    expect(r.preference?.folder_depth).toBe(3);
  });

  it('passes the folder tree and similar folders to the model and reuses existing folders', async () => {
    await core.prefs.save({ text: 'на рыбалке не люблю вставать раньше пяти', source: 'text' });
    expect(ai.lastEnrichInput?.folderTree).toContain('ChatGPT / Люблю');
    expect(ai.lastEnrichInput?.similarFolders.length).toBeGreaterThan(0);
    expect(ai.lastEnrichInput?.similarFolders.length).toBeLessThanOrEqual(3);
    const roots = (await core.folders.tree()).map((n) => n.name);
    expect(roots.filter((n) => n === 'Рыбалка')).toHaveLength(1);
  });

  it('creates a project folder automatically', async () => {
    const r = await core.prefs.save({
      text: 'создай проект Дача, там люблю всё делать без покраски',
      source: 'text',
    });
    expect(r.preference?.folder_path).toEqual(['Проекты', 'Дача', 'Люблю']);
    expect(r.preference?.project).toBe('Дача');
    const only = await core.prefs.save({ text: 'создай проект Баня', source: 'text' });
    expect(only.action).toBe('project_created');
    expect(only.preference).toBeNull();
    expect((await core.folders.projects()).map((p) => p.name)).toEqual(['Баня', 'Дача']);
    const projectsRoot = await core.folders.byPath(['Проекты']);
    expect(projectsRoot?.domain).toBe('project');
  });

  it('manual PATCH flips polarity, moves the rule and re-embeds', async () => {
    const [p] = await core.prefs.all({ folder: 'Рыбалка' });
    const u = await core.prefs.update(p?.id as string, {
      polarity: 'like',
      level: 'taste',
      why: '',
    });
    expect(u.level).toBe('taste');
    expect(u.strength).toBe(1);
    expect(u.why).toBeNull();
    expect(u.folder_path).toEqual(['Рыбалка', 'Люблю']);
    expect(u.history.at(-1)?.reason).toBe('ручная правка');
    await core.prefs.update(p?.id as string, { polarity: 'dislike' });
  });

  it('keeps PREFERENCES.md in data/ up to date', () => {
    const md = readFileSync(join(dataDir, 'PREFERENCES.md'), 'utf8');
    expect(md).toContain('## ChatGPT');
    expect(md).toContain('Дерзкие ответы ChatGPT');
    expect(md).toContain('`file_lines <= 100 lines`');
    expect(md).toContain('## Проекты');
    expect(md).toContain('### Дача');
  });
});
