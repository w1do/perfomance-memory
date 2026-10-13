import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Core } from '../src/core.js';
import { parsePackage, selectPackage } from '../src/transfer/parse.js';
import { testCore } from './helpers.js';
import { brokenRule, dropCollections, packageOf, ruleOf, SEL_ALL } from './transfer-fixtures.js';

describe('subset selection of invalid rules', () => {
  const raw = packageOf([
    ruleOf({ statement: 'Тихие места у воды', folder_path: ['Хобби', 'Люблю'] }),
    brokenRule({ folder_path: ['Рыбалка', 'Люблю'] }),
    brokenRule({ folder_path: ['Хобби', 'Не люблю'] }),
    brokenRule({ folder_path: 'Хобби' }),
  ]);

  it('counts an invalid rule only when it falls inside the selection', () => {
    const p = selectPackage(parsePackage(raw), { all: false, folders: ['Хобби'] });
    expect(p.rules).toHaveLength(1);
    expect(p.invalid).toBe(1);
    expect(p.errors).toHaveLength(1);
    expect(p.errors[0]).toContain('Правило #3');
  });

  it('counts an unreadable folder_path only with all=true', () => {
    const parsed = parsePackage(raw);
    expect(parsed.invalid).toBe(3);
    expect(selectPackage(parsed, SEL_ALL).invalid).toBe(3);
    expect(selectPackage(parsed, { all: false, folders: ['Хобби'] }).invalid).toBe(1);
  });
});

describe('selection with a real import', () => {
  let core: Core;

  beforeAll(async () => {
    ({ core } = await testCore());
  });

  afterAll(async () => {
    await dropCollections(core);
  });

  it('reports rules_total and errors only for the selected subtree', async () => {
    const report = await core.transfer.apply(
      packageOf([
        ruleOf({ statement: 'Палатка на берегу', folder_path: ['Походы', 'Люблю'] }),
        brokenRule({ folder_path: ['Рыбалка', 'Люблю'] }),
      ]),
      { all: false, folders: ['Походы'] },
    );
    expect(report.rules_total).toBe(1);
    expect(report.errors).toBe(0);
    expect(report.messages.some((m) => m.includes('Правило #2'))).toBe(false);
  });

  it('keeps the description and domain of an unselected ancestor', async () => {
    const report = await core.transfer.apply(
      packageOf(
        [
          ruleOf({
            statement: 'Костёр вечером',
            folder_path: ['Путешествия', 'Люблю'],
            domain: 'other',
          }),
        ],
        [{ path: ['Путешествия'], domain: 'other', description: 'Про путешествия' }],
      ),
      { all: false, folders: ['Путешествия/Люблю'] },
    );
    expect(report.rules_created).toBe(1);
    const folder = (await core.folders.list()).find((f) => f.path.join('/') === 'Путешествия');
    expect(folder?.description).toBe('Про путешествия');
    expect(folder?.domain).toBe('other');
  });
});
