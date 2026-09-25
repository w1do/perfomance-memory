/**
 * Опечатки в именах папок и тегов: новое имя, отличающееся от существующего на 1–2 буквы, считается тем же
 * («Деплои и CI» → «Деплой и CI»). Короткие имена (до 4 букв) сравниваются только точно, без учёта регистра.
 */
const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е');

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(
        (prev[j] as number) + 1,
        (cur[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
    }
    prev = cur;
  }
  return prev[b.length] as number;
}

/** Сколько правок считать опечаткой, а не другим словом. */
const allowed = (len: number) => (len >= 9 ? 2 : len >= 5 ? 1 : 0);

/** Существующее имя, которое пользователь, скорее всего, имел в виду; иначе null. */
export function closest(name: string, known: Iterable<string>): string | null {
  const n = norm(name);
  let best: { value: string; d: number } | null = null;
  for (const k of known) {
    const d = levenshtein(n, norm(k));
    if (d === 0) return k;
    if (d <= allowed(Math.min(n.length, norm(k).length)) && (!best || d < best.d))
      best = { value: k, d };
  }
  return best?.value ?? null;
}

/** Путь, приклеенный к существующим папкам на каждом уровне, пока они совпадают с точностью до опечатки. */
export function snapPath(path: string[], known: string[][]): string[] {
  const out: string[] = [];
  for (const [i, seg] of path.entries()) {
    const siblings = new Set(
      known
        .filter((k) => k.length > i && out.every((s, j) => k[j] === s))
        .map((k) => k[i] as string),
    );
    out.push(closest(seg, siblings) ?? seg);
  }
  return out;
}
