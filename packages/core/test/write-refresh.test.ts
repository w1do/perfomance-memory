import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
} from 'vitest';
import type { Core } from '../src/core.js';
import type { Config } from '../src/env.js';
import { createLogger } from '../src/logger.js';
import { PreferenceService } from '../src/preferences/service.js';
import type { FakeAi } from './fake-ai.js';
import { testCore } from './helpers.js';

const log = createLogger('silent', 'test');

describe('PreferenceService.write: coalesced refresh of counters and PREFERENCES.md', () => {
  let core: Core;
  let ai: FakeAi;
  let config: Config;
  let recount: MockInstance;
  let onChange: Mock<() => Promise<void>>;
  let prefs: PreferenceService;

  beforeAll(async () => {
    ({ core, ai, config } = await testCore());
    recount = vi.spyOn(core.folders, 'recount');
  });
  beforeEach(() => {
    recount.mockClear();
    onChange = vi.fn(async () => undefined);
    prefs = new PreferenceService(core.store, core.folders, ai, config, log, onChange);
  });
  afterAll(async () => {
    await core.qdrant.deleteCollection(config.QDRANT_COLLECTION);
    await core.qdrant.deleteCollection(config.QDRANT_FOLDERS_COLLECTION);
  });

  it('coalesces a burst of writes into at most two refreshes', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => prefs.write(async () => 'ok')),
    );

    expect(results.every((r) => r === 'ok')).toBe(true);
    expect(recount.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(recount.mock.calls.length).toBeLessThanOrEqual(2);
    expect(onChange).toHaveBeenCalledTimes(recount.mock.calls.length);
  });

  it('refreshes after the last write of a burst', async () => {
    const starts: number[] = [];
    const ends: number[] = [];
    onChange.mockImplementation(async () => {
      starts.push(Date.now());
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        prefs.write(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10 * (i + 1)));
          ends.push(Date.now());
          return i;
        }),
      ),
    );

    const lastEnd = Math.max(...ends);
    const lastStart = Math.max(...starts);
    expect(lastStart).toBeGreaterThanOrEqual(lastEnd);
  });

  it('a failed refresh does not fail the write and is logged', async () => {
    onChange.mockRejectedValue(new Error('disk full'));
    const error = vi.spyOn(log, 'error');

    await expect(prefs.write(async () => 1)).resolves.toBe(1);

    expect(error).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it('drain waits for the pending refresh', async () => {
    let done = false;
    onChange.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      done = true;
    });

    void prefs.write(async () => 'ok');
    await prefs.drain();

    expect(done).toBe(true);
  });

  it('write errors propagate and skip refresh', async () => {
    await expect(
      prefs.write(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(recount).not.toHaveBeenCalled();
  });
});
