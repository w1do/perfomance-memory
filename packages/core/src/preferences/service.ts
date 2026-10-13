/**
 * Сервис правил: превью (обогащение без сохранения), сохранение, ручная правка, удаление и чтение.
 * Обогащение и эмбеддинг идут вне замка, поиск дубля и запись — под мьютексом процесса; счётчики папок и
 * PREFERENCES.md обновляются коалесцированно (refresh.ts).
 * Логика вынесена: save.ts (конвейер), draft.ts (черновик), conflict.ts, query.ts, schemas.ts.
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
import { prepareDraft, type Draft } from './draft.js';
import { normalizeEnrichment } from './normalize.js';
import { previewText } from './preview.js';
import { withExplicit } from './rationale.js';
import { CoalescedRefresh } from './refresh.js';
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
  private readonly refresh: CoalescedRefresh;

  constructor(
    store: Store,
    folders: FolderService,
    ai: AiProvider,
    config: Config,
    log: Logger,
    onChange: () => Promise<void>,
  ) {
    this.deps = { store, folders, ai, config, log };
    this.refresh = new CoalescedRefresh(async () => {
      await folders.recount();
      await onChange();
    }, log);
  }

  /**
   * Запись под замком процесса. Счётчики папок и PREFERENCES.md обновляются коалесцированно вне замка;
   * промис резолвится после обновления, которое уже видит эту запись.
   */
  async write<T>(fn: () => Promise<T>): Promise<T> {
    let refreshed: Promise<void> = Promise.resolve();
    const result = await this.lock.run(async () => {
      const r = await fn();
      refreshed = this.refresh.request();
      return r;
    });
    await refreshed;
    return result;
  }

  /**
   * Graceful shutdown: ждёт записи в очереди замка и последнее обновление счётчиков и PREFERENCES.md.
   * save() в фазе подготовки (превью, эмбеддинг — вне замка) не ждёт: хранилище она ещё не трогала,
   * обрыв на process.exit не оставляет частичной записи — правило просто не сохранится.
   */
  async drain(): Promise<void> {
    await this.lock.run(async () => undefined);
    await this.refresh.drain();
  }

  /** Enrichment without saving (preview.ts): folder tree + top-3 similar folders go to the model. */
  preview(text: string, projectHint?: string | null): Promise<Preview> {
    return previewText(this.deps, text, projectHint);
  }

  /** Обогащение и эмбеддинг — вне замка (параллельно); поиск дубля/конфликта и запись — под замком. */
  async save(input: SaveInput): Promise<SaveResult> {
    const draft = await this.draft(input);
    return this.write(() => saveEnrichment(this.deps, draft, input.source));
  }

  private async draft(input: SaveInput): Promise<Draft> {
    if (input.preview) {
      const e = normalizeEnrichment(input.preview.enrichment);
      return prepareDraft(this.deps, e, input.preview.text.trim());
    }
    if (!input.text?.trim()) throw new PreferenceError('Нужен text или preview', 400);
    const p = await this.preview(input.text, input.projectHint);
    return prepareDraft(this.deps, withExplicit(p.enrichment, input.explicit), p.text);
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
