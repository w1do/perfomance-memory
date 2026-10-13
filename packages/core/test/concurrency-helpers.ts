import { vi } from 'vitest';
import type { Logger } from '../src/logger.js';
import { FakeAi } from './fake-ai.js';

/** Промис, который тест резолвит вручную. */
export function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export const flush = () => wait(0);

type Spy = ReturnType<typeof vi.fn>;
export function makeLog() {
  return { warn: vi.fn(), error: vi.fn() } as unknown as Logger & { warn: Spy; error: Spy };
}

/** Мок обновления: каждый вызов получает следующий gate по порядку. */
export function gated(...gates: ReturnType<typeof gate>[]) {
  return vi.fn(() => {
    const next = gates.shift();
    if (!next) throw new Error('unexpected refresh call');
    return next.promise;
  });
}

/** Два последовательных обновления, каждое открывается тестом отдельно. */
export function twoRefreshes() {
  const g1 = gate();
  const g2 = gate();
  return { g1, g2, refresh: gated(g1, g2) };
}

/** Обновление с подсчётом одновременно активных; каждый вызов ждёт свой gate. */
export function activeProbe() {
  const gates: Array<() => void> = [];
  const stats = { active: 0, maxActive: 0 };
  const refresh = vi.fn(async () => {
    stats.active++;
    stats.maxActive = Math.max(stats.maxActive, stats.active);
    await new Promise<void>((resolve) => gates.push(resolve));
    stats.active--;
  });
  const openNext = () => gates.shift()?.();
  /** Открывает все появляющиеся gate, пока p не завершится. */
  const drive = async <T>(p: Promise<T>): Promise<T> => {
    const timer = setInterval(() => gates.splice(0).forEach((open) => open()), 1);
    try {
      return await p;
    } finally {
      clearInterval(timer);
    }
  };
  return { refresh, stats, openNext, drive };
}

/**
 * Барьер: каждый вызов enrich ждёт, пока в полёте окажутся parties вызовов. Если обогащение
 * сериализовано, барьер не наберётся и вызов отклонится через timeoutMs — тест падает детерминированно.
 */
export function barrierEnrich(ai: FakeAi, parties: number, timeoutMs = 5000) {
  let arrived = 0;
  const all = gate();
  ai.enrich = async (input) => {
    arrived++;
    if (arrived === parties) all.open();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`enrich serialized: ${arrived}/${parties} in flight`)),
        timeoutMs,
      );
    });
    try {
      await Promise.race([all.promise, timeout]);
    } finally {
      clearTimeout(timer);
    }
    return FakeAi.prototype.enrich.call(ai, input);
  };
}

/** Держит enrich фразы heldText до release(); entered резолвится, когда этот вызов начался. */
export function holdEnrich(ai: FakeAi, heldText: string) {
  const entered = gate();
  const held = gate();
  ai.enrich = async (input) => {
    if (input.text === heldText) {
      entered.open();
      await held.promise;
    }
    return FakeAi.prototype.enrich.call(ai, input);
  };
  return { entered: entered.promise, release: held.open };
}

/** Возвращает исходное поведение FakeAi.enrich. */
export function plainEnrich(ai: FakeAi) {
  ai.enrich = (input) => FakeAi.prototype.enrich.call(ai, input);
}
