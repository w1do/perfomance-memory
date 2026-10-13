# OpenSpec: export-import-schema

Экспорт и импорт «схемы» предпочтений: автор выбирает папки/проекты (или «всё») и скачивает JSON-пакет;
другой пользователь загружает пакет, видит предпросмотр с деревом и счётчиками, применяет — папки и правила
ложатся в его Qdrant, дубли пропускаются.

## Open questions

Нет. Ниже всё решено. Решения, которые расходятся с буквой PROMPT.md, перечислены в §11 с обоснованием
(значение `source = "import"`). Если Implementer видит противоречие — остановиться и эскалировать, не перепроектировать.

---

## 1. Problem statement

Память предпочтений нельзя перенести: нет способа выгрузить часть дерева и загрузить её в другой экземпляр
сервиса. Автор (блогер) хочет делиться «схемой» — папками и правилами — с аудиторией.

## 2. Goals and non-goals

Цели:
- G1. Экспорт: выбор папок галочками (родитель включает вложенные) или «всё» → JSON-пакет без векторов.
- G2. Импорт: загрузка файла → предпросмотр (дерево пакета с галочками, счётчики, дубли) → «Применить».
- G3. Слияние: папки сливаются по пути (без учёта регистра и ё/е, как `sameName`), дубли не создаются,
  повторный импорт того же файла ничего не добавляет.
- G4. Импорт не вызывает LLM; только эмбеддинги (dense) моделью получателя, батчами по 64.
- G5. После импорта счётчики папок и `PREFERENCES.md` пересчитываются тем же путём, что после обычной записи
  (`PreferenceService.write()` → `CoalescedRefresh`).
- G6. Частичный сбой не оставляет пустых папок, созданных этим импортом, и не ломает счётчики.

Не цели:
- Снапшот Qdrant, перенос векторов, перенос id.
- MCP-инструмент для экспорта/импорта (решение и обоснование — §8.4).
- LLM-проверка конфликтов при импорте, слияние импортированного правила с существующим (дубль просто пропускается).
- Семантический поиск дублей внутри самого пакета (только дословный, §6.5).
- Новые переменные окружения, миграции, CLI.
- Изменение README/CHANGELOG (их синхронизирует Documenter после APPROVED).

## 3. Current architecture analysis

- `packages/core` — вся логика. `createCore()` (`src/core.ts`) собирает `Store`, `FolderService`,
  `PreferenceService`, `HygieneService`. Запись в хранилище идёт через `PreferenceService.write(fn)`: мьютекс
  процесса (`preferences/mutex.ts`) + после `fn` — `CoalescedRefresh.request()` (`folders.recount()` и
  `rebuildMainFile()`); промис `write()` резолвится после обновления, которое видит запись. **Если `fn`
  бросает, обновление не запрашивается** — поэтому функция импорта под замком не должна бросать после первой
  записи (§6.8).
- `HygieneService` получает `(fn) => prefs.write(fn)` — тот же паттерн повторяем для `TransferService`.
- Обычное сохранение: `save.ts` → `findConflict()` (`conflict.ts`): гибридный поиск в Qdrant + косинус →
  **решение LLM** (`decideConflict`). Для импорта LLM запрещён (prompt-injection, стоимость), поэтому
  переиспользуем первую половину механизма: `store.hybrid(..., { withDense: true })` + `cosine()` из
  `conflict.ts`, `bm25Query`, `buildPreferenceFilter`, порог строже (§6.5).
- `preferences/duplicates.ts` (гигиена) — кластеризация + LLM-подтверждение; при импорте не вызывается, но
  остаётся способом добрать «похожие по смыслу» дубли после импорта.
- Нормализация входа: `normalizeEnrichment()` (`preferences/normalize.ts`) без `sourceText` — чистит теги,
  канонизирует `applies_to` (`guardTargets`/`splitTargets`), добавляет лист «Люблю/Не люблю»
  (`withPolarityLeaf`), валидирует `constraints`, уровень (`rationale`). Переиспользуем как есть.
- Payload правила: `buildPayload()` + `folderFields()` (`preferences/payload.ts`): новый `randomUUID`,
  `folder_ancestors`, `folder_depth`, `constraint_metrics`, `strength` из уровня. `embeddingText()` — текст
  для dense и BM25.
- Папки: `FolderService.ensurePath()` создаёт недостающие уровни, но вызывает `list()` на каждый путь и не умеет
  описание. `newFolder()` — приватный. Для батч-создания выносим построение payload папки в чистую функцию
  `newFolderPayload()` (§6.6, §16 шаг 2).
- Переиндексация (`qdrant/reindex.ts`) уже эмбеддит батчами по 64 — тот же размер батча.
- API: Fastify, `bodyLimit` 1 МиБ глобально, JSON-парсер Fastify (secure-json-parse: `__proto__`/`constructor`
  → 400). Ошибки домена → `errors.ts` (`PreferenceError`/`FolderError` → их статус, `ZodError` → 400).
  Все `/api/*` кроме входа закрыты сессией (`auth.ts`). nginx: `client_max_body_size 210m` для `/api/`.
- Web: `lib/api.ts` — единственный адаптер (`request()`), после не-GET шлёт `CHANGE_EVENT`.
  Дерево: `components/FolderTree.tsx` (сайдбар: PREFERENCES.md, «Все правила», темы, «Проекты»),
  `components/folders/TreeNode.tsx` (раскрытие, DnD, hover-действия). Модалки: `components/Modal.tsx`
  (`footer`), образец чекбоксов — `hygiene/PlacementModal.tsx`. Иконки — только `Icon` + `lib/assets.ts`
  (`IconName`), файлы в `assets/icons/*.svg`, учёт в `assets/manifest.json`. Иконка `download` есть, `upload` нет.
- Тесты: core — vitest с реальным Qdrant (`test/qdrant-global-setup.ts`), `testCore()` + `FakeAi`
  (`hashEmbed` — мешок основ слов: перестановка слов даёт тот же вектор). API — `apps/api/test/setup.ts`
  (`makeApp`, `login`). Web-тестов в репозитории нет.

## 4. Relevant files and symbols

| Файл | Символы | Роль в изменении |
|---|---|---|
| `packages/core/src/core.ts` | `createCore` | подключить `TransferService` |
| `packages/core/src/index.ts` | экспорты | экспортировать transfer API |
| `packages/core/src/types.ts` | `sourceSchema` | добавить `'import'` |
| `packages/core/src/folders/tree.ts` | `sameName`, `joinPath`, `splitPath`, `sanitizePath` | вынести `normName`; остальные переиспользуются в `parse.ts` и `export.ts` |
| `packages/core/src/types.ts` | `domainSchema`, `folderPathSchema`, `polaritySchema`, `constraintSchema` | переиспользуются в `format.ts` и `parse.ts` |
| `packages/core/src/folders/service.ts` | `FolderService.newFolder` | делегировать в `newFolderPayload` |
| `packages/core/src/preferences/payload.ts` | `buildPayload`, `embeddingText`, `folderFields` | переиспользуются |
| `packages/core/src/preferences/normalize.ts` | `normalizeEnrichment`, `EnrichmentError` | переиспользуются |
| `packages/core/src/preferences/conflict.ts` | `cosine` | переиспользуется |
| `packages/core/src/preferences/deps.ts` | `PrefDeps` | тип зависимостей |
| `packages/core/src/preferences/schemas.ts` | `PreferenceError` | ошибки с HTTP-статусом |
| `packages/core/src/qdrant/store.ts` | `allPreferences`, `hybrid`, `upsertPreferences`, `upsertFolders`, `deleteFolders` | без изменений |
| `packages/core/src/qdrant/filters.ts` | `buildPreferenceFilter` | без изменений |
| `packages/core/src/text/bm25.ts` | `bm25Document`, `bm25Query` | без изменений |
| `apps/api/src/server.ts` | `buildServer` | зарегистрировать маршруты |
| `apps/api/src/query.ts` | `filterQuerySchema.source` | добавить `'import'` |
| `apps/web/src/lib/api.ts` | `api` | 3 метода |
| `apps/web/src/lib/types.ts` | `Preference.source` | добавить `'import'` |
| `apps/web/src/lib/assets.ts` | `IconName` | добавить `'upload'` |
| `apps/web/src/components/FolderTree.tsx` | `FolderTree` | вставить `SchemaActions` |

Чужие незакоммиченные правки (`save.ts`, `service.ts`, `refresh.ts`, `draft.ts`, `main.ts`, `vitest.config.ts`,
README, CHANGELOG, тесты parallel-save/refresh) **не трогать**. Это изменение их не требует: `prefs.write()` уже
публичный.

## 5. Proposed architecture

Новый модуль `packages/core/src/transfer/` (одна ответственность на файл):

| Файл | Ответственность | ~строк |
|---|---|---|
| `format.ts` | константы формата и лимитов, zod-схемы пакета, входов экспорта и выбора импорта | 100 |
| `types.ts` | типы пакета и отчёта (`PackageFolder`, `PackagePreference`, `PackageHeader`, `SchemaPackage`, `ImportReport`) | 45 |
| `keys.ts` | `pathKey`, `statementKey`, `prefixes`, `underAny` | 30 |
| `export.ts` | `buildSchemaPackage()` — сборка пакета из выбранного поддерева | 95 |
| `parse.ts` | `parsePackage()`, `selectPackage()` — валидация недоверенного пакета и выбор | 135 |
| `dedup.ts` | `ExactIndex`, `semanticDuplicate()`, `IMPORT_DUPLICATE_SCORE` | 70 |
| `folders.ts` | `planFolders()` — слияние путей с существующим деревом, без записи | 55 |
| `tree.ts` | `buildImportTree()` — дерево предпросмотра со счётчиками | 75 |
| `preview.ts` | `previewImport()` — предпросмотр без OpenAI и без записи | 50 |
| `embed.ts` | `embedBatches()` — эмбеддинги батчами, упавший батч не валит остальные | 40 |
| `apply.ts` | `applyImport()` — эмбеддинги вне замка, затем `write(writeImport)` | 50 |
| `write.ts` | `writeImport()` — под замком: дедуп, папки, upsert, уборка сирот, отчёт | 145 |
| `service.ts` | `TransferService` — фасад для api | 30 |

Плюс `packages/core/src/folders/payload.ts` — `newFolderPayload()` (чистая функция, ~25 строк).

API: `apps/api/src/routes/transfer.ts` — три тонких маршрута.
Web: `components/schema/*` — кнопки «Экспорт»/«Импорт» в сайдбаре дерева и две модалки со своим деревом-чекбоксами.

Почему чекбоксы не в сайдбаре: строки сайдбара уже несут выбор папки, DnD и hover-кнопки; чекбоксы там смешают
режимы и потребуют глобального «режима выбора». Отдельное дерево в модалке переиспользуется для экспорта (своё
дерево) и импорта (дерево пакета) одним компонентом `CheckTree`.

## 6. Detailed design

### 6.1 Формат файла (версия 1)

```json
{
  "format": "preference-memory/schema",
  "version": 1,
  "name": "Схема Ивана: код и ИИ",
  "author": "Иван",
  "description": "Мои правила для Claude Code",
  "exported_at": "2026-10-13T10:00:00.000Z",
  "counts": { "folders": 3, "preferences": 1 },
  "folders": [
    { "path": ["Программирование"], "domain": "programming", "description": null },
    { "path": ["Программирование", "Код"], "domain": "programming", "description": "Стиль кода" },
    { "path": ["Программирование", "Код", "Не люблю"], "domain": "programming", "description": null }
  ],
  "preferences": [
    {
      "statement": "Файлы с кодом длиннее 100 строк",
      "details": null,
      "raw_text": "не люблю файлы с кодом больше 100 строк",
      "polarity": "dislike",
      "domain": "programming",
      "project": null,
      "applies_to": [],
      "tags": ["код", "размер файла"],
      "constraints": [{ "metric": "file_lines", "operator": "<=", "value": 100, "unit": "lines" }],
      "level": "hard",
      "why": null,
      "example_good": null,
      "example_bad": null,
      "language": "ru",
      "folder_path": ["Программирование", "Код", "Не люблю"],
      "history": []
    }
  ]
}
```

Не входит в файл: `id`, `folder_id`, `folder_name`, `folder_ancestors`, `folder_depth`, `constraint_metrics`,
`strength` (выводится из `level`), `source`, `is_active`, `distinct_from`, `created_at`, `updated_at`,
`preference_count`, векторы. При импорте эти поля, если есть в файле, отбрасываются (zod `object` по умолчанию
срезает неизвестные ключи) и вычисляются заново.

`counts` — справочно, при импорте не доверяется и не используется.

### 6.2 `transfer/format.ts` (точное содержимое схем)

```ts
export const SCHEMA_FORMAT = 'preference-memory/schema';
export const SCHEMA_VERSION = 1;
/** Лимит тела запросов импорта (маршруты api). Не env: это свойство формата, а не настройка развёртывания. */
export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const MAX_FOLDERS = 2000;
export const MAX_PREFERENCES = 5000;
export const MAX_HISTORY = 20;
export const MAX_RAW_TEXT = 4000;
```

Схемы (zod v4, импорт `z` из `'zod'`; `polaritySchema`, `constraintSchema` из `../types.js`, `levelSchema` из `../level.js`):

```ts
const nullableText = (max: number) =>
  z.string().trim().max(max).nullable().default(null)
    .transform((v) => (v ? v : null));

export const packageFolderSchema = z.object({
  path: z.array(z.string().max(80)).min(1).max(12),
  domain: z.string().trim().max(40).nullable().default(null),
  description: nullableText(300),
});

export const packageHistorySchema = z.object({
  statement: z.string().max(600),
  details: z.string().max(1200).nullable(),
  polarity: polaritySchema,
  folder_path: z.array(z.string().max(80)).max(12),
  strength: z.number().int().min(1).max(5),
  level: levelSchema.optional(),
  constraints: z.array(constraintSchema).max(10),
  raw_text: z.string().max(MAX_RAW_TEXT),
  changed_at: z.iso.datetime({ offset: true }),
  reason: z.string().max(400).nullable(),
});

export const packagePreferenceSchema = z.object({
  statement: z.string().trim().min(1).max(300),
  details: nullableText(600),
  raw_text: z.string().max(MAX_RAW_TEXT).default(''),
  polarity: polaritySchema,
  domain: z.string().trim().max(40),
  project: z.string().trim().max(80).nullable().default(null),
  applies_to: z.array(z.string().max(40)).max(12).default([]),
  tags: z.array(z.string().max(40)).max(12).default([]),
  constraints: z.array(z.unknown()).max(10).default([]),
  level: levelSchema.default('default'),
  why: nullableText(400),
  example_good: nullableText(400),
  example_bad: nullableText(400),
  language: z.string().trim().max(8).default('ru'),
  folder_path: z.array(z.string().max(80)).min(1).max(12),
  history: z.array(packageHistorySchema).max(MAX_HISTORY).default([]),
});

export const packageSchema = z.object({
  format: z.literal(SCHEMA_FORMAT),
  version: z.number().int().min(1).max(SCHEMA_VERSION),
  name: z.string().trim().min(1).max(120),
  author: nullableText(120),
  description: nullableText(2000),
  exported_at: z.iso.datetime({ offset: true }),
  folders: z.array(z.unknown()).max(MAX_FOLDERS),
  preferences: z.array(z.unknown()).max(MAX_PREFERENCES),
});

export const exportInputSchema = z.object({
  all: z.boolean().default(false),
  folder_ids: z.array(z.uuid()).max(MAX_FOLDERS).default([]),
  name: z.string().trim().min(1).max(120),
  author: nullableText(120),
  description: nullableText(2000),
});
export type ExportInput = z.infer<typeof exportInputSchema>;

export const importSelectionSchema = z.object({
  all: z.boolean().default(false),
  folders: z.array(z.string().trim().min(1).max(1200)).max(MAX_FOLDERS).default([]),
});
export type ImportSelection = z.infer<typeof importSelectionSchema>;
```

Типы (`transfer/types.ts`):

```ts
export type PackageFolder = z.output<typeof packageFolderSchema>;
export type PackagePreference = Omit<z.output<typeof packagePreferenceSchema>, 'constraints'> & {
  constraints: Constraint[];
};
export interface PackageHeader {
  format: typeof SCHEMA_FORMAT; version: number; name: string; author: string | null;
  description: string | null; exported_at: string;
}
export interface SchemaPackage extends PackageHeader {
  counts: { folders: number; preferences: number };
  folders: PackageFolder[];
  preferences: PackagePreference[];
}
export interface ImportReport {
  /** выбранных правил в пакете, включая невалидные */
  rules_total: number;
  rules_created: number;
  folders_created: number;
  duplicates: number;
  conflicts: number;
  errors: number;
  /** до 20 сообщений по-русски, без содержимого секретов */
  messages: string[];
}
```

Схемы и константы остаются в `format.ts`, а типы `PackageFolder`, `PackagePreference`, `PackageHeader`,
`SchemaPackage`, `ImportReport` сразу лежат в `transfer/types.ts` (оценка: `format.ts` ~100 строк, `types.ts` ~45),
чтобы ни один из файлов не превысил 150 строк (AC11). `index.ts` реэкспортирует типы из `types.ts`.

### 6.3 Экспорт (`transfer/export.ts`)

```ts
export async function buildSchemaPackage(deps: PrefDeps, input: ExportInput): Promise<SchemaPackage>
```

1. `all = await deps.folders.list()`; `byKey = new Map(all.map(f => [joinPath(f.path), f]))`.
2. Выбранные папки `S`:
   - `input.all` → `S = all`.
   - иначе: если `input.folder_ids.length === 0` → `throw new PreferenceError('Выберите папки для экспорта', 400)`.
     Каждый id ищется в `all`; нет → `throw new FolderError('Папка не найдена', 404)`.
     `S = all.filter(f => roots.some(r => f.id === r.id || f.ancestors.includes(joinPath(r.path))))`.
3. Папки-предки для связности пути: для каждой `f ∈ S` и каждого префикса `f.path.slice(0, i)` (i = 1..depth-1)
   добавить `byKey.get(joinPath(prefix))`, если его нет в `S`. Правила предков **не** экспортируются.
4. Правила: `deps.store.allPreferences(buildPreferenceFilter({}))` (только активные) → оставить те, у кого
   `folder_id ∈ ids(S)`.
5. Если папок > `MAX_FOLDERS` или правил > `MAX_PREFERENCES` →
   `throw new PreferenceError(\`Слишком большая выборка: правил ${n}, папок ${m}. Максимум ${MAX_PREFERENCES} и ${MAX_FOLDERS} — выберите меньше папок\`, 422)`.
6. Папки в пакете: `{ path, domain, description }`, сортировка `joinPath(a.path).localeCompare(joinPath(b.path), 'ru')`.
7. Правила: сортировка по `joinPath(folder_path)` (`localeCompare 'ru'`), затем `created_at`. Отображение:
   `{ statement, details, raw_text: p.raw_text.slice(0, MAX_RAW_TEXT), polarity, domain, project, applies_to,
   tags, constraints, level, why, example_good, example_bad, language, folder_path,
   history: p.history.slice(-MAX_HISTORY).map(h => ({ ...h, raw_text: h.raw_text.slice(0, MAX_RAW_TEXT) })) }`.
   Поля перечислять явно (не `...p`), чтобы id и служебные поля не утекли.
8. Шапка: `format: SCHEMA_FORMAT, version: SCHEMA_VERSION, name, author, description, exported_at: new Date().toISOString(), counts`.
9. `deps.log.info({ folders, preferences }, 'schema exported')`.

### 6.4 Разбор недоверенного пакета (`transfer/parse.ts`)

```ts
export interface ParsedFolder { path: string[]; key: string; domain: string | null; description: string | null }
export interface ParsedRule { index: number; key: string; enrichment: Enrichment; rawText: string; history: HistoryEntry[] }
export interface ParsedPackage { header: PackageHeader; folders: ParsedFolder[]; rules: ParsedRule[]; errors: string[]; invalid: number }
export function parsePackage(raw: unknown): ParsedPackage
export function selectPackage(p: ParsedPackage, sel: ImportSelection): ParsedPackage
```

`parsePackage`:
1. Если `raw` не объект (`typeof raw !== 'object' || raw === null || Array.isArray(raw)`) или
   `raw.format !== SCHEMA_FORMAT` → `PreferenceError('Файл не похож на пакет схемы предпочтений', 400)`.
2. `version`: не целое число ≥ 1 → то же сообщение; `version > SCHEMA_VERSION` →
   `PreferenceError(\`Пакет версии ${v} сделан более новой версией сервиса — обновите сервис\`, 400)`.
3. `packageSchema.safeParse(raw)`; ошибка → `PreferenceError(\`Неверный пакет: поле «${issue.path.join('.')}» — ${issue.message}\`, 400)`
   (первая issue).
4. Папки: для каждой `i`: `packageFolderSchema.safeParse`; затем `path = sanitizePath(data.path)`;
   `folderPathSchema.safeParse(path)`; `domain`: если не null — `domainSchema.safeParse` (неуспех → `null`).
   Любая ошибка папки → `PreferenceError(\`Неверный пакет: папка #${i + 1}\`, 400)` (папки — каркас, без них
   пакет не применить). Дубли по `key = pathKey(path)` — первая выигрывает.
5. Правила: для каждой `i` (ошибка правила **не** роняет пакет):
   - `packagePreferenceSchema.safeParse(item)`; неуспех → `invalid++`, сообщение
     `Правило #${i + 1}: поле «${path}» — ${message}` (в `errors` не больше 20 сообщений, `invalid` — все).
   - `normalizeEnrichment({ ...data, kind: 'preference' })` (без `opts`: `sourceText` не передаётся, LLM нет);
     `EnrichmentError` → `invalid++`, `Правило #${i + 1}: ${err.message}`.
   - `rawText = data.raw_text.trim() || enrichment.statement`; `history = data.history` (тип совместим с
     `HistoryEntry`); `key = pathKey(enrichment.folder_path)`.
6. Никаких id из файла не читается.

`selectPackage`: `sel.all` → `p` без изменений. Иначе `keys = sel.folders.map(k => pathKey(splitPath(k)))`;
если `keys` пуст → `PreferenceError('Выберите папки для импорта', 400)`. Оставить папки и правила, у которых
`underAny(key, keys)`; `invalid`/`errors` не меняются.

### 6.5 Ключи и дубли (`transfer/keys.ts`, `transfer/dedup.ts`)

`keys.ts`:
```ts
export const pathKey = (path: string[]): string => path.map(normName).join('/');
/** Формулировка без регистра, ё/е, пунктуации и лишних пробелов. */
export const statementKey = (s: string): string =>
  s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const underAny = (key: string, roots: string[]): boolean =>
  roots.some((r) => key === r || key.startsWith(`${r}/`));
export const prefixes = (path: string[]): string[][] => path.map((_, i) => path.slice(0, i + 1));
```
`normName` — новый экспорт из `folders/tree.ts` (тот же код, что сейчас внутри `sameName`).

`dedup.ts`:
```ts
export type RuleStatus = 'new' | 'duplicate' | 'conflict';
/** Без подтверждения моделью порог строже CONFLICT_SCORE: ложный пропуск хуже лишнего правила, его доберёт «Гигиена». */
export const IMPORT_DUPLICATE_SCORE = 0.92;
type Key = Pick<Enrichment, 'statement' | 'polarity' | 'project'>;
export class ExactIndex {
  constructor(rules: Key[]);   // add() каждого
  classify(r: Key): RuleStatus; // та же полярность → duplicate; только противоположная → conflict; нет → new
  add(r: Key): void;
}
export async function semanticDuplicate(deps: PrefDeps, e: Enrichment, dense: number[], text: string): Promise<boolean>
```
- Ключ индекса: `${r.project ? normName(r.project) : ''}\u0000${statementKey(r.statement)}` → `Set<Polarity>`.
- `semanticDuplicate`: `filter = buildPreferenceFilter({ polarity: e.polarity, project: e.project ?? undefined })`;
  `hits = await deps.store.hybrid(dense, bm25Query(text), filter, 5, { withDense: true })`;
  `true`, если есть `h` с `sameProject(h.preference.project, e.project)` и `h.dense` и
  `cosine(dense, h.dense) >= IMPORT_DUPLICATE_SCORE`. `sameProject(a, b)`: оба null, или оба заданы и `sameName(a, b)`.
- «Конфликт» = та же формулировка и проект, противоположная полярность. Такое правило **пропускается** и
  считается в `conflicts`: правило получателя важнее чужого, а решить противоречие без LLM нельзя.

### 6.6 Папки (`folders/payload.ts`, `transfer/folders.ts`)

`folders/payload.ts`:
```ts
export function newFolderPayload(name: string, parent: FolderPayload | null,
  domain: string | null, description: string | null): FolderPayload
```
Тело — ровно текущее тело `FolderService.newFolder` (`randomUUID`, `path`, `ancestorsOf`, `depth`,
`preference_count: 0`, `created_at`). Список удаляемого (и больше ничего):
- приватный метод `FolderService.newFolder` в `folders/service.ts`;
- импорт `randomUUID` в этом же файле, если после удаления он нигде не используется (проверить `grep randomUUID`).

Остаётся: `ancestorsOf` (нужен `update()`), оба места вызова — меняются на `newFolderPayload(...)`.

`transfer/folders.ts`:
```ts
export interface FolderMeta { domain: string | null; description: string | null }
export interface WantedFolder { path: string[]; domain: string | null }
export function planFolders(existing: FolderPayload[], wanted: WantedFolder[],
  meta: Map<string, FolderMeta>): { byKey: Map<string, FolderPayload>; created: FolderPayload[] }
```
`byKey` = существующие по `pathKey(f.path)`. `wanted` по возрастанию длины пути; для каждого префикса без
записи в `byKey`: `parent = byKey.get(pathKey(prefix без последнего)) ?? null`; `name = prefix.at(-1)`;
`domain = (prefix.length === 1 && sameName(name, PROJECTS_ROOT)) ? 'project' : (meta.get(k)?.domain ?? w.domain)`;
`description = meta.get(k)?.description ?? null`; `newFolderPayload(...)` → в `byKey` и `created`. Чистая функция, без записи.

### 6.7 Предпросмотр (`transfer/tree.ts`, `transfer/preview.ts`)

```ts
export interface ImportItem { statement: string; polarity: Polarity; level: Level; status: RuleStatus }
export interface ImportNode { key: string; name: string; path: string[]; exists: boolean;
  total: number; skipped: number; items: ImportItem[]; children: ImportNode[] }
export function buildImportTree(folders: ParsedFolder[], rules: ParsedRule[], statuses: RuleStatus[],
  existingKeys: Set<string>): ImportNode[]
export interface ImportPreview {
  header: PackageHeader;
  counts: { folders: number; rules: number; new_folders: number; duplicates: number; conflicts: number; invalid: number };
  tree: ImportNode[];
  errors: string[];
}
export async function previewImport(deps: PrefDeps, raw: unknown): Promise<ImportPreview>
```
- `buildImportTree`: узлы по каждому префиксу путей папок и правил (`key = pathKey(prefix)`, `name` — сегмент из
  пакета, `exists = existingKeys.has(key)`); правило `i` → `items` узла своего `folder_path`;
  `total` = свои items + сумма детей; `skipped` = items со статусом ≠ `new` + сумма детей;
  дети сортируются `name.localeCompare(b.name, 'ru')`.
- `previewImport`: `p = parsePackage(raw)`; параллельно `deps.folders.list()` и
  `deps.store.allPreferences(buildPreferenceFilter({}))`; `index = new ExactIndex(existing)`; для каждого
  правила по порядку `status = index.classify(e)`, при `new` — `index.add(e)` (дубли внутри пакета);
  `counts.folders` = число узлов дерева, `new_folders` = узлы с `exists === false`.
- **OpenAI в предпросмотре не вызывается**: дубли считаются только дословно. Смысловые дубли (§6.5) находятся при
  применении. Причина: предпросмотр недоверенного файла не должен тратить деньги и время получателя.

### 6.8 Применение (`transfer/embed.ts`, `transfer/apply.ts`, `transfer/write.ts`)

`embed.ts`:
```ts
export const EMBED_BATCH = 64;
export async function embedBatches(deps: PrefDeps, texts: string[]): Promise<(number[] | null)[]>
```
Батчи по 64 через `deps.ai.embed(chunk)`; ошибка батча → `null` для его элементов,
`deps.log.warn({ err: message, from: i, size }, 'import embeddings failed')` (только `err.message`, без объекта
ошибки); после каждого батча `deps.log.info({ done, total }, 'import embeddings')`.

`apply.ts`:
```ts
type Write = <T>(fn: () => Promise<T>) => Promise<T>;
export async function applyImport(deps: PrefDeps, write: Write, raw: unknown, sel: ImportSelection): Promise<ImportReport>
```
1. `p = selectPackage(parsePackage(raw), sel)` — ошибки формата бросаются **до** любой записи (400).
2. `texts = p.rules.map(r => embeddingText(r.enrichment))`; `vectors = await embedBatches(deps, texts)` — **вне замка**.
3. `report = { rules_total: p.rules.length + p.invalid, rules_created: 0, folders_created: 0, duplicates: 0,
   conflicts: 0, errors: p.invalid, messages: [...p.errors] }`. Правила с `null`-вектором → `errors++`; если
   таких > 0 — сообщение `Не удалось посчитать эмбеддинги для ${n} правил — повторите импорт позже`.
4. `return write(() => writeImport(deps, p, prepared, report))`, где
   `prepared: { rule: ParsedRule; text: string; dense: number[] }[]`.

`write.ts` — `export async function writeImport(deps, p, prepared, report): Promise<ImportReport>`.
**Функция не бросает** (иначе `write()` не запросит обновление счётчиков): тело в `try/catch`, неожиданная ошибка →
уборка сирот + `errors += не записанные`, сообщение `Импорт прерван: ошибка хранилища`, `log.error({ err: message })`.
1. `existing = await deps.store.allPreferences(buildPreferenceFilter({}))`, `index = new ExactIndex(existing)`.
2. Проход 1 (последовательно): `status = index.classify(e)`; `new` → `index.add(e)`, кандидат;
   `duplicate` → `duplicates++`; `conflict` → `conflicts++`.
3. Проход 2: кандидаты пачками по 8 (`Promise.all`) → `semanticDuplicate(deps, e, dense, text)`;
   `true` → `duplicates++`, иначе в `toCreate`.
4. Папки: `wanted` = пути `toCreate` (`{ path: e.folder_path, domain: e.domain }`) ∪ «пустые папки пакета» —
   папки `p.folders`, под которыми (`underAny`) нет ни одного правила из `p.rules`
   (`{ path, domain }`); `meta` = `p.folders` по `key`. `{ byKey, created } = planFolders(await deps.folders.list(), wanted, meta)`.
5. Папки пишутся батчами по 64: `deps.ai.embed(chunk.map(folderEmbeddingText))` → `deps.store.upsertFolders(...)`.
   Ошибка → `deps.store.deleteFolders(created.map(f => f.id))` (best-effort, в `try/catch`), `errors += toCreate.length`,
   сообщение `Не удалось создать папки — правила не импортированы`, вернуть `report`.
   Успех → `folders_created = created.length`.
6. Правила: `folder = byKey.get(pathKey(e.folder_path))`; `payload = { ...buildPayload({ enrichment: e, folder,
   rawText, source: 'import', now }), history: rule.history }`; `finalText = embeddingText(payload)`.
   Если `finalText !== prep.text` (регистр папки получателя отличается) — пересчитать такие через `embedBatches`
   (`null` → `errors++`). Upsert батчами по 64: `deps.store.upsertPreferences(chunk.map(x => ({ payload, dense,
   sparse: bm25Document(finalText) })))`; ошибка батча → `errors += chunk.length`, сообщение
   `Не удалось сохранить ${n} правил`; успех → `rules_created += chunk.length`, ключи папок в `written`.
7. Уборка сирот (всегда, в `finally`): `keep` = все `pathKey(prefixes(path))` записанных правил и «пустых папок
   пакета»; `orphans = created.filter(f => !keep.has(pathKey(f.path)))`; если есть — `deleteFolders`
   (ошибка → `log.warn`), `folders_created -= orphans.length`.
8. `deps.log.info({ ...report без messages }, 'schema imported')`, вернуть `report`.

`preference_count` пересчитывается `folders.recount()` после `write()` — счётчики верны и при частичном сбое.
`messages` обрезаются до 20.

### 6.9 Фасад (`transfer/service.ts`) и подключение

```ts
type Write = <T>(fn: () => Promise<T>) => Promise<T>;
export class TransferService {
  constructor(private readonly deps: PrefDeps, private readonly write: Write) {}
  export(input: ExportInput): Promise<SchemaPackage> { return buildSchemaPackage(this.deps, input); }
  preview(raw: unknown): Promise<ImportPreview> { return previewImport(this.deps, raw); }
  apply(raw: unknown, sel: ImportSelection): Promise<ImportReport> { return applyImport(this.deps, this.write, raw, sel); }
}
```
`core.ts`: после `hygiene` —
`const transfer = new TransferService({ store, folders, ai, config, log: log.child({ module: 'transfer' }) }, (fn) => prefs.write(fn));`
и `transfer` в возвращаемом объекте (после `hygiene`).

## 7. Data-flow and control-flow

Экспорт: UI (галочки, имя) → `POST /api/export/schema` → `exportInputSchema` → `core.transfer.export` →
`folders.list` + `store.allPreferences` → JSON → браузер сохраняет файл (Blob, без сети).

Импорт, предпросмотр: UI читает файл (размер ≤ 9 МиБ, `JSON.parse` в try/catch) → `POST /api/import/schema/preview`
`{ package }` → `parsePackage` → дерево + дословные дубли. Записи нет, OpenAI нет.

Импорт, применение: UI (галочки по `node.key`) → `POST /api/import/schema/apply` `{ package, selection }` →
`parsePackage` + `selectPackage` → эмбеддинги батчами (вне замка) → `prefs.write(writeImport)`: дедуп
(дословно + гибридный поиск/косинус), папки (батч), правила (батч), уборка → отпускание замка →
`CoalescedRefresh`: `folders.recount()` + `PREFERENCES.md` → ответ `ImportReport`.

Параллельный импорт того же файла: второй ждёт замка и видит записи первого → всё дубли.

## 8. API, database, UI, domain changes

### 8.1 REST (`apps/api/src/routes/transfer.ts`)

```ts
const pkgBody = z.record(z.string(), z.unknown());
export function transferRoutes(app: FastifyInstance, core: Core): void {
  app.post('/api/export/schema', async (req) => core.transfer.export(exportInputSchema.parse(req.body)));
  app.post('/api/import/schema/preview', { bodyLimit: IMPORT_MAX_BYTES }, async (req) => {
    const body = z.object({ package: pkgBody }).parse(req.body);
    return core.transfer.preview(body.package);
  });
  app.post('/api/import/schema/apply', { bodyLimit: IMPORT_MAX_BYTES }, async (req) => {
    const body = z.object({ package: pkgBody, selection: importSelectionSchema }).parse(req.body);
    return core.transfer.apply(body.package, body.selection);
  });
}
```
`server.ts`: импорт и `transferRoutes(app, core);` после `hygieneRoutes`. Ответы: 200 JSON; 400 формат/версия/выбор;
404 неизвестная папка экспорта; 413 тело > 10 МиБ (Fastify); 422 слишком большая выборка; 401 без сессии.

### 8.2 База

Новых коллекций и индексов нет. `source` получает значение `'import'` (индекс keyword уже есть).
`types.ts`: `sourceSchema = z.enum(['voice', 'text', 'mcp', 'import'])`. `apps/api/src/query.ts`: тот же enum в
`filterQuerySchema.source`. `POST /api/preferences` по-прежнему принимает только `voice | text`.

### 8.3 UI (`apps/web`)

Новые файлы:
- `src/lib/schemaTypes.ts` — зеркальные типы: `ExportRequest { all; folder_ids; name; author: string | null;
  description: string | null }`, `ImportSelection { all; folders: string[] }`, `ImportItem`, `ImportNode`,
  `ImportPreview`, `ImportReport` (поля как в §6.2/§6.7; `RuleStatus` = `'new' | 'duplicate' | 'conflict'`).
- `src/lib/schemaFile.ts`:
  `export const MAX_FILE_BYTES = 9 * 1024 * 1024;`
  `readJsonFile(file: File): Promise<unknown>` — `file.size > MAX_FILE_BYTES` → `throw new Error('Файл больше 9 МБ')`;
  `JSON.parse(await file.text())` в try/catch → `throw new Error('Файл не читается как JSON')`.
  `downloadJson(data: unknown, filename: string): void` — `Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })`,
  `URL.createObjectURL`, временный `<a download>`, `click()`, `setTimeout(() => URL.revokeObjectURL(url), 0)`.
  `schemaFileName(name: string): string` — `name.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'schema'` + `.pm-schema.json`.
- `src/components/schema/CheckTree.tsx` —
  `export interface CheckNode { key: string; name: string; meta?: string; children: CheckNode[]; detail?: ReactNode }`;
  `CheckTree({ nodes, checked, implied = false, onToggle, depth = 0 })`. Строка `.tree-row` с отступом
  `paddingInlineStart: depth * 14 + 2` (как `TreeNode`), кнопка раскрытия (`Icon` `chevron-right`/`chevron-down`,
  `aria-expanded`, показывается если есть `children` или `detail`), `<input type="checkbox">`
  `checked={implied || checked.has(key)}` `disabled={implied}`, имя, `meta` классом `mono ml-auto text-caption text-muted`.
  Раскрытый узел: `detail` и `CheckTree` детей с `implied={implied || checked.has(key)}`, `depth + 1`.
  Узлы по умолчанию свёрнуты, кроме `depth === 0`.
- `src/components/schema/ExportModal.tsx` — `ExportModal({ tree, onClose })`: `Modal` `title="Экспорт схемы"`
  `eyebrow="Поделиться правилами"` `size="lg"`. Поля (`Field` + `input className="input"`): «Название» (обязательно),
  «Автор», «Описание» (`textarea`). Чекбокс «Всё дерево» (по умолчанию включён) → `CheckTree` с `implied={all}`;
  узлы из `FolderNode`: `{ key: n.id, name: n.name, meta: String(n.total_count), children }`.
  Footer: «Скачать JSON» (`btn btn-primary`, `<Icon name="download" />`, disabled если `busy || !name.trim() ||
  (!all && checked.size === 0)`), «Отмена» (`btn btn-ghost`). Успех: `downloadJson(pkg, schemaFileName(name))`,
  `toast(\`Скачан файл: правил ${pkg.counts.preferences}\`)`, `onClose()`. Ошибка → `toast(message, 'error')`.
- `src/components/schema/ImportModal.tsx` — `ImportModal({ onClose })`: шаги `file → preview → report`.
  Шаг file: текст «Выберите JSON-файл схемы, экспортированный из другого «Сервиса моих предпочтений».»,
  `<input type="file" accept=".json,application/json" className="input">` → `readJsonFile` → `api.importPreview`.
  Шаг preview → `ImportPreviewBody`; footer «Применить» (`btn btn-primary`, disabled `busy || (!all && checked.size === 0)`)
  и «Отмена». Во время применения текст `role="status"`: «Импортирую: считаю эмбеддинги и проверяю дубли — до пары минут…».
  Шаг report → `ImportReportBody`; footer «Готово». Тост: `errors > 0 && rules_created === 0` → `'error'`, иначе
  `success` с «Импортировано правил: N».
- `src/components/schema/ImportPreviewBody.tsx` — шапка пакета (name, author, description — как текст, без HTML),
  строка счётчиков: «Папок: X (новых Y) · Правил: N · Дословных дублей: D · Противоречат вашим: C · Ошибок: E»,
  предупреждение `text-caption text-text-2`: «Правила из файла попадут в контекст ваших агентов. Просмотрите
  формулировки перед применением. Похожие по смыслу дубли проверятся при применении.», список `errors`
  (если есть), чекбокс «Весь пакет» (по умолчанию включён) + `CheckTree`: `{ key: n.key, name: n.name,
  meta: \`${n.total}\` + (n.skipped ? \` · пропуск ${n.skipped}\` : '') + (n.exists ? '' : ' · новая'),
  detail: n.items.length ? список items : undefined }`. Item: `statement` (класс `text-like-ink`/`text-dislike-ink`
  по полярности) + метка статуса: `duplicate` → «дубль», `conflict` → «противоречит вашему».
- `src/components/schema/ImportReportBody.tsx` — список: «Создано папок», «Создано правил», «Пропущено дублей»,
  «Пропущено противоречий», «Ошибок», затем `messages`.
- `src/components/schema/SchemaActions.tsx` — `SchemaActions({ tree })`: строка из двух кнопок
  `btn btn-ghost btn-sm`: `<Icon name="download" /> Экспорт` и `<Icon name="upload" /> Импорт`; состояние
  открытой модалки.

Изменения:
- `components/FolderTree.tsx`: `import { SchemaActions } from './schema/SchemaActions';` и сразу после `div`
  «Все правила» (перед `{list(topics)}`) — `<SchemaActions tree={tree} />`. Больше ничего.
- `lib/api.ts` (после `exportMd`):
  ```ts
  exportSchema: (body: ExportRequest) => request<SchemaPackageFile>('POST', '/api/export/schema', body),
  importPreview: (pkg: unknown) => request<ImportPreview>('POST', '/api/import/schema/preview', { package: pkg }),
  importApply: (pkg: unknown, selection: ImportSelection) =>
    request<ImportReport>('POST', '/api/import/schema/apply', { package: pkg, selection }),
  ```
  `SchemaPackageFile` в `schemaTypes.ts`: `{ counts: { folders: number; preferences: number } } & Record<string, unknown>`.
- `lib/types.ts`: `source: 'voice' | 'text' | 'mcp' | 'import';`.
- Иконка `upload`: скачать со склада CMS
  `https://n8n.w1do.ru/webhook/assets-file?object_key=assets%2Ficons%2Ftermicons%2FSVG%2FUser%20Interface%2FLine%2Ffile%20upload%20ou-lc.svg`
  (пара к существующей `download` = `file download ou-lc`, тот же набор termicons-line, `mask_ready: true`) в
  `apps/web/src/assets/icons/upload.svg`; проверить, что файл начинается с `<svg` или `<?xml`. Добавить `| 'upload'`
  в `IconName` (`lib/assets.ts`) и запись в `assets/manifest.json` сразу после `download`:
  `{ "key": "upload", "kind": "icon", "file": "icons/upload.svg", "warehousePath": "icons/termicons/SVG/User Interface/Line/file upload ou-lc.svg", "set": "termicons-line", "style": "line-black", "mask_ready": true, "caption": "Импорт — файл со стрелкой вверх" }`.
  Если скачать не удалось — не рисовать свою: `Icon` сам покажет пустой слот; добавить запись в
  `assets/missing.json` (`{ "key": "upload", "kind": "icon", "tried": ["get: termicons UI file upload ou-lc"] }`) и сообщить в отчёте.
- Только токены/классы, уже используемые в проекте; новых CSS-файлов нет. Сторонние иконки запрещены.

### 8.4 MCP

Инструмента нет. Причины: агенту нечем передать файл в MCP-вызове (пакет до 10 МиБ в аргументе — плохая идея);
импорт чужих правил в контекст агентов — решение человека после просмотра предпросмотра, а не агента;
`add_preference` уже покрывает запись из агента. `apps/mcp` не меняется.

## 9. Validation and error-handling rules

- Тело: 1 МиБ для экспорта (глобально), 10 МиБ для импорта (`IMPORT_MAX_BYTES`, 413). Клиент заранее режет 9 МиБ.
- JSON парсит Fastify (защита от `__proto__`/`constructor`); в браузере — `JSON.parse` в try/catch.
- Формат/версия/шапка/папки → 400 с понятной русской фразой. Правило с ошибкой → пропуск, `errors`, номер правила.
- Лимиты: папок ≤ 2000, правил ≤ 5000, история ≤ 20 записей, длины строк — §6.2 (совпадают с лимитами
  `enrichmentSchema`/`preferencePatchSchema`).
- id/folder_id/source/is_active/created_at из файла игнорируются: новые `randomUUID`, `is_active: true`,
  `source: 'import'`, даты — время импорта, `folder_*` — от папки получателя.
- Ошибки OpenAI/Qdrant при применении не бросаются наружу после начала записи — отражаются в `ImportReport`.
- Ошибки до записи (формат, выбор) — исключения `PreferenceError` → `errors.ts`.

## 10. Authorization and security considerations

- Маршруты под существующей сессией (`auth.ts` закрывает всё `/api/*`, кроме входа). Тест на 401.
- Секреты: пакет не содержит env/токенов; логи — только счётчики и `err.message`; ответы — свои русские сообщения.
- Prompt-injection: импорт не вызывает LLM (нет `enrich`, `decideConflict`, `groupDuplicates`). Остаточный риск:
  импортированные правила затем попадают в контекст агентов через MCP — это суть функции; предпросмотр показывает
  все формулировки, UI предупреждает. Импортированные правила помечены `source: 'import'` — их можно отфильтровать
  (`GET /api/preferences?source=import`).
- XSS: тексты пакета выводятся в React как текст (никакого `dangerouslySetInnerHTML`).
- DoS: лимиты размера и количества; эмбеддинги батчами по 64; дедуп-запросы по 8 параллельно.
- Замок: импорт держит мьютекс записи на время дедупа и upsert (до ~минуты на тысячи правил); остальные записи
  ждут. Эмбеддинги правил считаются до замка.

## 11. Backward-compatibility considerations

- `source = 'import'` — новое значение. PROMPT.md §2 перечисляет `voice|text|mcp` как каналы ввода; импорт —
  новый канал. Индекс keyword не меняется, старые точки валидны. Фильтр `source` в api принимает новое значение.
- `normName` — новый экспорт; `sameName` ведёт себя так же. `newFolderPayload` — вынос без изменения поведения.
- Новых env нет; `.env.example` и env-схема не меняются.
- Формат версии 1; более новая версия — внятный отказ.

## 12. Test strategy

Core (vitest, реальный Qdrant через global setup):

`packages/core/test/transfer-format.test.ts` (без Qdrant, чистые функции):
1. `parsePackage(null)`, `('x')`, `([])`, `({})`, `({ format: 'other', version: 1 })` → `PreferenceError` 400,
   сообщение «Файл не похож на пакет схемы предпочтений».
2. `version: 2` → 400, сообщение содержит «версии 2».
3. `preferences` длиной `MAX_PREFERENCES + 1` (элементы `{}`) → 400 «Неверный пакет: поле «preferences»…».
4. `name` из 121 символа → 400.
5. Папка с пустым путём `[]` → 400 «Неверный пакет: папка #1».
6. Пакет из 3 правил: одно без `statement`, одно с `history` из 21 записи, одно валидное с полями `id`,
   `folder_id`, `source: 'voice'`, `is_active: false` → `rules.length === 1`, `invalid === 2`, `errors.length === 2`;
   у валидного `enrichment` нет `id`/`source` (проверить `Object.keys`), `folder_path` без листа получает «Не люблю».
7. `selectPackage`: выбор `['Программирование']` оставляет правила `Программирование/...`, отбрасывает `Рыбалка/...`;
   регистр в выборе (`'программирование'`) работает; пустой выбор при `all: false` → 400.
8. `ExactIndex`: «Грубые ответы ChatGPT» vs «грубые  ответы, chatgpt!» → `duplicate`; другая полярность → `conflict`;
   другой проект → `new`.
9. `planFolders`: существующая «программирование» переиспользуется для пути `['Программирование', 'Код']`
   (создаётся только «Код» с `parent_id` существующей); `['Проекты', 'Дача', 'Люблю']` → корень с `domain: 'project'`;
   `description` берётся из `meta`.

`packages/core/test/transfer-fixtures.ts` — общий код: `seedSource(core, ai)` сохраняет через `core.prefs.save`
(скрипты `FakeAi`) 3 правила: «Грубые ответы ChatGPT» (`ChatGPT/Не люблю`, `ai_assistants`), «Файлы длиннее 100
строк» (`Программирование/Код/Не люблю`, constraint `file_lines <= 100`, `level: 'hard'`, `why`), «Минимальный UI»
(`Проекты/Семейный чат/Люблю`, project «Семейный чат»; фраза должна упоминать проект — см. `guardProject`);
`dropCollections(core)`.

`packages/core/test/transfer-roundtrip.test.ts` (два `testCore()` в `beforeAll`: source и target; `afterAll` —
`dropCollections` обоих):
1. Экспорт `all` → `JSON.parse(JSON.stringify(pkg))`; в тексте пакета нет id правил и папок источника
   (`JSON.stringify(pkg).includes(id) === false` для каждого id), нет `source`, `distinct_from`, `folder_id`.
2. Предпросмотр в пустой target: `counts.rules === 3`, `duplicates === 0`, `new_folders === counts.folders`.
3. Применение `all` → `rules_created 3`, `errors 0`, `folders_created === число уникальных префиксов`; правила в target:
   `source === 'import'`, id не совпадают с исходными, `folder_ancestors`/`folder_depth` верны, `constraints`,
   `level`, `why`, `history` сохранены; `core.folders.tree()` — `total_count` верны (recount);
   `PREFERENCES.md` в `dataDir` target содержит «Файлы длиннее 100 строк».
4. Повторное применение того же пакета → `rules_created 0`, `duplicates 3`, `folders_created 0`, число правил и папок не изменилось.
5. Экспорт подмножества: `folder_ids: [id папки «Код»]` → пакет содержит папки `Программирование` и
   `Программирование/Код` (предок) и правило про 100 строк, но не «Грубые ответы ChatGPT».
6. Экспорт с неизвестным uuid → `FolderError` 404; `all: false` без ids → `PreferenceError` 400.

`packages/core/test/transfer-merge.test.ts` (один target `testCore()`):
1. Непустая база: в target заранее сохранено «Грубые ответы ChatGPT» (dislike) → импорт пакета с ним и с
   «Грубые ответы ChatGPT» like (другая папка) → `duplicates 1`, `conflicts 1`, оба не созданы.
2. Смысловой дубль: в target «Грубые ответы ChatGPT» с тегами; импорт правила «Ответы ChatGPT грубые» с той же
   папкой, тегами и details (FakeAi: тот же мешок слов → cosine 1, ключ формулировки другой) → `duplicates 1`.
3. Сбой upsert: `core.store.upsertPreferences = async () => { throw new Error('qdrant down') }` (восстановить в
   `finally`) → импорт пакета с новой папкой не бросает, `rules_created 0`, `errors === n`, `folders_created 0`,
   список папок target такой же, как до импорта (сирот нет).
4. Сбой эмбеддингов: `ai.embed` бросает (восстановить) → `errors === n`, `rules_created 0`, папок не прибавилось.
5. «Пустая папка пакета» (без правил) создаётся; выбор подмножества импортирует только выбранную ветку.

API (`apps/api/test/transfer.test.ts`, `makeApp()` + `login()`):
1. `POST /api/export/schema` `{ all: true, name: 'Тест' }` → 200, `format`, `counts.preferences >= 1`.
2. Экспорт → preview → 200 с `tree`; apply `{ selection: { all: true } }` → 200, затем повтор → `rules_created 0`.
3. `preview` с `{ package: { format: 'x' } }` → 400; с `{}` (нет package) → 400.
4. Тело > 10 МиБ (строка в поле `package.pad`) → 413.
5. Без cookie → 401 на все три маршрута.
6. Ответы и логи не содержат `sk-secret-value` (`res.body.includes(...) === false`).

Web: тестов в проекте нет — `npm run typecheck -w @preference-memory/web`, `npm run build`, `npm run lint` и
ручная проверка (§13 AC10).

## 13. Acceptance criteria

- AC1. Экспорт «всё» и подмножества работает; пакет соответствует §6.1, без id/векторов/служебных полей; предки выбранных папок включены.
- AC2. Предпросмотр не пишет в Qdrant и не вызывает OpenAI; показывает дерево, счётчики, дословные дубли/противоречия, ошибки.
- AC3. Применение создаёт папки (слияние по пути без учёта регистра) и правила с новыми id, `source: 'import'`, верными `folder_*`.
- AC4. Повторный импорт того же файла: 0 новых правил и папок.
- AC5. Импорт не вызывает `enrich`, `decideConflict`, `groupDuplicates` (проверка: тест на FakeAi без скриптов проходит; `grep` по `transfer/` не находит этих имён).
- AC6. После импорта `preference_count` и `PREFERENCES.md` обновлены (тест).
- AC7. Частичный сбой: отчёт с ошибками, без исключения, без папок-сирот (тест).
- AC8. Мусорный файл, неверная версия, превышение лимитов → 400/413 с русским сообщением.
- AC9. `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` — exit 0.
- AC10. В UI: кнопки «Экспорт»/«Импорт» в сайдбаре дерева; экспорт скачивает файл; импорт показывает предпросмотр,
  применяет, показывает отчёт; иконки только со склада (`download`, `upload` или пустой слот + `missing.json`).
- AC11. Каждый созданный/изменённый файл кода и тестов ≤ 150 строк (`wc -l`); `folders/service.ts` не растёт
  (было 250 — после изменения меньше).
- AC12. Нет новых env, нет изменений в `.env.example`, `apps/mcp`, чужих незакоммиченных файлах.

## 14. Rollback considerations

Изменение аддитивное: удалить `transfer/`, маршруты, web-компоненты, откатить точечные правки. Импортированные
правила остаются в базе с `source: 'import'`; их можно удалить через UI. Если `sourceSchema` откатывают, точки с
`source: 'import'` по-прежнему читаются (`asPreference` не валидирует `source`), но фильтр `?source=import` перестанет приниматься.

## 15. Files allowed to be modified

Создать:
- `packages/core/src/transfer/format.ts`, `keys.ts`, `export.ts`, `parse.ts`, `dedup.ts`, `folders.ts`, `tree.ts`,
  `preview.ts`, `embed.ts`, `apply.ts`, `write.ts`, `service.ts`, `types.ts`
- `packages/core/src/folders/payload.ts`
- `packages/core/test/transfer-format.test.ts`, `transfer-fixtures.ts`, `transfer-roundtrip.test.ts`, `transfer-merge.test.ts`
- `apps/api/src/routes/transfer.ts`, `apps/api/test/transfer.test.ts`
- `apps/web/src/lib/schemaTypes.ts`, `apps/web/src/lib/schemaFile.ts`
- `apps/web/src/components/schema/CheckTree.tsx`, `ExportModal.tsx`, `ImportModal.tsx`, `ImportPreviewBody.tsx`,
  `ImportReportBody.tsx`, `SchemaActions.tsx`
- `apps/web/src/assets/icons/upload.svg`

Изменить (только описанное):
- `packages/core/src/core.ts` (+ `TransferService`)
- `packages/core/src/index.ts` (+ экспорты)
- `packages/core/src/types.ts` (одна строка `sourceSchema`)
- `packages/core/src/folders/tree.ts` (`normName`)
- `packages/core/src/folders/service.ts` (`newFolder` → `newFolderPayload`)
- `apps/api/src/server.ts`, `apps/api/src/query.ts` (enum `source`)
- `apps/web/src/lib/api.ts`, `apps/web/src/lib/types.ts`, `apps/web/src/lib/assets.ts`
- `apps/web/src/components/FolderTree.tsx`
- `apps/web/src/assets/manifest.json` (или `apps/web/src/assets/missing.json`, если иконку не скачать)
- `openspec/changes/export-import-schema/proposal.md` — только отметки о выполнении.

Запрещено трогать: `preferences/{save,service,refresh,draft}.ts`, `vitest.config.ts`, `apps/*/src/main.ts`,
README, CHANGELOG, `.env.example`, `env.ts`, `apps/mcp/**`, существующие тесты.

## 16. Ordered implementation steps for the Implementer

0. `git status` — запомнить чужие изменения; их не трогать и не форматировать.
1. `folders/tree.ts`: добавить
   `export const normName = (s: string): string => s.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');`
   и переписать `sameName` как `normName(a) === normName(b)`.
2. Создать `folders/payload.ts` с `newFolderPayload` (§6.6); в `folders/service.ts` удалить приватный `newFolder`,
   заменить оба вызова `this.newFolder(` на `newFolderPayload(`, убрать импорт `randomUUID`.
3. `types.ts`: `sourceSchema` с `'import'`. `apps/api/src/query.ts`: `z.enum(['voice', 'text', 'mcp', 'import'])`.
4. Создать `transfer/format.ts` и `transfer/types.ts` (§6.2), `transfer/keys.ts` и `transfer/dedup.ts` (§6.5), `transfer/folders.ts` (§6.6).
5. Создать `transfer/parse.ts` (§6.4), `transfer/tree.ts` и `transfer/preview.ts` (§6.7).
6. Создать `transfer/export.ts` (§6.3).
7. Создать `transfer/embed.ts`, `transfer/apply.ts`, `transfer/write.ts` (§6.8), `transfer/service.ts` (§6.9).
   Doc-комментарий в начале каждого файла по-русски, одной-двумя фразами (как в `preferences/*`).
8. `core.ts`: подключить `TransferService` (§6.9). `index.ts`: добавить
   ```ts
   export { TransferService } from './transfer/service.js';
   export { IMPORT_MAX_BYTES, SCHEMA_FORMAT, SCHEMA_VERSION, exportInputSchema, importSelectionSchema,
     type ExportInput, type ImportSelection, type ImportReport, type SchemaPackage } from './transfer/format.js';
   export type { ImportPreview, ImportNode, ImportItem } from './transfer/tree.js';
   ```
   (`ImportPreview` объявить в `tree.ts` или реэкспортировать из `preview.ts` — один источник.)
9. Тесты core (§12): `transfer-format.test.ts`, `transfer-fixtures.ts`, `transfer-roundtrip.test.ts`,
   `transfer-merge.test.ts`. Запуск: `npm run build -w @preference-memory/core && npm test -w @preference-memory/core`.
10. `apps/api/src/routes/transfer.ts` (§8.1), регистрация в `server.ts`, `apps/api/test/transfer.test.ts`.
    Запуск: `npm test -w @preference-memory/api` (api импортирует собранный core — сначала build core).
11. Иконка `upload` (§8.3): `curl -fsSL "<url>" -o apps/web/src/assets/icons/upload.svg`, проверить начало файла;
    `IconName`, `manifest.json`. При неудаче — `missing.json`.
12. Web: `schemaTypes.ts`, `schemaFile.ts`, методы `api.ts`, `types.ts`, `CheckTree.tsx`, `SchemaActions.tsx`,
    `ExportModal.tsx`, `ImportPreviewBody.tsx`, `ImportReportBody.tsx`, `ImportModal.tsx`, вставка в `FolderTree.tsx`.
    Без прямых `fetch` — только `api.*`.
13. Форматирование только своих файлов: `npx prettier --write <созданные и изменённые файлы>`.
14. Проверки: `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`.
15. `wc -l` по всем созданным/изменённым файлам кода и тестов — каждый ≤ 150; при превышении разбить по
    ответственности внутри разрешённого списка (например, типы в `transfer/types.ts`, хелперы теста в
    `transfer-fixtures.ts`). `grep -rn "enrich\|decideConflict\|groupDuplicates" packages/core/src/transfer` — пусто.
16. `git status` — изменены только файлы из §15. Отчёт: что сделано, команды и их результат, строки файлов,
    судьба иконки `upload`, отклонения от спеки (если были — с причиной).
