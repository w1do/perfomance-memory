/**
 * Ограничитель попыток входа в памяти процесса: не больше `max` неудачных попыток с одного адреса за `windowMs`.
 * Успешный вход сбрасывает счётчик. Одного процесса api достаточно — сервис однопользовательский.
 */
export class LoginLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly max = 5,
    private readonly windowMs = 15 * 60_000,
  ) {}

  private recent(ip: string, now: number): number[] {
    const list = (this.failures.get(ip) ?? []).filter((t) => now - t < this.windowMs);
    this.failures.set(ip, list);
    return list;
  }

  /** Сколько секунд ждать до следующей попытки, 0 — можно пробовать. */
  retryAfter(ip: string, now = Date.now()): number {
    const list = this.recent(ip, now);
    if (list.length < this.max) return 0;
    return Math.ceil((this.windowMs - (now - (list[0] as number))) / 1000);
  }

  fail(ip: string, now = Date.now()): void {
    this.recent(ip, now).push(now);
  }

  reset(ip: string): void {
    this.failures.delete(ip);
  }
}
