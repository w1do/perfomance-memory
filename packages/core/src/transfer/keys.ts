/** Ключи для слияния с существующей памятью: путь папки, формулировка, префиксы пути. */
import { normName, sanitizePath } from '../folders/tree.js';

export const pathKey = (path: string[]): string => path.map(normName).join('/');

/** Ключ папки пропущенного правила по сырому folder_path (лучшее усилие); null, если путь не читается. */
export function rawPathKey(item: unknown): string | null {
  const fp = (item as { folder_path?: unknown } | null)?.folder_path;
  if (!Array.isArray(fp) || !fp.every((s) => typeof s === 'string')) return null;
  const path = sanitizePath(fp as string[]);
  return path.length && path.every(Boolean) ? pathKey(path) : null;
}

/** Формулировка без регистра, ё/е, пунктуации и лишних пробелов. */
export const statementKey = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export const underAny = (key: string, roots: string[]): boolean =>
  roots.some((r) => key === r || key.startsWith(`${r}/`));

/** Все префиксы пути, включая сам путь: ["A","B"] → [["A"],["A","B"]]. */
export const prefixes = (path: string[]): string[][] => path.map((_, i) => path.slice(0, i + 1));
