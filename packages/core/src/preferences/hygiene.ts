/**
 * Гигиена памяти: поиск и слияние дублей, пометка «не дубли», приведение applies_to к словарю.
 * Записи идут через write() сервиса правил — под тем же замком, со счётчиками папок и пересборкой PREFERENCES.md.
 */
import { buildPreferenceFilter } from '../qdrant/filters.js';
import { bm25Document } from '../text/bm25.js';
import type { PreferencePayload } from '../types.js';
import { upsertWithVectors, type PrefDeps } from './deps.js';
import { findDuplicates } from './duplicates.js';
import { cleanTags, splitTargets } from './guards.js';
import { mergeRules } from './merge.js';
import { embeddingText } from './payload.js';
import { PreferenceError } from './schemas.js';

type Write = <T>(fn: () => Promise<T>) => Promise<T>;

export class HygieneService {
  constructor(
    private readonly deps: PrefDeps,
    private readonly write: Write,
  ) {}

  duplicates = () => findDuplicates(this.deps);

  private async load(ids: string[]): Promise<PreferencePayload[]> {
    const found = await Promise.all(ids.map((id) => this.deps.store.getPreference(id)));
    if (found.some((p) => !p)) throw new PreferenceError('Правило не найдено', 404);
    return found as PreferencePayload[];
  }

  /** Оставляет keep, остальные сливает в него и удаляет. */
  merge(keep: string, remove: string[]): Promise<PreferencePayload> {
    return this.write(async () => {
      const ids = [...new Set(remove)].filter((id) => id !== keep);
      if (!ids.length) throw new PreferenceError('Нечего сливать', 400);
      const [target, ...others] = await this.load([keep, ...ids]);
      const merged = mergeRules(target as PreferencePayload, others, new Date().toISOString());
      await upsertWithVectors(this.deps, merged);
      await this.deps.store.deletePreferences(ids);
      this.deps.log.info({ keep, merged: ids.length }, 'duplicates merged');
      return merged;
    });
  }

  /** «Не дубли»: правила группы запоминают друг друга и больше не предлагаются к слиянию. */
  distinct(ids: string[]): Promise<void> {
    return this.write(async () => {
      const unique = [...new Set(ids)];
      if (unique.length < 2) throw new PreferenceError('Нужно минимум два правила', 400);
      for (const p of await this.load(unique)) {
        const others = unique.filter((id) => id !== p.id);
        const distinct_from = [...new Set([...p.distinct_from, ...others])];
        await this.deps.store.setPreferencePayload(p.id, { distinct_from });
      }
    });
  }

  /**
   * При старте: applies_to — только цели из словаря, me/any_ai убираются, прочее (файлы, пакеты, классы)
   * переезжает в теги. Идемпотентно; векторы пересчитываются одним запросом, т. к. теги входят в эмбеддинг.
   */
  async normalizeTargets(): Promise<number> {
    const all = await this.deps.store.allPreferences(
      buildPreferenceFilter({ include_inactive: true }),
    );
    const changed: PreferencePayload[] = [];
    for (const p of all) {
      const { targets, extra } = splitTargets(p.applies_to);
      if (JSON.stringify(targets) === JSON.stringify(p.applies_to)) continue;
      const tags = cleanTags([...new Set([...p.tags, ...extra])]).slice(0, 7);
      changed.push({ ...p, applies_to: targets, tags });
    }
    if (!changed.length) return 0;
    const texts = changed.map(embeddingText);
    const dense = await this.deps.ai.embed(texts);
    await this.deps.store.upsertPreferences(
      changed.map((payload, i) => ({
        payload,
        dense: dense[i] as number[],
        sparse: bm25Document(texts[i] as string),
      })),
    );
    this.deps.log.info({ changed: changed.length }, 'applies_to normalized to the dictionary');
    return changed.length;
  }
}
