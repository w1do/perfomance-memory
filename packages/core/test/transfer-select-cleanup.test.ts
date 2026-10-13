import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Core } from '../src/core.js';
import { testCore } from './helpers.js';
import {
  dropCollections,
  LEFTOVER_MESSAGE,
  packageOf,
  ruleOf,
  SEL_ALL,
} from './transfer-fixtures.js';

describe('leftover folders after a failed import', () => {
  let core: Core;

  beforeAll(async () => {
    ({ core } = await testCore());
  });

  afterAll(async () => {
    await dropCollections(core);
  });

  it('reports leftover folders when creating and cleaning them both fail', async () => {
    const upsert = vi
      .spyOn(core.store, 'upsertFolders')
      .mockRejectedValueOnce(new Error('qdrant down'));
    const del = vi
      .spyOn(core.store, 'deleteFolders')
      .mockRejectedValueOnce(new Error('qdrant down'));
    let report;
    try {
      report = await core.transfer.apply(
        packageOf([
          ruleOf({ statement: 'Тихий режим в поездах', folder_path: ['Поезда', 'Люблю'] }),
        ]),
        SEL_ALL,
      );
    } finally {
      upsert.mockRestore();
      del.mockRestore();
    }
    expect(report.messages).toContain(LEFTOVER_MESSAGE);
    expect(report.rules_created).toBe(0);
    expect(report.folders_created).toBe(0);
  });

  it('keeps folders_created when a rule write and the orphan cleanup both fail', async () => {
    const upsert = vi
      .spyOn(core.store, 'upsertPreferences')
      .mockRejectedValueOnce(new Error('qdrant down'));
    const del = vi
      .spyOn(core.store, 'deleteFolders')
      .mockRejectedValueOnce(new Error('qdrant down'));
    let report;
    try {
      report = await core.transfer.apply(
        packageOf([
          ruleOf({ statement: 'Тихий режим на вокзалах', folder_path: ['Вокзалы', 'Люблю'] }),
        ]),
        SEL_ALL,
      );
    } finally {
      upsert.mockRestore();
      del.mockRestore();
    }
    expect(report.messages).toContain(LEFTOVER_MESSAGE);
    expect(report.rules_created).toBe(0);
    expect(report.folders_created).toBe(2);
  });
});
