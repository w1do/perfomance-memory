import { describe, expect, it } from 'vitest';
import { newFolderPayload } from '../src/folders/payload.js';
import { PreferenceError } from '../src/preferences/schemas.js';
import { ExactIndex } from '../src/transfer/dedup.js';
import { planFolders } from '../src/transfer/folders.js';
import { MAX_PREFERENCES, SCHEMA_FORMAT } from '../src/transfer/format.js';
import { parsePackage, selectPackage } from '../src/transfer/parse.js';

const base = (over: Record<string, unknown> = {}) => ({
  format: SCHEMA_FORMAT,
  version: 1,
  name: 'Схема',
  exported_at: '2026-10-13T10:00:00.000Z',
  folders: [],
  preferences: [],
  ...over,
});

const rule = (over: Record<string, unknown> = {}) => ({
  statement: 'Файлы длиннее 100 строк',
  polarity: 'dislike',
  domain: 'programming',
  folder_path: ['Программирование', 'Код', 'Не люблю'],
  ...over,
});

const hist = {
  statement: 'a',
  details: null,
  polarity: 'like',
  folder_path: ['A'],
  strength: 3,
  constraints: [],
  raw_text: 'a',
  changed_at: '2026-01-01T00:00:00Z',
  reason: null,
};

/** Ошибка разбора пакета или null, если пакет принят. */
const parseError = (raw: unknown): PreferenceError | null => {
  try {
    parsePackage(raw);
    return null;
  } catch (err) {
    return err as PreferenceError;
  }
};

describe('transfer: envelope and limits', () => {
  it('rejects garbage, a newer version, oversized input and bad fields with 400', () => {
    for (const raw of [null, 'x', [], {}, { format: 'other', version: 1 }]) {
      const e = parseError(raw);
      expect(e).toBeInstanceOf(PreferenceError);
      expect(e?.status).toBe(400);
      expect(e?.message).toBe('Файл не похож на пакет схемы предпочтений');
    }
    expect(parseError(base({ version: 2 }))?.message).toContain('версии 2');
    const preferences = Array.from({ length: MAX_PREFERENCES + 1 }, () => ({}));
    expect(parseError(base({ preferences }))?.message).toContain('поле «preferences»');
    expect(parseError(base({ name: 'а'.repeat(121) }))?.status).toBe(400);
    expect(parseError(base({ folders: [{ path: [] }] }))?.message).toBe('Неверный пакет: папка #1');
  });
});

describe('transfer: rule validation', () => {
  it('skips invalid rules, keeps the valid one without service fields', () => {
    const p = parsePackage(
      base({
        preferences: [
          rule({ statement: undefined }),
          rule({ history: Array.from({ length: 21 }, () => hist) }),
          rule({
            id: 'x',
            folder_id: 'y',
            source: 'voice',
            is_active: false,
            folder_path: ['Код'],
          }),
        ],
      }),
    );
    expect(p.rules).toHaveLength(1);
    expect(p.invalid).toBe(2);
    expect(p.errors).toHaveLength(2);
    const e = p.rules[0]?.enrichment as unknown as Record<string, unknown>;
    expect(Object.keys(e)).not.toContain('id');
    expect(Object.keys(e)).not.toContain('source');
    expect(p.rules[0]?.enrichment.folder_path).toEqual(['Код', 'Не люблю']);
  });
});

describe('transfer: selection', () => {
  const pkg = parsePackage(
    base({
      preferences: [
        rule(),
        rule({
          statement: 'Рыбалка рано',
          domain: 'fishing',
          folder_path: ['Рыбалка', 'Не люблю'],
        }),
      ],
    }),
  );

  it('keeps only the chosen subtree, case-insensitively; rejects an empty choice', () => {
    const s = selectPackage(pkg, { all: false, folders: ['программирование'] });
    expect(s.rules.map((r) => r.enrichment.statement)).toEqual(['Файлы длиннее 100 строк']);
    expect(() => selectPackage(pkg, { all: false, folders: [] })).toThrow(PreferenceError);
  });
});

describe('transfer: exact duplicates', () => {
  const idx = new ExactIndex([
    { statement: 'Грубые ответы ChatGPT', polarity: 'dislike', project: null },
  ]);
  it('classifies same text as duplicate, opposite polarity as conflict, other project as new', () => {
    const cls = (statement: string, polarity: 'like' | 'dislike', project: string | null) =>
      idx.classify({ statement, polarity, project });
    expect(cls('грубые  ответы, chatgpt!', 'dislike', null)).toBe('duplicate');
    expect(cls('Грубые ответы ChatGPT', 'like', null)).toBe('conflict');
    expect(cls('Грубые ответы ChatGPT', 'dislike', 'X')).toBe('new');
  });
});

describe('transfer: folder merge', () => {
  const prog = newFolderPayload('программирование', null, 'programming', null);
  it('reuses an existing folder matched by name and creates only the missing level', () => {
    const { created } = planFolders(
      [prog],
      [{ path: ['Программирование', 'Код'], domain: 'programming' }],
      new Map(),
    );
    expect(created).toHaveLength(1);
    expect(created[0]?.name).toBe('Код');
    expect(created[0]?.parent_id).toBe(prog.id);
  });

  it('marks the Projects root as a project and takes the description from meta', () => {
    const { created } = planFolders(
      [],
      [{ path: ['Проекты', 'Дача', 'Люблю'], domain: 'project' }],
      new Map([['проекты/дача', { domain: null, description: 'Про дачу' }]]),
    );
    expect(created.map((f) => f.name)).toEqual(['Проекты', 'Дача', 'Люблю']);
    expect(created[0]?.domain).toBe('project');
    expect(created[1]?.description).toBe('Про дачу');
  });
});
