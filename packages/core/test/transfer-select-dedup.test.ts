import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Core } from '../src/core.js';
import { testCore } from './helpers.js';
import { dropCollections, packageOf, ruleOf, SEL_ALL } from './transfer-fixtures.js';

const PROJECT_FOLDER = ['Проекты', 'Семейный чат', 'Люблю'];

describe('semantic duplicates across projects', () => {
  let core: Core;

  beforeAll(async () => {
    ({ core } = await testCore());
  });

  afterAll(async () => {
    await dropCollections(core);
  });

  it('finds a null-project duplicate when other projects crowd the top results', async () => {
    for (let i = 1; i <= 6; i++) {
      await core.transfer.apply(
        packageOf([
          ruleOf({
            statement: `Минимальный интерфейс без лишних элементов вариант ${i}`,
            folder_path: PROJECT_FOLDER,
            domain: 'project',
            project: 'Семейный чат',
          }),
        ]),
        SEL_ALL,
      );
    }
    const base = await core.transfer.apply(
      packageOf([ruleOf({ statement: 'Минимальный интерфейс без лишних элементов' })]),
      SEL_ALL,
    );
    expect(base.rules_created).toBe(1);
    const dup = await core.transfer.apply(
      packageOf([ruleOf({ statement: 'Без лишних элементов минимальный интерфейс' })]),
      SEL_ALL,
    );
    expect(dup.duplicates).toBe(1);
    expect(dup.rules_created).toBe(0);
  });

  it('detects a duplicate in a project whose name differs only by case', async () => {
    const report = await core.transfer.apply(
      packageOf([
        ruleOf({
          statement: 'Без лишних элементов минимальный интерфейс',
          folder_path: PROJECT_FOLDER,
          domain: 'project',
          project: 'семейный ЧАТ',
        }),
      ]),
      SEL_ALL,
    );
    expect(report.duplicates).toBe(1);
    expect(report.rules_created).toBe(0);
  });
});
