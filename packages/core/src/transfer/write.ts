/**
 * Запись импорта под замком записи: папки, правила, уборка сирот. Функция не бросает наружу:
 * ошибки уходят в отчёт, иначе PreferenceService.write не запросит обновление счётчиков и PREFERENCES.md.
 */
import type { PrefDeps } from '../preferences/deps.js';
import { dedupeRules } from './dedup.js';
import { errorMessage } from './embed.js';
import { dropFolders, planFolders, removeOrphans, writeFolders } from './folders.js';
import type { ImportReport } from './format.js';
import { pathKey, prefixes, underAny } from './keys.js';
import type { ParsedPackage } from './parse.js';
import { writeRules } from './rules.js';
import type { Prepared, WriteState } from './types.js';

const MAX_MESSAGES = 20;
const LEFTOVER_FOLDERS =
  'Не удалось убрать созданные пустые папки — они могли остаться, удалите их вручную';

export async function writeImport(
  deps: PrefDeps,
  p: ParsedPackage,
  prepared: Prepared[],
  report: ImportReport,
): Promise<ImportReport> {
  const st: WriteState = {
    total: prepared.length,
    settled: 0,
    created: [],
    keep: new Set(),
    leftover: false,
  };
  try {
    await applyRules(deps, p, prepared, report, st);
  } catch (err) {
    deps.log.error({ err: errorMessage(err) }, 'schema import failed');
    report.messages.push('Импорт прерван: ошибка хранилища');
    report.errors += st.total - st.settled;
  }
  await removeOrphans(deps, st, report);
  // сообщение об остатках папок всегда попадает в отчёт, даже при полном списке ошибок
  const extra = st.leftover ? [LEFTOVER_FOLDERS] : [];
  report.messages = [...report.messages.slice(0, MAX_MESSAGES - extra.length), ...extra];
  deps.log.info({ ...report, messages: undefined }, 'schema imported');
  return report;
}

async function applyRules(
  deps: PrefDeps,
  p: ParsedPackage,
  prepared: Prepared[],
  report: ImportReport,
  st: WriteState,
): Promise<void> {
  const toCreate = await dedupeRules(deps, prepared, report, st);
  const now = new Date().toISOString();
  // пустые папки пакета создаются, даже если в них нет правил
  const keepEmpty = p.folders.filter((f) => !p.rules.some((r) => underAny(r.key, [f.key])));
  for (const f of keepEmpty) prefixes(f.path).forEach((pre) => st.keep.add(pathKey(pre)));
  const meta = new Map(
    p.folders.map((f) => [f.key, { domain: f.domain, description: f.description }]),
  );
  const wanted = [
    ...toCreate.map((x) => ({
      path: x.rule.enrichment.folder_path,
      domain: x.rule.enrichment.domain,
    })),
    ...keepEmpty.map((f) => ({ path: f.path, domain: f.domain })),
  ];
  const { byKey, created } = planFolders(await deps.folders.list(), wanted, meta);
  try {
    await writeFolders(deps, created);
  } catch (err) {
    deps.log.warn({ err: errorMessage(err) }, 'import folders failed');
    const cleaned = await dropFolders(
      deps,
      created.map((f) => f.id),
    );
    if (!cleaned) st.leftover = true;
    report.errors += toCreate.length;
    st.settled += toCreate.length;
    report.messages.push('Не удалось создать папки — правила не импортированы');
    return;
  }
  st.created = created;
  report.folders_created = created.length;
  await writeRules(deps, toCreate, byKey, now, report, st);
}
