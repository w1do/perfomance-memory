import { tokenize } from './tokenize.js';

export interface SparseVector {
  indices: number[];
  values: number[];
}

const K1 = 1.2;
const B = 0.75;
/** Average document length in tokens; preferences are short, fixed like fastembed's avg_len. */
const AVG_DOC_LEN = 16;

/** FNV-1a 32-bit — stable token → sparse index mapping (u32 as Qdrant requires). */
export function tokenIndex(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function toSparse(weights: Map<number, number>): SparseVector {
  const entries = [...weights].sort((a, b) => a[0] - b[0]);
  return { indices: entries.map((e) => e[0]), values: entries.map((e) => e[1]) };
}

/**
 * BM25 term-frequency part for a document. IDF is applied by Qdrant
 * (sparse vector configured with modifier "idf").
 */
export function bm25Document(text: string): SparseVector {
  const tokens = tokenize(text);
  const tf = new Map<number, number>();
  for (const t of tokens) {
    const idx = tokenIndex(t);
    tf.set(idx, (tf.get(idx) ?? 0) + 1);
  }
  const dl = tokens.length || 1;
  const weights = new Map<number, number>();
  for (const [idx, f] of tf) {
    weights.set(idx, (f * (K1 + 1)) / (f + K1 * (1 - B + (B * dl) / AVG_DOC_LEN)));
  }
  return toSparse(weights);
}

/** Query side: every unique token weighs 1, IDF comes from the collection. */
export function bm25Query(text: string): SparseVector {
  const weights = new Map<number, number>();
  for (const t of tokenize(text)) weights.set(tokenIndex(t), 1);
  return toSparse(weights);
}
