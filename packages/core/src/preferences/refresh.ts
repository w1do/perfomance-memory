/**
 * Коалесцированное обновление производных данных после записей: счётчики папок и PREFERENCES.md.
 * Работает вне замка записи, не больше одного обновления одновременно; запросы, пришедшие во время
 * обновления, ждут одного следующего. request() резолвится после обновления, начатого позже вызова.
 * Ошибка: один повтор (гонка с удалением папки), затем log.error; промис не отклоняется — запись уже
 * сохранена, данные догонит следующее обновление.
 */
import type { Logger } from '../logger.js';

export class CoalescedRefresh {
  private running: Promise<void> | null = null;
  private queued: Promise<void> | null = null;

  constructor(
    private readonly refresh: () => Promise<void>,
    private readonly log: Logger,
  ) {}

  /**
   * Порядок проверок важен: уже запрошенное обновление стартует после этого вызова, поэтому к нему можно
   * присоединиться даже в зазоре, когда текущее уже сбросило running, а хвостовое ещё не стартовало.
   */
  request(): Promise<void> {
    if (this.queued) return this.queued;
    if (!this.running) return this.start();
    const next = (): Promise<void> => {
      this.queued = null;
      return this.start();
    };
    this.queued = this.running.then(next, next);
    return this.queued;
  }

  /** Graceful shutdown: дожидается текущего и запрошенного обновления. */
  async drain(): Promise<void> {
    while (this.running || this.queued) await (this.queued ?? this.running);
  }

  private start(): Promise<void> {
    const run: Promise<void> = this.attempt().finally(() => {
      if (this.running === run) this.running = null;
    });
    this.running = run;
    return run;
  }

  private async attempt(): Promise<void> {
    try {
      await this.refresh();
    } catch (first) {
      this.log.warn({ err: describe(first) }, 'refresh after write failed, retrying');
      try {
        await this.refresh();
      } catch (second) {
        this.log.error(
          { err: describe(second) },
          'refresh after write failed: folder counters and PREFERENCES.md update on the next write',
        );
      }
    }
  }
}

function describe(err: unknown): { message: string; name: string } {
  if (err instanceof Error) return { message: err.message, name: err.name };
  return { message: String(err), name: 'NonError' };
}
