import { tokenize } from './tokenize.js';

/** Every stemmed word of `name` occurs in `text` («в семейном чате» mentions «Семейный чат»). */
export function mentions(text: string, name: string): boolean {
  const words = new Set(tokenize(text));
  const needed = tokenize(name);
  return needed.length > 0 && needed.every((w) => words.has(w));
}
