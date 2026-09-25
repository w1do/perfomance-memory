import type { AiProvider, ConflictDecision } from '../ai/provider.js';
import type { Config } from '../env.js';
import { FolderError, type FolderService } from '../folders/service.js';
import { siblingPolarityPath } from '../folders/tree.js';
import type { Logger } from '../logger.js';
import { buildPreferenceFilter, type QFilter } from '../qdrant/filters.js';
import type { Store } from '../qdrant/store.js';
import { bm25Document, bm25Query } from '../text/bm25.js';
import {
  KNOWN_DOMAINS,
  PROJECTS_ROOT,
  constraintSchema,
  domainSchema,
  folderPathSchema,
  polaritySchema,
  type Enrichment,
  type PreferenceFilter,
  type PreferencePayload,
  type Preview,
  type SaveResult,
  type ScoredPreference,
  type Source,
} from '../types.js';
import { Mutex } from './mutex.js';
import { constraintMetrics, normalizeEnrichment } from './normalize.js';
import { buildPayload, embeddingText, folderFields, snapshot } from './payload.js';
import { z } from 'zod';

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export class PreferenceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 422,
  ) {
    super(message);
    this.name = 'PreferenceError';
  }
}

export interface SaveInput {
  text?: string | undefined;
  preview?: { text: string; enrichment: unknown } | undefined;
  source: Source;
  projectHint?: string | null | undefined;
}

export const preferencePatchSchema = z
  .object({
    statement: z.string().trim().min(1).max(300),
    details: z.string().trim().max(600).nullable(),
    polarity: polaritySchema,
    folder_path: folderPathSchema,
    domain: domainSchema,
    project: z.string().trim().min(1).max(80).nullable(),
    applies_to: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(12),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(7),
    constraints: z.array(constraintSchema).max(10),
    strength: z.number().int().min(1).max(5),
  })
  .partial()
  .strict();
export type PreferencePatch = z.infer<typeof preferencePatchSchema>;

export interface ListOptions {
  q?: string | undefined;
  limit?: number | undefined;
  cursor?: string | null | undefined;
}

export const FACET_KEYS = [
  'domain',
  'project',
  'polarity',
  'applies_to',
  'tags',
  'constraint_metrics',
  'source',
  'language',
] as const;

export class PreferenceService {
  private readonly lock = new Mutex();

  constructor(
    private readonly store: Store,
    private readonly folders: FolderService,
    private readonly ai: AiProvider,
    private readonly config: Config,
    private readonly log: Logger,
    private readonly onChange: () => Promise<void>,
  ) {}

  /** Runs a write under the process lock and refreshes counters and the main file afterwards. */
  write<T>(fn: () => Promise<T>): Promise<T> {
    return this.lock.run(async () => {
      const result = await fn();
      await this.folders.recount();
      await this.onChange();
      return result;
    });
  }

  async knownDomains(): Promise<string[]> {
    const used = await this.store.facet('domain', {}, 100);
    return [...new Set([...KNOWN_DOMAINS, ...used.map((u) => u.value)])];
  }

  /** Enrichment without saving: folder tree + top-3 similar folders go to the model. */
  async preview(text: string, projectHint?: string | null): Promise<Preview> {
    const clean = text.trim();
    if (!clean) throw new PreferenceError('Пустой текст', 400);
    const [queryVector] = await this.ai.embed([clean]);
    const [tree, similar, projects, domains] = await Promise.all([
      this.folders.pathLines(),
      this.folders.similar(queryVector as number[], 3),
      this.folders.projects(),
      this.knownDomains(),
    ]);
    const raw = await this.ai.enrich({
      text: clean,
      folderTree: tree,
      similarFolders: similar,
      knownDomains: domains,
      projects: projects.map((p) => p.name),
      projectHint: projectHint ?? null,
    });
    const enrichment = normalizeEnrichment(raw, {
      sourceText: clean,
      projectHint: projectHint ?? null,
    });
    const existing = await this.folders.byPath(enrichment.folder_path);
    return { text: clean, enrichment, folder_exists: existing !== null, similar_folders: similar };
  }

  save(input: SaveInput): Promise<SaveResult> {
    return this.write(async () => {
      let rawText: string;
      let enrichment: Enrichment;
      if (input.preview) {
        rawText = input.preview.text.trim();
        enrichment = normalizeEnrichment(input.preview.enrichment);
      } else if (input.text?.trim()) {
        const p = await this.preview(input.text, input.projectHint);
        rawText = p.text;
        enrichment = p.enrichment;
      } else {
        throw new PreferenceError('Нужен text или preview', 400);
      }

      if (enrichment.kind === 'project_only') {
        const name =
          enrichment.project ?? enrichment.folder_path[enrichment.folder_path.length - 1] ?? '';
        const { folder } = await this.folders.ensurePath([PROJECTS_ROOT, name], 'project');
        this.log.info({ action: 'project_created', folder: folder.path }, 'pipeline');
        return { action: 'project_created', preference: null, folder } satisfies SaveResult;
      }

      const draftText = embeddingText(enrichment);
      const [draftDense] = await this.ai.embed([draftText]);
      const dense = draftDense as number[];

      const decision = await this.findConflict(enrichment, rawText, dense, draftText);
      const now = new Date().toISOString();

      if (decision.target && decision.decision.decision === 'duplicate') {
        const old = decision.target;
        const updated: PreferencePayload = {
          ...old,
          strength: Math.max(old.strength, enrichment.strength),
          updated_at: now,
        };
        await this.store.setPreferencePayload(old.id, {
          strength: updated.strength,
          updated_at: now,
        });
        const folder = await this.folders.byId(old.folder_id);
        this.log.info({ action: 'duplicate', id: old.id }, 'pipeline');
        return {
          action: 'duplicate',
          preference: updated,
          folder,
          reason: decision.decision.reason,
        } satisfies SaveResult;
      }

      if (decision.target && decision.decision.decision === 'conflict') {
        const old = decision.target;
        const path =
          old.polarity !== enrichment.polarity
            ? (siblingPolarityPath(old.folder_path, enrichment.polarity) ?? enrichment.folder_path)
            : old.folder_path;
        const { folder } = await this.folders.ensurePath(path, enrichment.domain);
        const replaced = snapshot(old, decision.decision.reason, now);
        const updated: PreferencePayload = {
          ...old,
          statement: enrichment.statement,
          details: enrichment.details,
          raw_text: rawText,
          polarity: enrichment.polarity,
          domain: enrichment.domain,
          project: enrichment.project,
          applies_to: enrichment.applies_to,
          tags: enrichment.tags,
          constraints: enrichment.constraints,
          constraint_metrics: constraintMetrics(enrichment.constraints),
          strength: enrichment.strength,
          language: enrichment.language,
          ...folderFields(folder),
          source: input.source,
          is_active: true,
          history: [...old.history, replaced],
          updated_at: now,
        };
        await this.upsert(updated);
        this.log.info(
          { action: 'updated', id: old.id, moved: path.join('/') !== old.folder_path.join('/') },
          'pipeline',
        );
        return {
          action: 'updated',
          preference: updated,
          replaced,
          folder,
          reason: decision.decision.reason,
        } satisfies SaveResult;
      }

      const { folder } = await this.folders.ensurePath(enrichment.folder_path, enrichment.domain);
      const payload = buildPayload({ enrichment, folder, rawText, source: input.source, now });
      const finalText = embeddingText(payload);
      if (finalText === draftText) {
        await this.store.upsertPreference(payload, dense, bm25Document(finalText));
      } else {
        await this.upsert(payload);
      }
      this.log.info({ action: 'created', id: payload.id, folder: folder.path }, 'pipeline');
      return { action: 'created', preference: payload, folder } satisfies SaveResult;
    });
  }

  /**
   * Hybrid search (RRF) within the same domain (and project) → candidates whose similarity reaches
   * CONFLICT_SCORE → top 5 → the LLM decides. Similarity is the max of the stored-vector cosine and the
   * cosine of the original phrases: opposite rules differ by their polarity folder and tags, so their
   * stored vectors drift apart, while the phrases stay close. The threshold only pre-filters; the LLM decides.
   */
  private async findConflict(
    e: Enrichment,
    rawText: string,
    dense: number[],
    text: string,
  ): Promise<{ decision: ConflictDecision; target: PreferencePayload | null }> {
    const filter = buildPreferenceFilter({ domain: e.domain, project: e.project ?? undefined });
    const pool = await this.store.hybrid(dense, bm25Query(text), filter, 10, { withDense: true });
    let candidates: { preference: PreferencePayload; score: number }[] = [];
    if (pool.length) {
      const [rawNew, ...rawOld] = await this.ai.embed([
        rawText,
        ...pool.map((c) => c.preference.raw_text),
      ]);
      candidates = pool
        .map((c, i) => ({
          preference: c.preference,
          score: Math.max(
            c.dense ? cosine(dense, c.dense) : 0,
            cosine(rawNew as number[], rawOld[i] as number[]),
          ),
        }))
        .filter((c) => c.score >= this.config.CONFLICT_SCORE)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    }
    this.log.info(
      { pool: pool.length, candidates: candidates.length, best: candidates[0]?.score ?? null },
      'conflict candidates',
    );
    if (!candidates.length) {
      return {
        decision: { decision: 'new', target_id: null, reason: 'похожих правил нет' },
        target: null,
      };
    }
    const decision = await this.ai.decideConflict(
      {
        statement: e.statement,
        details: e.details,
        polarity: e.polarity,
        constraints: e.constraints,
        raw_text: rawText,
      },
      candidates.map(({ preference: p }) => ({
        id: p.id,
        statement: p.statement,
        details: p.details,
        polarity: p.polarity,
        folder_path: p.folder_path,
        constraints: p.constraints,
        strength: p.strength,
      })),
    );
    const target =
      candidates.find((c) => c.preference.id === decision.target_id)?.preference ?? null;
    this.log.info(
      { candidates: candidates.length, decision: decision.decision, target: target?.id ?? null },
      'conflict check',
    );
    if (decision.decision !== 'new' && !target) {
      return { decision: { ...decision, decision: 'new' }, target: null };
    }
    return { decision, target };
  }

  private async upsert(p: PreferencePayload): Promise<void> {
    const text = embeddingText(p);
    const [dense] = await this.ai.embed([text]);
    await this.store.upsertPreference(p, dense as number[], bm25Document(text));
  }

  async get(id: string): Promise<PreferencePayload> {
    const p = await this.store.getPreference(id);
    if (!p) throw new PreferenceError('Правило не найдено', 404);
    return p;
  }

  /** Manual edit. Changes of meaning go to history; vectors are recomputed. */
  update(id: string, patch: PreferencePatch): Promise<PreferencePayload> {
    return this.write(async () => {
      const old = await this.get(id);
      const now = new Date().toISOString();
      let path = patch.folder_path ?? old.folder_path;
      if (!patch.folder_path && patch.polarity && patch.polarity !== old.polarity) {
        path = siblingPolarityPath(old.folder_path, patch.polarity) ?? old.folder_path;
      }
      const domain = patch.domain ?? old.domain;
      const { folder } = await this.folders.ensurePath(path, domain);
      const constraints = patch.constraints ?? old.constraints;
      const meaningChanged =
        (patch.statement !== undefined && patch.statement !== old.statement) ||
        (patch.polarity !== undefined && patch.polarity !== old.polarity) ||
        (patch.constraints !== undefined &&
          JSON.stringify(patch.constraints) !== JSON.stringify(old.constraints));
      const updated: PreferencePayload = {
        ...old,
        ...patch,
        domain,
        constraints,
        constraint_metrics: constraintMetrics(constraints),
        ...folderFields(folder),
        history: meaningChanged
          ? [...old.history, snapshot(old, 'ручная правка', now)]
          : old.history,
        updated_at: now,
      };
      await this.upsert(updated);
      return updated;
    });
  }

  remove(id: string): Promise<void> {
    return this.write(async () => {
      await this.get(id);
      await this.store.deletePreferences([id]);
    });
  }

  async search(query: string, filter: PreferenceFilter, topK: number): Promise<ScoredPreference[]> {
    const [dense] = await this.ai.embed([query]);
    return this.store.hybrid(
      dense as number[],
      bm25Query(query),
      buildPreferenceFilter(filter),
      topK,
    );
  }

  async list(
    filter: PreferenceFilter,
    opts: ListOptions = {},
  ): Promise<{ items: ScoredPreference[]; next: string | null }> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
    if (opts.q?.trim()) {
      return { items: await this.search(opts.q.trim(), filter, limit), next: null };
    }
    const page = await this.store.scrollPreferences(buildPreferenceFilter(filter), {
      limit,
      cursor: opts.cursor ?? null,
      newestFirst: !opts.cursor,
    });
    return {
      items: page.items.map((preference) => ({ preference, score: null })),
      next: page.next,
    };
  }

  all(filter: PreferenceFilter = {}): Promise<PreferencePayload[]> {
    return this.store.allPreferences(buildPreferenceFilter(filter));
  }

  /** Paged by id, for large folders (MCP get_folder). */
  page(filter: PreferenceFilter, limit: number, cursor: string | null) {
    return this.store.scrollPreferences(buildPreferenceFilter(filter), { limit, cursor });
  }

  async facets(
    filter: PreferenceFilter = {},
  ): Promise<Record<string, { value: string; count: number }[]>> {
    const qf: QFilter = buildPreferenceFilter(filter);
    const entries = await Promise.all(
      FACET_KEYS.map(async (key) => [key, await this.store.facet(key, qf, 100)] as const),
    );
    return Object.fromEntries(entries);
  }

  async stats() {
    const active = buildPreferenceFilter({});
    const [total, like, dislike, folders, projects, latest] = await Promise.all([
      this.store.countPreferences(active),
      this.store.countPreferences(buildPreferenceFilter({ polarity: 'like' })),
      this.store.countPreferences(buildPreferenceFilter({ polarity: 'dislike' })),
      this.store.countFolders(),
      this.folders.projects(),
      this.store.scrollPreferences(active, { limit: 1, newestFirst: true }),
    ]);
    return {
      total,
      like,
      dislike,
      folders,
      projects: projects.length,
      last: latest.items[0] ?? null,
    };
  }
}

export { FolderError };
