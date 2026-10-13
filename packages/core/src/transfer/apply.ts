/** Применение импорта: разбор и выбор, эмбеддинги вне замка, затем запись под замком (write.ts). Без LLM. */
import type { PrefDeps } from '../preferences/deps.js';
import { embeddingText } from '../preferences/payload.js';
import { embedBatches } from './embed.js';
import type { ImportReport, ImportSelection } from './format.js';
import { parsePackage } from './parse.js';
import { selectPackage } from './select.js';
import type { Prepared } from './types.js';
import { writeImport } from './write.js';

export type Write = <T>(fn: () => Promise<T>) => Promise<T>;

export async function applyImport(
  deps: PrefDeps,
  write: Write,
  raw: unknown,
  sel: ImportSelection,
): Promise<ImportReport> {
  // ошибки формата и выбора бросаются до любой записи
  const p = selectPackage(parsePackage(raw), sel);
  const texts = p.rules.map((r) => embeddingText(r.enrichment));
  const vectors = await embedBatches(deps, texts);
  const report: ImportReport = {
    rules_total: p.rules.length + p.invalid,
    rules_created: 0,
    folders_created: 0,
    duplicates: 0,
    conflicts: 0,
    errors: p.invalid,
    messages: [...p.errors],
  };
  const prepared: Prepared[] = [];
  p.rules.forEach((rule, i) => {
    const dense = vectors[i];
    if (dense) prepared.push({ rule, text: texts[i] ?? '', dense });
    else report.errors++;
  });
  const missing = p.rules.length - prepared.length;
  if (missing > 0) {
    report.messages.push(
      `Не удалось посчитать эмбеддинги для ${missing} правил — повторите импорт позже`,
    );
  }
  return write(() => writeImport(deps, p, prepared, report));
}
