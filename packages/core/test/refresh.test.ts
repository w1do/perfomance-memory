import { describe, expect, it, vi } from 'vitest';
import { CoalescedRefresh } from '../src/preferences/refresh.js';
import { activeProbe, flush, makeLog, twoRefreshes, wait } from './concurrency-helpers.js';

describe('CoalescedRefresh', () => {
  it('coalesces requests made during a running refresh into one trailing refresh', async () => {
    const { g1, g2, refresh } = twoRefreshes();
    const r = new CoalescedRefresh(refresh, makeLog());

    const [a, b, c, d] = [r.request(), r.request(), r.request(), r.request()];
    g1.open();
    await flush();
    g2.open();
    await Promise.all([a, b, c, d]);

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(b).toBe(c);
    expect(c).toBe(d);
  });

  it('request after a finished refresh starts a new one', async () => {
    const refresh = vi.fn(async () => undefined);
    const r = new CoalescedRefresh(refresh, makeLog());

    await r.request();
    await r.request();

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('request resolves only after a refresh that started after the call', async () => {
    const { g1, g2, refresh } = twoRefreshes();
    const r = new CoalescedRefresh(refresh, makeLog());

    const a = r.request();
    const b = r.request();
    let bDone = false;
    void b.then(() => (bDone = true));

    g1.open();
    await a;
    await flush();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(bDone).toBe(false);

    g2.open();
    await b;
    expect(bDone).toBe(true);
  });

  it('retries once and logs warn on a single failure', async () => {
    const log = makeLog();
    const refresh = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('busy'))
      .mockResolvedValueOnce(undefined);
    const r = new CoalescedRefresh(refresh, log);

    await expect(r.request()).resolves.toBeUndefined();

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('logs error and resolves after two failures; next request runs again', async () => {
    const log = makeLog();
    const refresh = vi.fn(() => Promise.reject(new Error('disk full')));
    const r = new CoalescedRefresh(refresh, log);

    await expect(r.request()).resolves.toBeUndefined();

    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls[0]?.[0]).toMatchObject({
      err: { message: 'disk full', name: 'Error' },
    });

    await r.request();
    expect(refresh).toHaveBeenCalledTimes(4);
  });

  it('drain waits for the running and queued refresh', async () => {
    const { g1, g2, refresh } = twoRefreshes();
    const r = new CoalescedRefresh(refresh, makeLog());

    void r.request();
    void r.request();
    let drained = false;
    const done = r.drain().then(() => (drained = true));

    g1.open();
    await flush();
    await flush();
    expect(drained).toBe(false);

    g2.open();
    await done;
    expect(drained).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('never runs two refreshes at once', async () => {
    let active = 0;
    let maxActive = 0;
    const refresh = vi.fn(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await wait(3);
      active--;
    });
    const r = new CoalescedRefresh(refresh, makeLog());

    await Promise.all(Array.from({ length: 10 }, (_, i) => wait(i * 2).then(() => r.request())));

    expect(refresh).toHaveBeenCalled();
    expect(maxActive).toBe(1);
  });

  it('never starts two refreshes when a request lands between finish and the queued start', async () => {
    for (let k = 0; k <= 10; k++) {
      const probe = activeProbe();
      const r = new CoalescedRefresh(probe.refresh, makeLog());
      const a = r.request();
      const b = r.request();
      probe.openNext();
      for (let i = 0; i < k; i++) await Promise.resolve();
      const c = r.request();
      await probe.drive(Promise.all([a, b, c]));
      expect(probe.stats.maxActive, `k=${k}`).toBe(1);
    }
  });

  it('non-Error rejections are logged and do not break later requests', async () => {
    const log = makeLog();
    const refresh = vi.fn(() => Promise.reject('boom'));
    const r = new CoalescedRefresh(refresh, log);

    await expect(r.request()).resolves.toBeUndefined();

    expect(log.error.mock.calls[0]?.[0]).toMatchObject({
      err: { message: 'boom', name: 'NonError' },
    });
    await r.request();
    expect(refresh).toHaveBeenCalledTimes(4);
  });
});
