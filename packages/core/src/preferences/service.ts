/**
 * Сервис правил: превью (обогащение без сохранения), сохранение, ручная правка, удаление и чтение.
 * Записи идут под мьютексом процесса, после каждой — пересчёт счётчиков папок и пересборка PREFERENCES.md.
 * Логика вынесена: save.ts (конвейер), conflict.ts, query.ts, schemas.ts.
 */
import type { AiProvider } from '../ai/provider.js';
import type { Config } from '../env.js';
import { FolderError, type FolderService } from '../folders/service.js';
import type { Logger } from '../logger.js';
import { buildPreferenceFilter } from '../qdrant/filters.js';
import type { Store } from '../qdrant/store.js';
import {
  type PreferenceFilter,
  type PreferencePayload,
  type Preview,
  type SaveResult,
} from '../types.js';
import type { PrefDeps } from './deps.js';
import { Mutex } from './mutex.js';
import { normalizeEnrichment } from './normalize.js';
import { previewText } from './preview.js';
import { withExplicit } from './rationale.js';
import { getOrThrow, updatePreference } from './update.js';
import * as q from './query.js';
import { saveEnrichment } from './save.js';
import {
  PreferenceError,
  type ListOptions,
  type PreferencePatch,
  type SaveInput,
} from './schemas.js';

export { FACET_KEYS, PreferenceError, preferencePatchSchema } from './schemas.js';
export type { ListOptions, PreferencePatch, SaveInput } from './schemas.js';
export { cosine } from './conflict.js';
export { FolderError };

export class PreferenceService {
  private readonly lock = new Mutex();
  private readonly deps: PrefDeps;

  constructor(
    store: Store,
    private readonly folders: FolderService,
    ai: AiProvider,
    config: Config,
    log: Logger,
    private readonly onChange: () => Promise<void>,
  ) {
    this.deps = { store, folders, ai, config, log };
  }

  /** Runs a write under the process lock and refreshes counters and the main file afterwards. */
  write<T>(fn: () => Promise<T>): Promise<T> {
    return this.lock.run(async () => {
      const result = await fn();
      await this.folders.recount();
      await this.onChange();
      return result;
    });
  }

  /** Enrichment without saving (preview.ts): folder tree + top-3 similar folders go to the model. */
  preview(text: string, projectHint?: string | null): Promise<Preview> {
    return previewText(this.deps, text, projectHint);
  }

  save(input: SaveInput): Promise<SaveResult> {
    return this.write(async () => {
      if (input.preview) {
        const e = normalizeEnrichment(input.preview.enrichment);
        return saveEnrichment(this.deps, e, input.preview.text.trim(), input.source);
      }
      if (!input.text?.trim()) throw new PreferenceError('Нужен text или preview', 400);
      const p = await this.preview(input.text, input.projectHint);
      const e = withExplicit(p.enrichment, input.explicit);
      return saveEnrichment(this.deps, e, p.text, input.source);
    });
  }

  get(id: string): Promise<PreferencePayload> {
    return getOrThrow(this.deps, id);
  }

  /** Manual edit (update.ts). */
  update(id: string, patch: PreferencePatch): Promise<PreferencePayload> {
    return this.write(() => updatePreference(this.deps, id, patch));
  }

  remove(id: string): Promise<void> {
    return this.write(async () => {
      await this.get(id);
      await this.deps.store.deletePreferences([id]);
    });
  }

  search = (query: string, filter: PreferenceFilter, topK: number) =>
    q.search(this.deps, query, filter, topK);
  list = (filter: PreferenceFilter, opts: ListOptions = {}) => q.list(this.deps, filter, opts);
  all = (filter: PreferenceFilter = {}) => q.all(this.deps, filter);
  count = (filter: PreferenceFilter = {}) => q.count(this.deps, filter);
  facets = (filter: PreferenceFilter = {}) => q.facets(this.deps, filter);
  stats = () => q.stats(this.deps);

  /** Paged by id, for large folders (MCP get_folder). */
  page(filter: PreferenceFilter, limit: number, cursor: string | null) {
    return this.deps.store.scrollPreferences(buildPreferenceFilter(filter), { limit, cursor });
  }
}
