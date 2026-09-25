/** Русское множественное число для счётчиков главной: plural(5, RULES) → «правил». */
export const RULES = ['правило', 'правила', 'правил'] as const;
export const FOLDERS = ['папка', 'папки', 'папок'] as const;

export function plural(n: number, forms: readonly [string, string, string]): string {
  const d = Math.abs(n) % 100;
  const u = d % 10;
  if (d > 10 && d < 20) return forms[2];
  if (u === 1) return forms[0];
  if (u >= 2 && u <= 4) return forms[1];
  return forms[2];
}
