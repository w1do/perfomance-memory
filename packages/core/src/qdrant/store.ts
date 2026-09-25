import { asPreference } from './payloadDefaults.js';
import type { QdrantClient, Schemas } from '@qdrant/js-client-rest';
import type { Config } from '../env.js';
import type { SparseVector } from '../text/bm25.js';
import type { FolderPayload, PreferencePayload, ScoredPreference } from '../types.js';
import type { QFilter } from './filters.js';
import { DENSE, SPARSE } from './schema.js';

type Filter = Schemas['Filter'];
const asFilter = (f: QFilter | undefined): Filter | undefined => f as Filter | undefined;

export interface Page<T> {
  items: T[];
  next: string | null;
}

/** Thin typed wrapper over the two Qdrant collections. No business rules here. */
export class Store {
  constructor(
    readonly qdrant: QdrantClient,
    readonly config: Config,
  ) {}

  get prefs(): string {
    return this.config.QDRANT_COLLECTION;
  }

  get folders(): string {
    return this.config.QDRANT_FOLDERS_COLLECTION;
  }

  // ---------- preferences ----------

  async getPreference(id: string): Promise<PreferencePayload | null> {
    const res = await this.qdrant.retrieve(this.prefs, { ids: [id], with_payload: true });
    return res[0]?.payload ? asPreference(res[0].payload) : null;
  }

  async upsertPreference(
    p: PreferencePayload,
    dense: number[],
    sparse: SparseVector,
  ): Promise<void> {
    await this.qdrant.upsert(this.prefs, {
      wait: true,
      points: [{ id: p.id, vector: { [DENSE]: dense, [SPARSE]: sparse }, payload: { ...p } }],
    });
  }

  async upsertPreferences(
    items: { payload: PreferencePayload; dense: number[]; sparse: SparseVector }[],
  ): Promise<void> {
    if (!items.length) return;
    await this.qdrant.upsert(this.prefs, {
      wait: true,
      points: items.map((i) => ({
        id: i.payload.id,
        vector: { [DENSE]: i.dense, [SPARSE]: i.sparse },
        payload: { ...i.payload },
      })),
    });
  }

  async setPreferencePayload(id: string, payload: Partial<PreferencePayload>): Promise<void> {
    await this.qdrant.setPayload(this.prefs, { wait: true, points: [id], payload: { ...payload } });
  }

  /** Several set_payload operations in one request (used when folders move). */
  async batchSetPreferencePayload(
    ops: { filter: QFilter; payload: Partial<PreferencePayload> }[],
  ): Promise<void> {
    if (!ops.length) return;
    await this.qdrant.batchUpdate(this.prefs, {
      wait: true,
      operations: ops.map((op) => ({
        set_payload: { payload: { ...op.payload }, filter: asFilter(op.filter) as Filter },
      })),
    });
  }

  async deletePreferences(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.qdrant.delete(this.prefs, { wait: true, points: ids });
  }

  async scrollPreferences(
    filter: QFilter,
    opts: { limit: number; cursor?: string | null; newestFirst?: boolean },
  ): Promise<Page<PreferencePayload>> {
    const res = await this.qdrant.scroll(this.prefs, {
      filter: asFilter(filter),
      limit: opts.limit,
      with_payload: true,
      with_vector: false,
      ...(opts.newestFirst
        ? { order_by: { key: 'updated_at', direction: 'desc' as const } }
        : opts.cursor
          ? { offset: opts.cursor }
          : {}),
    });
    const next = res.next_page_offset;
    return {
      items: res.points.map((p) => asPreference(p.payload)),
      next: typeof next === 'string' || typeof next === 'number' ? String(next) : null,
    };
  }

  async allPreferences(filter: QFilter): Promise<PreferencePayload[]> {
    const out: PreferencePayload[] = [];
    let cursor: string | null = null;
    do {
      const page: Page<PreferencePayload> = await this.scrollPreferences(filter, {
        limit: 256,
        cursor,
      });
      out.push(...page.items);
      cursor = page.next;
    } while (cursor);
    return out;
  }

  async allPreferencePoints(): Promise<{ payload: PreferencePayload }[]> {
    return (await this.allPreferences({})).map((payload) => ({ payload }));
  }

  async countPreferences(filter: QFilter): Promise<number> {
    const res = await this.qdrant.count(this.prefs, { filter: asFilter(filter), exact: true });
    return res.count;
  }

  async facet(
    key: string,
    filter: QFilter,
    limit = 50,
  ): Promise<{ value: string; count: number }[]> {
    const res = await this.qdrant.facet(this.prefs, {
      key,
      filter: asFilter(filter),
      limit,
      exact: true,
    });
    return res.hits.map((h) => ({ value: String(h.value), count: h.count }));
  }

  /** Hybrid search: metadata filter first, then dense + sparse prefetch fused with RRF. */
  async hybrid(
    dense: number[],
    sparse: SparseVector,
    filter: QFilter,
    limit: number,
    opts: { withDense?: boolean } = {},
  ): Promise<(ScoredPreference & { dense?: number[] })[]> {
    const f = asFilter(filter);
    const pool = Math.max(limit * 4, 20);
    const prefetch: Schemas['Prefetch'][] = [
      { query: dense, using: DENSE, filter: f, limit: pool },
    ];
    if (sparse.indices.length)
      prefetch.push({ query: sparse, using: SPARSE, filter: f, limit: pool });
    const res = await this.qdrant.query(this.prefs, {
      prefetch,
      query: { fusion: 'rrf' },
      filter: f,
      limit,
      with_payload: true,
      with_vector: opts.withDense ? [DENSE] : false,
    });
    return res.points.map((p) => {
      const vec = (p.vector as Record<string, unknown> | undefined)?.[DENSE];
      return {
        preference: asPreference(p.payload),
        score: p.score,
        ...(Array.isArray(vec) ? { dense: vec as number[] } : {}),
      };
    });
  }

  // ---------- folders ----------

  async allFolders(): Promise<FolderPayload[]> {
    const out: FolderPayload[] = [];
    let offset: string | number | undefined;
    for (;;) {
      const res = await this.qdrant.scroll(this.folders, {
        limit: 256,
        with_payload: true,
        with_vector: false,
        ...(offset !== undefined ? { offset } : {}),
      });
      out.push(...res.points.map((p) => p.payload as unknown as FolderPayload));
      const next = res.next_page_offset;
      if (typeof next !== 'string' && typeof next !== 'number') break;
      offset = next;
    }
    return out;
  }

  async upsertFolders(items: { payload: FolderPayload; dense: number[] }[]): Promise<void> {
    if (!items.length) return;
    await this.qdrant.upsert(this.folders, {
      wait: true,
      points: items.map((i) => ({
        id: i.payload.id,
        vector: { [DENSE]: i.dense },
        payload: { ...i.payload },
      })),
    });
  }

  async setFolderPayloads(items: { id: string; payload: Partial<FolderPayload> }[]): Promise<void> {
    if (!items.length) return;
    await this.qdrant.batchUpdate(this.folders, {
      wait: true,
      operations: items.map((i) => ({
        set_payload: { payload: { ...i.payload }, points: [i.id] },
      })),
    });
  }

  async deleteFolders(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.qdrant.delete(this.folders, { wait: true, points: ids });
  }

  async similarFolders(
    dense: number[],
    limit: number,
  ): Promise<{ folder: FolderPayload; score: number }[]> {
    const res = await this.qdrant.query(this.folders, {
      query: dense,
      using: DENSE,
      limit,
      with_payload: true,
    });
    return res.points.map((p) => ({
      folder: p.payload as unknown as FolderPayload,
      score: p.score,
    }));
  }

  async countFolders(): Promise<number> {
    return (await this.qdrant.count(this.folders, { exact: true })).count;
  }
}
