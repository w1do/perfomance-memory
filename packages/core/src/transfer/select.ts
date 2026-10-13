/** Выбор поддеревьев пакета: папки и правила выбора, предки выбранных папок (для описания и домена), ошибки внутри выбора. */
import { splitPath } from '../folders/tree.js';
import { PreferenceError } from '../preferences/schemas.js';
import type { ImportSelection } from './format.js';
import { pathKey, underAny } from './keys.js';
import type { ParsedPackage } from './parse.js';

const MAX_ERRORS = 20;

/** Без выбора («всё») пакет возвращается целиком. Иначе — выбранные поддеревья и их предки. */
export function selectPackage(p: ParsedPackage, sel: ImportSelection): ParsedPackage {
  if (sel.all) return p;
  const roots = sel.folders.map((f) => pathKey(splitPath(f)));
  if (!roots.length) throw new PreferenceError('Выберите папки для импорта', 400);
  const inside = (key: string) => underAny(key, roots);
  // предок выбранной папки нужен как носитель описания и домена; сам он создаётся только как префикс выбранного
  const ancestor = (key: string) => roots.some((r) => r.startsWith(`${key}/`));
  // битое правило без читаемой папки неизвестно, к чему относится, поэтому в выборке не учитывается
  const bad = p.invalidRules.filter((r) => r.key !== null && inside(r.key));
  return {
    ...p,
    folders: p.folders.filter((f) => inside(f.key) || ancestor(f.key)),
    rules: p.rules.filter((r) => inside(r.key)),
    invalidRules: bad,
    invalid: bad.length,
    errors: bad.slice(0, MAX_ERRORS).map((r) => r.message),
  };
}
