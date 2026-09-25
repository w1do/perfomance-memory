import { describe, expect, it } from 'vitest';
import { testCore } from './helpers.js';

describe('folders: rename / move update nested points', () => {
  it('rename rewrites folder_path and folder_ancestors of nested preferences', async () => {
    const { core, ai } = await testCore();
    ai.script('не люблю длинные файлы', {
      statement: 'Длинные файлы',
      polarity: 'dislike',
      folder_path: ['Программирование', 'Код', 'Не люблю'],
      domain: 'programming',
      tags: ['код', 'файлы', 'размер'],
    });
    const r = await core.prefs.save({ text: 'не люблю длинные файлы', source: 'text' });
    const prog = await core.folders.byPath(['Программирование']);
    await core.folders.update(prog?.id as string, { name: 'Разработка' });

    const p = await core.prefs.get(r.preference?.id as string);
    expect(p.folder_path).toEqual(['Разработка', 'Код', 'Не люблю']);
    expect(p.folder_ancestors).toEqual(['Разработка', 'Разработка/Код', 'Разработка/Код/Не люблю']);
    expect(await core.prefs.all({ folder: 'Программирование' })).toHaveLength(0);
    expect(await core.prefs.all({ folder: 'Разработка' })).toHaveLength(1);
    const code = await core.folders.byPath(['Разработка', 'Код']);
    expect(code?.ancestors).toEqual(['Разработка', 'Разработка/Код']);
  });

  it('move under another parent; cannot move into itself; delete needs force', async () => {
    const { core, ai } = await testCore();
    ai.script('люблю php', {
      statement: 'PHP',
      polarity: 'like',
      folder_path: ['PHP', 'Люблю'],
      domain: 'programming',
      tags: ['php', 'язык', 'код'],
    });
    const r = await core.prefs.save({ text: 'люблю php', source: 'text' });
    const target = await core.folders.create({ name: 'Программирование' });
    const php = await core.folders.byPath(['PHP']);
    const moved = await core.folders.update(php?.id as string, { parent_id: target.id });
    expect(moved.path).toEqual(['Программирование', 'PHP']);
    expect(moved.depth).toBe(2);
    const p = await core.prefs.get(r.preference?.id as string);
    expect(p.folder_path).toEqual(['Программирование', 'PHP', 'Люблю']);
    expect(p.folder_depth).toBe(3);

    await expect(core.folders.update(target.id, { parent_id: php?.id as string })).rejects.toThrow(
      /внутрь/,
    );
    await expect(core.folders.remove(target.id, false)).rejects.toThrow(/не пуста/);
    const res = await core.folders.remove(target.id, true);
    expect(res).toEqual({ folders: 3, preferences: 1 });
    expect(await core.folders.list()).toHaveLength(0);
  });
});
