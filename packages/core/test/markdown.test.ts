import { describe, expect, it } from 'vitest';
import { buildMarkdown } from '../src/export/markdown.js';
import { ancestorsOf, buildTree } from '../src/folders/tree.js';
import type { FolderPayload, PreferencePayload } from '../src/types.js';

const folder = (id: string, path: string[], parent: string | null, count = 0): FolderPayload => ({
  id,
  name: path[path.length - 1] as string,
  parent_id: parent,
  path,
  ancestors: ancestorsOf(path),
  depth: path.length,
  domain: null,
  description: null,
  preference_count: count,
  created_at: '',
});

const pref = (over: Partial<PreferencePayload>): PreferencePayload => ({
  id: 'x',
  statement: 's',
  details: null,
  raw_text: '',
  polarity: 'dislike',
  domain: 'programming',
  project: null,
  applies_to: [],
  tags: [],
  constraints: [],
  constraint_metrics: [],
  level: 'default',
  strength: 3,
  why: null,
  example_good: null,
  example_bad: null,
  language: 'ru',
  folder_id: '',
  folder_name: '',
  folder_path: [],
  folder_ancestors: [],
  folder_depth: 0,
  source: 'text',
  is_active: true,
  history: [],
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  ...over,
});

describe('PREFERENCES.md', () => {
  const tree = buildTree([
    folder('a', ['Программирование'], null),
    folder('b', ['Программирование', 'Код'], 'a'),
    folder('c', ['Программирование', 'Код', 'Не люблю'], 'b', 1),
    folder('d', ['Рыбалка'], null),
  ]);
  const prefs = [
    pref({
      id: '1',
      folder_id: 'c',
      statement: 'Файлы с кодом больше 100 строк',
      level: 'hard',
      strength: 5,
      why: 'Длинный файл трудно читать',
      constraints: [{ metric: 'file_lines', operator: '<=', value: 100, unit: 'lines' }],
      tags: ['код'],
    }),
  ];

  it('renders the whole tree as headings with rules, constraints, level and why', () => {
    const md = buildMarkdown(tree, prefs, { generatedAt: 'T' });
    expect(md).toContain('# Мои предпочтения');
    expect(md).toContain('## Программирование');
    expect(md).toContain('### Код');
    expect(md).toContain('#### Не люблю');
    expect(md).toContain('## Рыбалка');
    expect(md).toContain('- Файлы с кодом больше 100 строк · **жёстко**');
    expect(md).toContain('  Почему: Длинный файл трудно читать');
    expect(md).toContain('**вкус** — учитывать');
    expect(md).toContain('`file_lines <= 100 lines`');
    expect(md.indexOf('## Программирование')).toBeLessThan(md.indexOf('#### Не люблю'));
  });

  it('renders a single branch for ?folder=', () => {
    const md = buildMarkdown(tree, prefs, {
      rootPath: ['Программирование', 'Код'],
      generatedAt: 'T',
    });
    expect(md).toContain('# Мои предпочтения — Программирование › Код');
    expect(md).not.toContain('Рыбалка');
    expect(md).toContain('file_lines');
  });
});
