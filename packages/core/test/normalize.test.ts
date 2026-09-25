import { describe, expect, it } from 'vitest';
import {
  alignPolarityLeaf,
  ancestorsOf,
  buildTree,
  siblingPolarityPath,
} from '../src/folders/tree.js';
import { normalizeEnrichment } from '../src/preferences/normalize.js';
import { buildPayload } from '../src/preferences/payload.js';
import type { FolderPayload } from '../src/types.js';

const raw = {
  kind: 'preference',
  statement: ' Файлы с кодом больше 100 строк ',
  details: '',
  polarity: 'dislike',
  folder_path: ['Программирование', 'Код', 'Люблю'],
  domain: 'Programming',
  project: null,
  applies_to: ['Any_AI', 'any_ai'],
  tags: ['Код', 'файлы', 'размер', 'код'],
  constraints: [
    { metric: 'file_lines', operator: '<=', value: 100, unit: 'lines' },
    { metric: 'Bad Metric!', operator: '~', value: 1, unit: null },
  ],
  strength: 9,
  language: 'RU',
};

describe('enrichment normalisation and metadata', () => {
  it('cleans model output without inventing data', () => {
    const e = normalizeEnrichment(raw);
    expect(e.statement).toBe('Файлы с кодом больше 100 строк');
    expect(e.details).toBeNull();
    expect(e.domain).toBe('programming');
    expect(e.applies_to).toEqual(['any_ai']);
    expect(e.tags).toEqual(['код', 'файлы', 'размер']);
    expect(e.constraints).toEqual([
      { metric: 'file_lines', operator: '<=', value: 100, unit: 'lines' },
    ]);
    expect(e.level).toBe('hard'); // старая сила 9 без уровня → жёстко
    expect(e.strength).toBe(5);
    expect(e.why).toBeNull();
    expect(e.language).toBe('ru');
    // polarity leaf is aligned with polarity
    expect(e.folder_path).toEqual(['Программирование', 'Код', 'Не люблю']);
  });

  it('drops targets the phrase never mentions and polarity words in tags (no invented data)', () => {
    const e = normalizeEnrichment(
      {
        ...raw,
        applies_to: ['php', 'react', 'any_ai', 'ChatGPT'],
        tags: ['код', 'не люблю', 'предпочтения', 'файлы'],
      },
      { sourceText: 'не люблю, когда ChatGPT пишет файлы с кодом больше 100 строк' },
    );
    expect(e.applies_to).toEqual(['any_ai', 'chatgpt']);
    expect(e.tags).toEqual(['код', 'файлы']);
    // user edits in the preview (no sourceText) are kept as typed
    expect(normalizeEnrichment({ ...raw, applies_to: ['php'] }).applies_to).toEqual(['php']);
  });

  it('turns literal model conditions into requirements by polarity', () => {
    const cond = [{ metric: 'file_lines', operator: '>', value: 100, unit: 'lines' }];
    const rest: Omit<typeof raw, 'constraints'> & { constraints?: unknown } = { ...raw };
    delete rest.constraints;
    expect(normalizeEnrichment({ ...rest, conditions: cond }).constraints).toEqual([
      { metric: 'file_lines', operator: '<=', value: 100, unit: 'lines' },
    ]);
    expect(
      normalizeEnrichment({
        ...rest,
        polarity: 'like',
        conditions: [{ metric: 'response_words', operator: '<', value: 200, unit: 'words' }],
      }).constraints[0]?.operator,
    ).toBe('<');
    expect(
      normalizeEnrichment({
        ...rest,
        conditions: [{ metric: 'wake_up_hour', operator: '<', value: 5, unit: 'hour' }],
      }).constraints[0]?.operator,
    ).toBe('>=');
  });

  it('drops a project the user never named and refiles the rule by domain', () => {
    const git = {
      ...raw,
      statement: 'git commit без разрешения',
      project: 'Дача',
      domain: 'project',
      folder_path: ['Проекты', 'Дача', 'Не люблю'],
      conditions: [],
    };
    const e = normalizeEnrichment(git, {
      sourceText: 'не люблю, когда агент делает git commit без моего разрешения',
    });
    expect(e.project).toBeNull();
    expect(e.folder_path).toEqual(['Разное', 'Не люблю']);
    expect(e.domain).toBe('other');
    const prog = normalizeEnrichment(
      { ...git, domain: 'programming' },
      { sourceText: 'не люблю git commit без спроса' },
    );
    expect(prog.folder_path).toEqual(['Программирование', 'Не люблю']);
    // named in the phrase (any case form) or passed explicitly → kept
    expect(normalizeEnrichment(git, { sourceText: 'на даче не люблю лишний шум' }).project).toBe(
      'Дача',
    );
    expect(
      normalizeEnrichment(git, { sourceText: 'не люблю шум', projectHint: 'Дача' }).folder_path,
    ).toEqual(['Проекты', 'Дача', 'Не люблю']);
  });

  it('treats "null" strings as null', () => {
    const e = normalizeEnrichment({ ...raw, details: 'null', project: ' null ' });
    expect(e.details).toBeNull();
    expect(e.project).toBeNull();
  });

  it('project_only puts the folder under «Проекты»', () => {
    const e = normalizeEnrichment({
      ...raw,
      kind: 'project_only',
      project: 'Дача',
      folder_path: ['x'],
    });
    expect(e.folder_path).toEqual(['Проекты', 'Дача']);
  });

  it('builds a payload with every metadata field', () => {
    const e = normalizeEnrichment(raw);
    const folder: FolderPayload = {
      id: 'f1',
      name: 'Не люблю',
      parent_id: 'p',
      path: e.folder_path,
      ancestors: ancestorsOf(e.folder_path),
      depth: 3,
      domain: 'programming',
      description: null,
      preference_count: 0,
      created_at: 'x',
    };
    const p = buildPayload({ enrichment: e, folder, rawText: 'сырой текст', source: 'voice' });
    expect(Object.keys(p).sort()).toEqual(
      [
        'id',
        'statement',
        'details',
        'raw_text',
        'polarity',
        'domain',
        'project',
        'applies_to',
        'tags',
        'constraints',
        'constraint_metrics',
        'level',
        'strength',
        'why',
        'example_good',
        'example_bad',
        'language',
        'folder_id',
        'folder_name',
        'folder_path',
        'folder_ancestors',
        'folder_depth',
        'source',
        'is_active',
        'history',
        'created_at',
        'updated_at',
      ].sort(),
    );
    expect(p.constraint_metrics).toEqual(['file_lines']);
    expect(p.folder_ancestors).toEqual([
      'Программирование',
      'Программирование/Код',
      'Программирование/Код/Не люблю',
    ]);
    expect(p.folder_depth).toBe(3);
    expect(p.history).toEqual([]);
  });

  it('polarity sibling paths', () => {
    expect(siblingPolarityPath(['ChatGPT', 'Не люблю'], 'like')).toEqual(['ChatGPT', 'Люблю']);
    expect(siblingPolarityPath(['ChatGPT', 'Тон'], 'like')).toBeNull();
    expect(alignPolarityLeaf(['Рыбалка', 'люблю'], 'dislike')).toEqual(['Рыбалка', 'Не люблю']);
  });

  it('builds a tree with nested totals and «Проекты» last', () => {
    const f = (id: string, path: string[], parent: string | null, count = 0): FolderPayload => ({
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
    const tree = buildTree([
      f('p', ['Проекты'], null),
      f('r', ['Рыбалка'], null),
      f('rn', ['Рыбалка', 'Не люблю'], 'r', 2),
      f('rl', ['Рыбалка', 'Люблю'], 'r', 1),
    ]);
    expect(tree.map((n) => n.name)).toEqual(['Рыбалка', 'Проекты']);
    expect(tree[0]?.children.map((n) => n.name)).toEqual(['Люблю', 'Не люблю']);
    expect(tree[0]?.total_count).toBe(3);
  });
});
