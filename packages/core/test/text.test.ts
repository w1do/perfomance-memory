import { describe, expect, it } from 'vitest';
import { bm25Document, bm25Query, tokenIndex } from '../src/text/bm25.js';
import { tokenize } from '../src/text/tokenize.js';

describe('tokenize + BM25', () => {
  it('stems Russian and drops stop words', () => {
    expect(tokenize('На рыбалке не люблю вставать')).toEqual(['рыбалк', 'любл', 'встава']);
    expect(tokenize('рыбалка')).toEqual(tokenize('рыбалке'));
    expect(tokenize('files with PHP')).toEqual(['file', 'php']);
    expect(tokenize('больше 100 строк')).toContain('100');
  });

  it('builds sorted u32 sparse vectors', () => {
    const v = bm25Document('код код файл');
    expect(v.indices).toEqual([...v.indices].sort((a, b) => a - b));
    expect(v.indices.every((i) => i >= 0 && i <= 0xffffffff)).toBe(true);
    const kod = v.values[v.indices.indexOf(tokenIndex('код'))] ?? 0;
    const file = v.values[v.indices.indexOf(tokenIndex('файл'))] ?? 0;
    expect(kod).toBeGreaterThan(file);
    expect(bm25Query('код код').values).toEqual([1]);
  });
});
