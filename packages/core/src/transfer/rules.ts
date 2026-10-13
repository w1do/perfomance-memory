/** Запись правил импорта: строки с папками, пересчёт эмбеддингов при смене регистра папки, батчи upsert. */
import type { FolderPayload, PreferencePayload } from '../types.js';
import type { PrefDeps } from '../preferences/deps.js';
import { buildPayload, embeddingText } from '../preferences/payload.js';
import { bm25Document } from '../text/bm25.js';
import { EMBED_BATCH, embedBatches, errorMessage } from './embed.js';
import type { ImportReport } from './format.js';
import { pathKey, prefixes } from './keys.js';
import type { Prepared, WriteState } from './types.js';

function buildRuleRows(toCreate: Prepared[], byKey: Map<string, FolderPayload>, now: string) {
  return toCreate.map((x) => {
    const folder = byKey.get(pathKey(x.rule.enrichment.folder_path));
    if (!folder) throw new Error('папка правила не найдена после планирования');
    const payload: PreferencePayload = {
      ...buildPayload({
        enrichment: x.rule.enrichment,
        folder,
        rawText: x.rule.rawText,
        source: 'import',
        now,
      }),
      history: x.rule.history,
    };
    return { payload, text: embeddingText(payload), dense: x.dense as number[] | null, prep: x };
  });
}

export async function writeRules(
  deps: PrefDeps,
  toCreate: Prepared[],
  byKey: Map<string, FolderPayload>,
  now: string,
  report: ImportReport,
  st: WriteState,
): Promise<void> {
  const rows = buildRuleRows(toCreate, byKey, now);
  // эмбеддинг зависит от регистра папки получателя: при расхождении пересчитываем
  const stale = rows.filter((r) => r.text !== r.prep.text);
  const fresh = await embedBatches(
    deps,
    stale.map((r) => r.text),
  );
  stale.forEach((r, i) => {
    r.dense = fresh[i] ?? null;
  });
  const ready: { payload: PreferencePayload; text: string; dense: number[] }[] = [];
  let failedEmbeds = 0;
  for (const r of rows) {
    if (r.dense) ready.push({ payload: r.payload, text: r.text, dense: r.dense });
    else {
      failedEmbeds++;
      report.errors++;
      st.settled++;
    }
  }
  if (failedEmbeds > 0) {
    report.messages.push(
      `Не удалось посчитать эмбеддинги для ${failedEmbeds} правил — повторите импорт позже`,
    );
  }
  for (let i = 0; i < ready.length; i += EMBED_BATCH) {
    const chunk = ready.slice(i, i + EMBED_BATCH);
    try {
      await deps.store.upsertPreferences(
        chunk.map((x) => ({ payload: x.payload, dense: x.dense, sparse: bm25Document(x.text) })),
      );
      report.rules_created += chunk.length;
      for (const x of chunk) {
        prefixes(x.payload.folder_path).forEach((pre) => st.keep.add(pathKey(pre)));
      }
    } catch (err) {
      deps.log.warn({ err: errorMessage(err), size: chunk.length }, 'import rules write failed');
      report.errors += chunk.length;
      report.messages.push(`Не удалось сохранить ${chunk.length} правил`);
    }
    st.settled += chunk.length;
  }
}
