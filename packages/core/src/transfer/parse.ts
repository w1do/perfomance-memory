/** Разбор недоверенного пакета: формат, версия, папки (каркас), правила (с пропуском битых) и выбор поддерева. */
import { sanitizePath } from '../folders/tree.js';
import { EnrichmentError, normalizeEnrichment } from '../preferences/normalize.js';
import { PreferenceError } from '../preferences/schemas.js';
import { domainSchema, folderPathSchema, type Enrichment, type HistoryEntry } from '../types.js';
import {
  SCHEMA_FORMAT,
  SCHEMA_VERSION,
  packageFolderSchema,
  packagePreferenceSchema,
  packageSchema,
  type PackageHeader,
} from './format.js';
import { pathKey, rawPathKey } from './keys.js';

export { selectPackage } from './select.js';

export interface ParsedFolder {
  path: string[];
  key: string;
  domain: string | null;
  description: string | null;
}

export interface ParsedRule {
  /** позиция в массиве preferences пакета */
  index: number;
  key: string;
  enrichment: Enrichment;
  rawText: string;
  history: HistoryEntry[];
}

/** Пропущенное правило: ключ папки по сырому folder_path (null, если путь не читается) и сообщение. */
export interface InvalidRule {
  key: string | null;
  message: string;
}

export interface ParsedPackage {
  header: PackageHeader;
  folders: ParsedFolder[];
  rules: ParsedRule[];
  /** до 20 сообщений о пропущенных правилах */
  errors: string[];
  /** число пропущенных правил (все, не только в errors) */
  invalid: number;
  /** все пропущенные правила: по ним выбор отбирает ошибки своего поддерева */
  invalidRules: InvalidRule[];
}

const NOT_A_PACKAGE = 'Файл не похож на пакет схемы предпочтений';
const MAX_ERRORS = 20;

function checkEnvelope(raw: unknown): void {
  const obj = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : null;
  if (!obj || (obj as { format?: unknown }).format !== SCHEMA_FORMAT) {
    throw new PreferenceError(NOT_A_PACKAGE, 400);
  }
  const version = (obj as { version?: unknown }).version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new PreferenceError(NOT_A_PACKAGE, 400);
  }
  if (version > SCHEMA_VERSION) {
    throw new PreferenceError(
      `Пакет версии ${version} сделан более новой версией сервиса — обновите сервис`,
      400,
    );
  }
}

function parseFolders(raw: unknown[]): ParsedFolder[] {
  const folders: ParsedFolder[] = [];
  const seen = new Set<string>();
  raw.forEach((item, i) => {
    const fail = () => new PreferenceError(`Неверный пакет: папка #${i + 1}`, 400);
    const f = packageFolderSchema.safeParse(item);
    if (!f.success) throw fail();
    const path = sanitizePath(f.data.path);
    if (!folderPathSchema.safeParse(path).success) throw fail();
    const key = pathKey(path);
    if (seen.has(key)) return;
    seen.add(key);
    const domain = f.data.domain ? domainSchema.safeParse(f.data.domain) : null;
    folders.push({
      path,
      key,
      domain: domain?.success ? domain.data : null,
      description: f.data.description,
    });
  });
  return folders;
}

export function parsePackage(raw: unknown): ParsedPackage {
  checkEnvelope(raw);
  const head = packageSchema.safeParse(raw);
  if (!head.success) {
    const issue = head.error.issues[0];
    throw new PreferenceError(
      `Неверный пакет: поле «${issue?.path.join('.') ?? ''}» — ${issue?.message ?? ''}`,
      400,
    );
  }
  const d = head.data;
  const folders = parseFolders(d.folders);
  const rules: ParsedRule[] = [];
  const invalidRules: InvalidRule[] = [];
  const fail = (item: unknown, message: string) =>
    invalidRules.push({ key: rawPathKey(item), message });
  d.preferences.forEach((item, i) => {
    const data = packagePreferenceSchema.safeParse(item);
    if (!data.success) {
      const issue = data.error.issues[0];
      fail(
        item,
        `Правило #${i + 1}: поле «${issue?.path.join('.') ?? ''}» — ${issue?.message ?? ''}`,
      );
      return;
    }
    try {
      const enrichment = normalizeEnrichment({ ...data.data, kind: 'preference' });
      rules.push({
        index: i,
        key: pathKey(enrichment.folder_path),
        enrichment,
        rawText: data.data.raw_text.trim() || enrichment.statement,
        history: data.data.history,
      });
    } catch (err) {
      if (!(err instanceof EnrichmentError)) throw err;
      fail(item, `Правило #${i + 1}: ${err.message}`);
    }
  });
  const header: PackageHeader = {
    format: SCHEMA_FORMAT,
    version: d.version,
    name: d.name,
    author: d.author,
    description: d.description,
    exported_at: d.exported_at,
  };
  const errors = invalidRules.slice(0, MAX_ERRORS).map((r) => r.message);
  return { header, folders, rules, errors, invalid: invalidRules.length, invalidRules };
}
