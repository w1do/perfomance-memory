# OpenSpec: parallel-save-coalesced-refresh

Параллельное обучение без «зависаний»: LLM-обогащение вне замка записи, коалесцированное обновление
счётчиков папок и PREFERENCES.md.

## Статус реализации

Статус: **выполнено**, 2026-10-13. Reviewer: APPROVED (cycle 1, все findings закрыты). Checks: PASS.
Спецификация не менялась; ниже — только отметки о выполнении. Отметки в §16 сделаны там, где есть доказательство.

Подтверждение по критериям приёмки (§13):

- AC1, AC2, AC3, AC4, AC7, AC8, AC9, AC10, AC12: выполнены по отчёту Reviewer (AC1–AC13 выполнены, APPROVED).
  AC9 (тест 12.1 п.8 падает на старом `request()`): отчёта Implementer'а о красном прогоне в пакете документации нет,
  поэтому факт проверяется только по заключению Reviewer.
- AC5: `npm run lint`, `npm run typecheck`, `npm run build` — exit 0; корневой `npm test`: core 89, api 9, mcp 11 (checks-runner).
- AC6: все созданные и изменённые файлы кода и тестов ≤ 150 строк (`wc -l`, checks-runner).
- AC11: `npm test -w @preference-memory/core` три прогона подряд — 89/89 каждый, 141 / 213 / 208 с; самый долгий тест
  18.7 с (порог 60 с не достигнут).
- AC13: `packages/core/vitest.config.ts` — `fileParallelism: false`; прогоны core зелёные. Точный diff «ровно две строки»
  отдельно не зафиксирован checks-runner, подтверждён заключением Reviewer.

Остаточные риски (из отчёта Reviewer):

- `drain()` не ждёт `save()` в фазе подготовки (вне замка). Частичной записи нет.
- При двух подряд ошибках refresh счётчики и `PREFERENCES.md` догоняются следующей записью.
- Решение `decideConflict` выполняется под замком: при нескольких кандидатах конфликта решения идут по очереди.
- Межпроцессная гонка между `api` и `mcp` не менялась.
- `packages/core/src/folders/service.ts` (250 строк) превышал лимит в 150 строк до этого изменения и не трогался.

Документация: `README.md` (раздел «Поток данных», абзац «Параллельная запись»), `CHANGELOG.md` (запись 2026-10-13).

Не выполнено на момент документирования (отмечено в §16 как открытое):

- Проверка `npm run format` и `git status` (шаг 10, A2-2): в пакете checks этих команд нет.
- Проверка теста 12.1 п.8 на старом коде (шаг A1-4): отчёта нет.
- Условные шаги 11 и A2-3 (эскалация при нестабильности) не понадобились и не выполнялись.

## Open questions

Нет. Все решения ниже приняты; человеку решать нечего. Если Implementer видит противоречие со
спецификацией — остановиться и эскалировать, не перепроектировать.

## Amendment 1 (эскалация после Reviewer cycle 1)

Изменено по findings Reviewer (cycle 1). Исправленные разделы помечены «(A1)»:

- §6.3 (A1): `request()` сначала присоединяет к уже запрошенному обновлению, затем проверяет `running`;
  обработчик `queued` вешается на оба исхода; `describe()` не бросает на не-`Error`. Закрывает окно
  двойного старта между `finally` текущего обновления и стартом хвостового (finding 1). Доказательство — §6.3.1.
- §6.4 п.5 (A1): doc-комментарий `PreferenceService.drain()` объясняет, почему подготовка save вне замка не
  ожидается (finding 5).
- §12 (A1): общие хелперы вынесены в новый `packages/core/test/concurrency-helpers.ts`; тесты на
  блокировку вынесены в новый `packages/core/test/parallel-save-lock.test.ts`; один `testCore()` на файл
  (`beforeAll`) и удаление коллекций в `afterAll` (finding 2); барьер вместо порогов времени (finding 3);
  усиленный тест «удерживаемое обогащение не блокирует другую запись» (finding 4); новый тест на окно
  микротасков (finding 1).
- §12.2: `source: 'web'` было ошибкой спеки — `sourceSchema` допускает только `voice | text | mcp`;
  везде `source: 'text'` (принятое отклонение Implementer'а узаконено).
- Узаконено: удалён неиспользуемый `import type { Enrichment }` из `save.ts`.
- `test/helpers.ts` и `vitest.config.ts` НЕ меняются (обоснование в §12.0). Пункт про
  `vitest.config.ts` отменён Amendment 2.
- §13, §15, §16 обновлены.

## Amendment 2 (эскалация: таймауты существующих интеграционных тестов)

Код и тесты изменения приняты Reviewer'ом (APPROVED, cycle 1). Блокирует только AC5/AC11.

Причина. Все тестовые файлы core работают с одним Qdrant-контейнером (`test/qdrant-global-setup.ts`).
При параллельном запуске файлов существующие интеграционные тесты (indexes, folders, placement, backup)
уже на чистом HEAD занимают 40–63 с при `testTimeout: 60_000` — запаса нет. Три новых интеграционных
файла добавляют по одному `testCore()` и выталкивают их за порог. Это свойство тестового окружения,
не дефект изменения: при `npx vitest run --no-file-parallelism` Reviewer получил 89/89 PASS дважды
(150 и 164 с), самый долгий тест 12 с; общее время не хуже параллельного прогона (119–194 с).

Решение: в `packages/core/vitest.config.ts` в объект `test` добавить `fileParallelism: false`
(файлы core выполняются по одному; тесты внутри файла и так последовательны).

Проверено архитектором:
- Установлена vitest 5.0.1 (`node_modules/vitest/package.json`, корневой `package.json`: `^5.0.1`);
  опция `fileParallelism?: boolean` есть в `UserConfig` этой версии (`vitest/dist/chunks/plugin.d.*.d.ts`)
  и соответствует CLI-флагу `--no-file-parallelism`, которым пользовался Reviewer. Другая форма записи
  не нужна.
- В конфиге нет `pool`, `poolOptions`, `maxWorkers`, `sequence` — конфликтов нет.
- `globalSetup` выполняется один раз на весь прогон независимо от `fileParallelism` — не затронут.
- Другие workspaces (`apps/api`, `apps/mcp`) не меняются; корневой `npm test` запускает workspaces
  по очереди, поэтому между ними параллельной нагрузки на Qdrant нет.

Отвергнуто: подъём `testTimeout` (лечит симптом, прячет будущие зависания), `maxWorkers`/`pool`
(то же косвенно и зависит от числа ядер), слияние файлов или моки (теряется покрытие G3 на реальном Qdrant).

Изменения спеки: §13 (AC13), §15 (allowlist + снят запрет на `vitest.config.ts`), §16 (шаг A2-1,
пункт 11). Остальное без изменений.

## 1. Problem statement

`add_preference` (MCP) и `POST /api/preferences` при пакетном обучении (десятки фраз подряд или
параллельно) отвечают по минуте и дольше. Причина в `PreferenceService.write()`:

1. `save()` целиком исполняется внутри `Mutex.run`: превью (embed + LLM `enrich` + `rescueMisc` +
   `snapTypos`), эмбеддинг черновика, `findConflict` (hybrid + embed + LLM `decideConflict`) и запись.
   Все LLM-вызовы всех фраз выполняются строго по очереди: N фраз × 10–60 с.
2. После каждой записи под тем же замком выполняются `folders.recount()` (list всех папок + facet) и
   `onChange()` (`rebuildMainFile`: дерево + все правила + запись файла). Это O(хранилище) на каждую
   запись, и оно тоже удлиняет очередь.

## 2. Goals and non-goals

Цели:

- G1. Превью (embed + `enrich` + нормализация) и эмбеддинг черновика выполняются ВНЕ замка; параллельные
  `save()` выполняют их одновременно.
- G2. Под замком остаются только операции, которые должны быть атомарны друг относительно друга:
  поиск дубля/конфликта (`findConflict`, включая LLM `decideConflict`), `ensurePath`, запись.
- G3. Параллельные одинаковые фразы дают одно правило и дубли (`created` + `duplicate`), а не два правила.
- G4. `recount()` + `onChange()` выполняются коалесцированно: серия записей → одно-два обновления, а не N.
- G5. Когда промис `write()` (а значит `save/update/remove/merge/place/distinct` и маршрутов папок)
  резолвится, счётчики папок и PREFERENCES.md уже отражают эту запись.
- G6. Ошибка обновления не теряется: повтор один раз, затем `log.error`.
- G7. Graceful shutdown дожидается последнего обновления.

Не цели:

- Межпроцессная согласованность (api и mcp — разные процессы с разными замками). Поведение не меняется.
- Вынос `decideConflict` из замка (см. §5.2, обоснование).
- Изменение `FolderService.recount`, `rebuildMainFile`, формата PREFERENCES.md, API/MCP-контрактов.
- Новые env-переменные, новые зависимости, таймеры debounce.
- Рефакторинг `folders/service.ts` (250 строк, уже превышает лимит; файл не трогаем).

## 3. Current architecture analysis

- `packages/core/src/preferences/mutex.ts` — `Mutex.run(fn)`: FIFO-цепочка промисов, процессный замок.
- `packages/core/src/preferences/service.ts` — `PreferenceService.write(fn)` = `lock.run(fn → recount →
  onChange)`. Через `write()` идут: `save`, `update`, `remove`; `HygieneService` (`place`, `merge`,
  `distinct`; передаётся в `core.ts` как `(fn) => prefs.write(fn)`); маршруты папок
  `apps/api/src/routes/folders.ts` (`create`, `update`, `remove`).
- `packages/core/src/preferences/preview.ts` — `previewText(deps, text, projectHint)`: только чтения
  хранилища + LLM. Безопасно вне замка.
- `packages/core/src/preferences/save.ts` — `saveEnrichment(deps, e, rawText, source)`: embed черновика →
  `findConflict` → ветки `duplicate` / `conflict` / `created`, `ensurePath`, upsert.
- `packages/core/src/preferences/conflict.ts` — `findConflict`: hybrid в domain (+project) → embed
  raw-текстов кандидатов → `decideConflict` (LLM).
- `packages/core/src/core.ts` — `rebuildMainFile` передаётся сервису как `onChange`; bootstrap вызывает
  его напрямую (не меняется).
- `packages/core/src/qdrant/store.ts` — все записи с `wait: true`: запись видна следующему поиску сразу.
- `packages/core/src/export/writer.ts` — атомарная запись через `<file>.<pid>.tmp` + rename; два
  одновременных `rebuildMainFile` в одном процессе столкнулись бы на tmp-файле, поэтому обновления не
  должны идти параллельно друг другу (обеспечивает single-flight, §5.3).
- `apps/api/src/main.ts`, `apps/mcp/src/main.ts` — `shutdown`: закрыть сервер → `process.exit(0)`.

## 4. Relevant files and symbols

| Файл | Символы | Строк сейчас |
|---|---|---|
| packages/core/src/preferences/service.ts | `PreferenceService.write`, `.save`, `.preview` | 109 |
| packages/core/src/preferences/save.ts | `saveEnrichment` | 104 |
| packages/core/src/preferences/conflict.ts | `findConflict` (не меняется) | 90 |
| packages/core/src/preferences/mutex.ts | `Mutex` (не меняется) | 10 |
| packages/core/src/preferences/preview.ts | `previewText` (не меняется) | 82 |
| packages/core/src/core.ts | `rebuildMainFile`, `createCore` (не меняется) | 124 |
| packages/core/test/fake-ai.ts | `FakeAi` (не меняется, 145 строк) | 145 |
| packages/core/test/helpers.ts | `testCore`, `testConfig` (не меняется) | 35 |
| apps/api/src/main.ts, apps/mcp/src/main.ts | `shutdown` | 27 / 30 |

## 5. Proposed architecture

### 5.1. Две фазы сохранения

`save()` = подготовка (вне замка) → фиксация (под замком):

- Подготовка: `previewText` (или нормализация готового превью) + `withExplicit` + `prepareDraft`
  (эмбеддинг `embeddingText(e)`). Это чистые функции от текста и снимка справочников (дерево папок,
  метки, теги) — результат не зависит от того, что запишут параллельные фразы, кроме мелкого эффекта
  §11-R2.
- Фиксация: `saveEnrichment(deps, draft, source)` под замком: `findConflict` → ветка → `ensurePath` →
  upsert. Не меняется по логике, только больше не делает embed черновика.

### 5.2. Почему `findConflict` и `decideConflict` остаются под замком

Детекция дубля корректна, только если поиск кандидатов видит все ранее зафиксированные правила. Если
вынести hybrid-поиск или `decideConflict` из замка, две параллельные одинаковые фразы обе прочитают
хранилище до записи друг друга, обе получат `new` и создадут два правила (G3 нарушена).

Рассмотренная альтернатива — оптимистичная проверка: решать конфликт вне замка, а под замком сверять
счётчик версий области (domain) и при изменении пересчитывать. При пакетном обучении почти все фразы
попадают в одну область, значит почти каждая фиксация пересчитывала бы `decideConflict` второй раз:
та же сериализация плюс двойная стоимость LLM и лишний модуль версий. Отклонено.

Итог: под замком остаются hybrid-поиск, embed raw-текстов кандидатов, `decideConflict` (только когда
кандидаты есть), `ensurePath`, upsert. Из замка уходит самое дорогое — `enrich` и всё превью — и
эмбеддинг черновика. Компромисс: при параллельных фразах с кандидатами `decideConflict` по-прежнему
идёт по очереди; это цена корректности дублей.

### 5.3. Коалесцированное обновление (`CoalescedRefresh`)

Новый модуль `packages/core/src/preferences/refresh.ts`. Обновление (= `folders.recount()` затем
`onChange()`) выполняется ВНЕ замка записи, в режиме single-flight с одним «хвостовым» запуском:

- Нет текущего обновления → запросы запускают его сразу.
- Обновление идёт → все запросы, пришедшие за это время, присоединяются к ОДНОМУ следующему обновлению,
  которое начнётся после окончания текущего.
- Никогда не идут два обновления одновременно (важно для tmp-файла writer.ts).

Семантика (G5): `request()` резолвится после завершения обновления, НАЧАТОГО ПОСЛЕ вызова
`request()`. `write()` вызывает `request()` сразу после того, как `fn` завершилась (запись зафиксирована
с `wait: true`), поэтому обновление, которого ждёт вызывающий, видит его запись. Последняя запись серии
всегда получает обновление после себя — итоговое состояние согласовано.

Почему не trailing-debounce по таймеру и не «обновление в очереди замка»: таймер добавляет задержку
каждому вызову и требует env-переменной/очистки при остановке; задача-обновление в конце очереди замка
заставила бы первого вызывающего ждать всю серию (минуты при 30 фразах) и снова блокировала бы записи
на O(хранилище). Single-flight вне замка: ожидание вызывающего ≤ двух длительностей обновления, записи
обновлением не блокируются.

Почему вне замка безопасно: `recount` пишет только поле `preference_count` (частичный set_payload),
`rebuildMainFile` только читает хранилище; гонка с одновременной записью даёт временно устаревшие
данные, которые исправляет хвостовое обновление. Единственная возможная ошибка гонки — `recount`
пытается обновить счётчик папки, которую параллельно удалили (`folders.remove`, `hygiene.place`).
Её закрывает повтор (G6): второй проход заново читает список папок.

Ошибки (G6): `CoalescedRefresh` никогда не отклоняет промис. Первая ошибка → `log.warn` и немедленный
повтор; вторая → `log.error` с пояснением, что счётчики и PREFERENCES.md обновятся при следующей
записи. Запись к этому моменту уже зафиксирована, поэтому `save()` резолвится успешно (иначе клиент
получил бы ошибку для сохранённого правила). Ошибки `fn` (самой записи) по-прежнему пробрасываются, и
обновление после них не запрашивается — как сейчас.

Остановка (G7): `PreferenceService.drain()` ждёт очередь замка и затем текущее/запрошенное обновление.
`apps/api` и `apps/mcp` вызывают `core.prefs.drain()` в `shutdown` после закрытия сервера.

## 6. Detailed implementation plan

### 6.1. Новый файл `packages/core/src/preferences/draft.ts`

```ts
/**
 * Черновик правила для сохранения: обогащение, исходная фраза и эмбеддинг текста правила.
 * Готовится вне замка записи — эмбеддинг не зависит от хранилища.
 */
import type { Enrichment } from '../types.js';
import type { PrefDeps } from './deps.js';
import { embeddingText } from './payload.js';

export interface Draft {
  enrichment: Enrichment;
  rawText: string;
  /** embeddingText(enrichment) */
  text: string;
  /** dense-вектор text; пустой у project_only — такие черновики не ищут и не сохраняют как правило */
  dense: number[];
}

export async function prepareDraft(deps: PrefDeps, e: Enrichment, rawText: string): Promise<Draft> {
  if (e.kind === 'project_only') return { enrichment: e, rawText, text: '', dense: [] };
  const text = embeddingText(e);
  const [dense] = await deps.ai.embed([text]);
  return { enrichment: e, rawText, text, dense: dense as number[] };
}
```

### 6.2. `packages/core/src/preferences/save.ts`

- Сигнатура: `export async function saveEnrichment(deps: PrefDeps, draft: Draft, source: Source): Promise<SaveResult>`.
- В начале функции: `const { enrichment: e, rawText, text: draftText, dense } = draft;` и `import type { Draft } from './draft.js';`.
- Удалить строки `const draftText = embeddingText(e);`, `const [draftDense] = await deps.ai.embed([draftText]);`, `const dense = draftDense as number[];`.
- Остальное тело без изменений (`findConflict(deps, e, rawText, dense, draftText)`, ветки, сравнение `finalText === draftText`).
- Импорт `embeddingText` остаётся (используется для `finalText`).
- В doc-комментарий файла добавить фразу: «Выполняется под замком записи: поиск дубля/конфликта и запись атомарны относительно других записей; черновик готовится заранее (draft.ts).»

### 6.3. Новый файл `packages/core/src/preferences/refresh.ts` (A1)

```ts
/**
 * Коалесцированное обновление производных данных после записей: счётчики папок и PREFERENCES.md.
 * Работает вне замка записи, не больше одного обновления одновременно; запросы, пришедшие во время
 * обновления, ждут одного следующего. request() резолвится после обновления, начатого позже вызова.
 * Ошибка: один повтор (гонка с удалением папки), затем log.error; промис не отклоняется — запись уже
 * сохранена, данные догонит следующее обновление.
 */
import type { Logger } from '../logger.js';

export class CoalescedRefresh {
  private running: Promise<void> | null = null;
  private queued: Promise<void> | null = null;

  constructor(
    private readonly refresh: () => Promise<void>,
    private readonly log: Logger,
  ) {}

  /**
   * Порядок проверок важен: уже запрошенное обновление стартует после этого вызова, поэтому к нему можно
   * присоединиться даже в зазоре, когда текущее уже сбросило running, а хвостовое ещё не стартовало.
   */
  request(): Promise<void> {
    if (this.queued) return this.queued;
    if (!this.running) return this.start();
    const next = (): Promise<void> => {
      this.queued = null;
      return this.start();
    };
    this.queued = this.running.then(next, next);
    return this.queued;
  }

  /** Graceful shutdown: дожидается текущего и запрошенного обновления. */
  async drain(): Promise<void> {
    while (this.running || this.queued) await (this.queued ?? this.running);
  }

  private start(): Promise<void> {
    const run: Promise<void> = this.attempt().finally(() => {
      if (this.running === run) this.running = null;
    });
    this.running = run;
    return run;
  }

  private async attempt(): Promise<void> {
    try {
      await this.refresh();
    } catch (first) {
      this.log.warn({ err: describe(first) }, 'refresh after write failed, retrying');
      try {
        await this.refresh();
      } catch (second) {
        this.log.error(
          { err: describe(second) },
          'refresh after write failed: folder counters and PREFERENCES.md update on the next write',
        );
      }
    }
  }
}

function describe(err: unknown): { message: string; name: string } {
  if (err instanceof Error) return { message: err.message, name: err.name };
  return { message: String(err), name: 'NonError' };
}
```

Ровно этот код. Менять нельзя: порядок двух проверок в `request()`; `queued = null` строго ДО
`this.start()` внутри `next` (оба синхронно в одном колбэке); `then(next, next)`.

#### 6.3.1. Обоснование исправления (A1)

Дефект исходного кода. `running` сбрасывается в колбэке `finally`, а промис, возвращаемый `finally`
(на нём висит `queued = running.then(...)`), резолвится на несколько микротасков позже (`finally` внутри
делает `Promise.resolve(onFinally()).then(() => value)`). В этом зазоре состояние «`running === null`,
`queued` ожидает». Старый `request()` видел `running === null`, сразу вызывал `start()` (R2), а затем
колбэк `queued` вызывал `start()` ещё раз (R3): R2 и R3 шли параллельно.

Состояния исправленного кода (S = текущее обновление `attempt()` ещё не завершилось):

| Состояние | running | queued | request() |
|---|---|---|---|
| idle | null | null | `start()` |
| R | не null | null | создаёт `queued` на `running` |
| RQ | не null | ожидает | возвращает `queued` |
| gap | null | ожидает | возвращает `queued` (раньше — второй старт) |

Инвариант «`start()` вызывается только когда ни один `attempt()` не идёт»:

1. `start()` вызывается ровно из двух мест: `request()` в состоянии idle (обе ссылки null — значит
   последний `finally` уже отработал, т.е. `attempt()` завершён) и `next` (вызывается только после того,
   как settled промис `running`, на котором он висит, — а тот settled после `finally`, т.е. после
   завершения `attempt()`).
2. Пока `queued` не null, ветка idle недостижима (первая проверка), значит единственный путь к `start()` —
   `next`. `queued` создаётся только когда он null, поэтому одновременно существует не больше одного
   `next`, и он висит именно на текущем `running` (подменить `running` можно только через `start()`,
   а он, по п.2, недоступен до вызова `next`).
3. `next` синхронно делает `queued = null` и `running = R'` — промежуточного состояния «оба null при
   незапущенном хвосте» нет. Новый `request()` после этого создаёт новый `queued` на `R'`.

Семантика G5 сохраняется: в состояниях RQ и gap вызывающий получает `queued`, который стартует (`next`)
строго после вызова. Старый промис `queued`, уже выданный вызывающим, резолвится, когда завершится `R'`
(принятие промиса, возвращённого из `next`).

Живучесть: `attempt()` не отклоняется (все ошибки перехвачены; `describe()` больше не бросает на
`throw undefined`/`throw 'строка'` — раньше `TypeError` внутри `catch` отклонял `attempt()`), колбэк
`finally` не бросает. `then(next, next)` — защита на случай, если `running` всё же отклонится: без неё
отклонённый `queued` навсегда остался бы не-null и по первой проверке `request()` все будущие запросы
получали бы один и тот же отклонённый промис (новый риск, который вносит перестановка проверок).

`drain()`: цикл ждёт `queued ?? running`; ни один из них не отклоняется; каждая итерация завершается,
когда текущий хвост завершён; цикл выходит, как только на момент проверки обе ссылки null. Зависание
возможно только если сам `refresh` никогда не резолвится — как и раньше.

Почему не флаг/явная машина состояний: та же логика из трёх состояний, но больше кода и тот же риск
порядка присваиваний; промисная форма с инвариантом выше проще проверить тестом §12.1 п.8.

### 6.4. `packages/core/src/preferences/service.ts`

1. Импорты: добавить `import { prepareDraft, type Draft } from './draft.js';` и
   `import { CoalescedRefresh } from './refresh.js';`. Остальные импорты сохранить.
2. Поле: `private readonly refresh: CoalescedRefresh;`.
3. Конструктор: параметр `onChange` остаётся (`private readonly` можно снять, если больше не используется
   как поле — сделать обычным параметром `onChange: () => Promise<void>`). После `this.deps = ...`:
   ```ts
   this.refresh = new CoalescedRefresh(async () => {
     await folders.recount();
     await onChange();
   }, log);
   ```
   Поле `private readonly folders` тоже можно сделать обычным параметром `folders: FolderService`, если
   оно больше нигде не используется в классе (после изменения — не используется). Сделать так, чтобы
   eslint/tsc не ругались на неиспользуемые поля.
4. `write`:
   ```ts
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
   ```
5. `drain` (A1 — заменить однострочный doc-комментарий на этот, код без изменений):
   ```ts
   /**
    * Graceful shutdown: ждёт записи в очереди замка и последнее обновление счётчиков и PREFERENCES.md.
    * save() в фазе подготовки (превью, эмбеддинг — вне замка) не ждёт: хранилище она ещё не трогала,
    * обрыв на process.exit не оставляет частичной записи — правило просто не сохранится.
    */
   async drain(): Promise<void> {
     await this.lock.run(async () => undefined);
     await this.refresh.drain();
   }
   ```
6. `save`:
   ```ts
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
   ```
7. Doc-комментарий файла (строки 1–5): заменить строку 3 на «Обогащение и эмбеддинг идут вне замка, поиск
   дубля и запись — под мьютексом процесса; счётчики папок и PREFERENCES.md обновляются коалесцированно
   (refresh.ts).» и в строке 4 добавить `draft.ts, refresh.ts` в перечень.
8. `update`, `remove`, `preview`, чтения — без изменений.

### 6.5. `apps/api/src/main.ts` и `apps/mcp/src/main.ts`

В `shutdown` после `await app.close();` / `await server.stop();` добавить строку
`await core.prefs.drain();` перед `process.exit(0);`. Больше ничего не менять.

## 7. Data-flow and control-flow

```
save(input)
 ├─ вне замка, параллельно с другими save:
 │    previewText (embed + enrich LLM + rescueMisc + snapTypos)  | или normalizeEnrichment(preview)
 │    withExplicit → prepareDraft (embed черновика)
 ├─ lock.run (FIFO):
 │    saveEnrichment: findConflict (hybrid → embed кандидатов → decideConflict LLM) → ensurePath → upsert(wait)
 │    refresh.request()  ← вызывается под замком сразу после фиксации
 └─ await refreshed (вне замка): recount → rebuildMainFile, single-flight + один хвостовой запуск
```

Пример: 5 записей подряд за время одного обновления → обновление №1 (для первой) + обновление №2
(общее для остальных четырёх) = 2 вызова `recount` и 2 вызова `onChange`.

## 8. API, database, UI, or domain changes

Нет изменений контрактов REST/MCP, схемы Qdrant, payload, UI, env. Публичные добавления в core:
`PreferenceService.drain()`. `PreferenceService.write` сохраняет сигнатуру. `saveEnrichment` меняет
сигнатуру (внутренний модуль, не экспортируется из `index.ts`; единственный вызывающий — service.ts).

## 9. Validation and error-handling rules

- `save` без `text` и `preview` → `PreferenceError(400)` как раньше (теперь до замка).
- Ошибки `enrich`/embed в подготовке → пробрасываются вызывающему, замок не занимается.
- Ошибки внутри `fn` под замком → пробрасываются, `refresh.request()` не вызывается.
- Ошибки обновления → warn + повтор → error; промис `write()` резолвится результатом `fn`.
- В логах только `message` и `name` ошибки, без секретов (через существующий pino с redact).

## 10. Authorization and security

Авторизация не затрагивается. Секреты не логируются. Новых входов нет.

## 11. Backward compatibility and risks

- R1. Межпроцессная гонка api↔mcp не меняется (не цель).
- R2. Превью читает дерево/метки до фиксации параллельных фраз: `snapTypos` не «приклеит» опечатку к
  папке, которую параллельная фраза создаёт прямо сейчас. Одинаковые имена (без учёта регистра/ё)
  `ensurePath` под замком всё равно сводит в одну папку. Принимается.
- R3. `decideConflict` остаётся сериализованным при наличии кандидатов (§5.2).
- R4. Между фиксацией записи и концом её обновления другие читатели могут увидеть старые
  `preference_count`/файл — как и раньше между записью и `recount`.
- R5. Если оба прохода обновления упали, данные устаревают до следующей записи или рестарта api
  (bootstrap пересобирает PREFERENCES.md). Видно по `log.error`.
- Тест pipeline.test.ts:90 (`preference_count` в ответе = 0) не меняется: папка берётся из `ensurePath`.

## 12. Test strategy (A1)

Все тесты — vitest в `packages/core/test`, интеграционные с реальным Qdrant через существующий
`testCore()` (globalSetup поднимает контейнер или берёт `QDRANT_TEST_URL`). Каждый файл ≤ 150 строк
(жёсткое правило `file_lines`). `fake-ai.ts` не трогать (145 строк); подмена обогащения —
переопределением метода экземпляра (`ai.enrich = async (input) => {...}` с вызовом
`FakeAi.prototype.enrich.call(ai, input)`), через хелперы §12.0.

### 12.0. Нагрузка на тестовый Qdrant и общие хелперы (A1)

Правила для КАЖДОГО интеграционного файла этой задачи (`parallel-save.test.ts`,
`parallel-save-lock.test.ts`, `write-refresh.test.ts`) — тот же шаблон, что уже в `assistant.test.ts`,
`placement.test.ts`, `scope.test.ts`, `hygiene.test.ts`, `level.test.ts`:

```ts
let core: Core;
let ai: FakeAi;
beforeAll(async () => {
  ({ core, ai } = await testCore());   // в parallel-save.test.ts ещё dataDir
});
afterAll(async () => {
  await core.qdrant.deleteCollection(core.config.QDRANT_COLLECTION);
  await core.qdrant.deleteCollection(core.config.QDRANT_FOLDERS_COLLECTION);
});
```

`beforeEach(testCore)` запрещён. Каждый тест внутри файла использует свои фразы, домены и папки (общий
core — значит счётчики `count({ domain })` и `preference_count` не должны пересекаться между тестами).

Почему не трогаем `test/helpers.ts` и `vitest.config.ts`: коллекции `testCore()` именуются
`t_prefs_<uuid8>` / `t_folders_<uuid8>` (уникальны на вызов), globalSetup только поднимает контейнер и
отдаёт URL — удаление собственных коллекций в `afterAll` ни с чем не конфликтует (так уже делают пять
файлов). Красный полный прогон был вызван 9 лишними `testCore()` без очистки; после правил выше эти три
файла создают 3 core и удаляют их — нагрузка возвращается к уровню HEAD (70/70 зелёные). Менять общий
хелпер или параллелизм vitest — затронуть все тесты ради проблемы, которой после исправления нет. Если
двойной прогон (§16 шаг 10) всё же красный — не менять конфиг, а остановиться и эскалировать с выводом.

Новый файл `packages/core/test/concurrency-helpers.ts` (не тест: имя без `.test.`), ровно эти экспорты:

```ts
import { vi } from 'vitest';
import type { Logger } from '../src/logger.js';
import { FakeAi } from './fake-ai.js';

/** Промис, который тест резолвит вручную. */
export function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export const flush = () => wait(0);

type Spy = ReturnType<typeof vi.fn>;
export function makeLog() {
  return { warn: vi.fn(), error: vi.fn() } as unknown as Logger & { warn: Spy; error: Spy };
}

/** Мок обновления: каждый вызов получает следующий gate по порядку. */
export function gated(...gates: ReturnType<typeof gate>[]) {
  return vi.fn(() => {
    const next = gates.shift();
    if (!next) throw new Error('unexpected refresh call');
    return next.promise;
  });
}

/** Два последовательных обновления, каждое открывается тестом отдельно. */
export function twoRefreshes() {
  const g1 = gate();
  const g2 = gate();
  return { g1, g2, refresh: gated(g1, g2) };
}

/** Обновление с подсчётом одновременно активных; каждый вызов ждёт свой gate. */
export function activeProbe() {
  const gates: Array<() => void> = [];
  const stats = { active: 0, maxActive: 0 };
  const refresh = vi.fn(async () => {
    stats.active++;
    stats.maxActive = Math.max(stats.maxActive, stats.active);
    await new Promise<void>((resolve) => gates.push(resolve));
    stats.active--;
  });
  const openNext = () => gates.shift()?.();
  /** Открывает все появляющиеся gate, пока p не завершится. */
  const drive = async <T>(p: Promise<T>): Promise<T> => {
    const timer = setInterval(() => gates.splice(0).forEach((open) => open()), 1);
    try {
      return await p;
    } finally {
      clearInterval(timer);
    }
  };
  return { refresh, stats, openNext, drive };
}

/**
 * Барьер: каждый вызов enrich ждёт, пока в полёте окажутся parties вызовов. Если обогащение
 * сериализовано, барьер не наберётся и вызов отклонится через timeoutMs — тест падает детерминированно.
 */
export function barrierEnrich(ai: FakeAi, parties: number, timeoutMs = 5000) {
  let arrived = 0;
  const all = gate();
  ai.enrich = async (input) => {
    arrived++;
    if (arrived === parties) all.open();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`enrich serialized: ${arrived}/${parties} in flight`)),
        timeoutMs,
      );
    });
    try {
      await Promise.race([all.promise, timeout]);
    } finally {
      clearTimeout(timer);
    }
    return FakeAi.prototype.enrich.call(ai, input);
  };
}

/** Держит enrich фразы heldText до release(); entered резолвится, когда этот вызов начался. */
export function holdEnrich(ai: FakeAi, heldText: string) {
  const entered = gate();
  const held = gate();
  ai.enrich = async (input) => {
    if (input.text === heldText) {
      entered.open();
      await held.promise;
    }
    return FakeAi.prototype.enrich.call(ai, input);
  };
  return { entered: entered.promise, release: held.open };
}

/** Возвращает исходное поведение FakeAi.enrich. */
export function plainEnrich(ai: FakeAi) {
  ai.enrich = (input) => FakeAi.prototype.enrich.call(ai, input);
}
```

Если `tsc`/eslint требуют явных типов (например, тип `input`), добавить их, не меняя логику. Если
типизация `ai.enrich = ...` не сходится с сигнатурой `FakeAi.enrich` — использовать ту же форму, что уже
компилируется в текущем `parallel-save.test.ts` (`slowEnrich`).

### 12.1. `packages/core/test/refresh.test.ts` (юнит, `CoalescedRefresh`, без Qdrant-вызовов) (A1)

Локальные хелперы `gate`, `gated`, `twoRefreshes`, `wait`, `flush`, `makeLog`, тип `Spy` из файла
УДАЛИТЬ и импортировать из `./concurrency-helpers.js` (`activeProbe` тоже). Тесты 1–7 — без изменений
логики (как в текущем файле):

1. `coalesces requests made during a running refresh into one trailing refresh`: `a = request()`; затем
   `b, c, d = request()` ×3; `open()` первого; дождаться всех → `refresh` вызван ровно 2 раза; `b === c`
   и `c === d` (один промис).
2. `request after a finished refresh starts a new one`: request → await → request → await → 2 вызова.
3. `request resolves only after a refresh that started after the call`: при идущем обновлении №1
   `b = request()`; после завершения №1 `b` ещё не резолвлен (проверка флагом), резолвится после №2.
4. `retries once and logs warn on a single failure`: refresh отклоняется 1 раз, затем успех →
   `refresh` вызван 2 раза, `warn` 1 раз, `error` 0, `request()` резолвится.
5. `logs error and resolves after two failures; next request runs again`: refresh всегда отклоняется
   `new Error('disk full')` → `warn` 1, `error` 1, первый аргумент `error` содержит
   `{ err: { message: 'disk full', name: 'Error' } }`; промис резолвится (не отклоняется); следующий
   `request()` снова вызывает `refresh`.
6. `drain waits for the running and queued refresh`: request (идёт), request (в очереди), `drain()` не
   резолвится до открытия обоих gate; после — резолвится, `refresh` вызван 2 раза.
7. `never runs two refreshes at once`: счётчик активных внутри refresh, 10 `request()` с разной
   задержкой → максимум активных = 1.

Новые тесты (A1):

8. `never starts two refreshes when a request lands between finish and the queued start`:
   ```ts
   for (let k = 0; k <= 10; k++) {
     const probe = activeProbe();
     const r = new CoalescedRefresh(probe.refresh, makeLog());
     const a = r.request();
     const b = r.request();
     probe.openNext();
     for (let i = 0; i < k; i++) await null;
     const c = r.request();
     await probe.drive(Promise.all([a, b, c]));
     expect(probe.stats.maxActive, `k=${k}`).toBe(1);
   }
   ```
   (`await null` — именно микротаск-спины, не таймеры. Если eslint ругается на `await null`
   (`@typescript-eslint/await-thenable`), заменить на `await Promise.resolve()` — это тоже один спин.)
9. `non-Error rejections are logged and do not break later requests`:
   `refresh = vi.fn(() => Promise.reject('boom'))` (строка, не Error; если eslint требует Error —
   `// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors` над этой строкой);
   `await expect(r.request()).resolves.toBeUndefined()`; `log.error.mock.calls[0]?.[0]` содержит
   `{ err: { message: 'boom', name: 'NonError' } }`; затем `await r.request()` → `refresh` вызван 4 раза.

Обязательная проверка теста 8 (только локально, НЕ оставлять в дереве): временно вернуть в
`refresh.ts` старое тело `request()` (из git-истории спеки: `if (!this.running) return this.start();
this.queued ??= this.running.then(() => { this.queued = null; return this.start(); }); return
this.queued;`), запустить `npx vitest run test/refresh.test.ts` в `packages/core` → тест 8 ДОЛЖЕН упасть
(`maxActive` 2 хотя бы для одного k); вернуть код §6.3, тест зелёный. Если на старом коде тест 8 зелёный
при k = 0..10 — не расширять диапазон наугад, остановиться и эскалировать с выводом.

### 12.2. `packages/core/test/parallel-save.test.ts` (интеграция) (A1)

Шаблон §12.0 (`beforeAll`/`afterAll`, деструктуризация `{ core, ai, dataDir }`). Хелпер `slowEnrich`
из файла удалить; импорт `barrierEnrich` из `./concurrency-helpers.js`. Во всех `save` —
`source: 'text'`. Фразы, домены и папки — РОВНО эти (уникальны в пределах файла):

1. `runs enrichment of parallel saves concurrently, not one by one`:
   - `'не люблю мутные блесны на окуня'` → `{ statement: 'Мутные блесны на окуня', polarity: 'dislike',
     folder_path: ['Рыбалка', 'Не люблю'], domain: 'fishing' }`
   - `'люблю маршруты без толпы туристов'` → `{ statement: 'Маршруты без толпы', polarity: 'like',
     folder_path: ['Путешествия', 'Люблю'], domain: 'travel' }`
   - `'не люблю пересоленный суп'` → `{ statement: 'Пересоленный суп', polarity: 'dislike',
     folder_path: ['Кулинария', 'Не люблю'], domain: 'cooking' }`
   - `'люблю короткие ответы ассистента'` → `{ statement: 'Короткие ответы ассистента', polarity:
     'like', folder_path: ['ChatGPT', 'Люблю'], domain: 'ai_assistants' }`

   `barrierEnrich(ai, 4)`; `Promise.all` из 4 `core.prefs.save({ text, source: 'text' })` → все четыре
   `action === 'created'`. Ни `Date.now()`, ни `maxActive`, ни порогов времени (барьер сам падает при
   сериализации).
2. `parallel identical phrases produce one rule and duplicates`: фраза `'не люблю табы в коде'` →
   `{ statement: 'Табы в коде', polarity: 'dislike', folder_path: ['Программирование', 'Код',
   'Не люблю'], domain: 'programming' }` (единственный тест файла с `programming`); `barrierEnrich(ai, 3)`;
   3 параллельных `save` → отсортированные `action` = `['created', 'duplicate', 'duplicate']`;
   `await core.prefs.count({ domain: 'programming' })` = 1; у обоих `duplicate` `preference.id` равен id
   созданного; `core.folders.byPath(['Программирование','Код','Не люблю'])` не null и в
   `core.folders.list()` ровно одна папка с таким путём (через `joinPath`, как сейчас).
3. `save resolves with counters and PREFERENCES.md already refreshed`:
   - `'не люблю вставать раньше пяти'` → `{ statement: 'Подъём раньше пяти утра', polarity: 'dislike',
     folder_path: ['Зимняя рыбалка', 'Не люблю'], domain: 'ice_fishing' }`
   - `'не люблю ловлю мормышкой зимой'` → `{ statement: 'Ловля мормышкой зимой', polarity: 'dislike',
     folder_path: ['Зимняя рыбалка', 'Не люблю'], domain: 'ice_fishing' }`

   `barrierEnrich(ai, 2)`; `Promise.all` двух save → `PREFERENCES.md` в `dataDir` содержит оба statement;
   `(await core.folders.byPath(['Зимняя рыбалка', 'Не люблю']))?.preference_count === 2`.

Тест «preview errors do not hold the write lock» из этого файла УДАЛИТЬ (переезжает в §12.2a).

### 12.2a. Новый `packages/core/test/parallel-save-lock.test.ts` (интеграция) (A1)

`describe('parallel save: the write lock is not held during enrichment', ...)`. Шаблон §12.0
(`{ core, ai }`), плюс `beforeEach(() => plainEnrich(ai))`. Импорты из `./concurrency-helpers.js`:
`holdEnrich`, `plainEnrich`, `wait`.

1. `a held enrichment does not block another save`:
   ```ts
   const HELD = 'не люблю созвоны без повестки';
   const FAST = 'люблю письменные итоги встреч';
   ai.script(HELD, { statement: 'Созвоны без повестки', polarity: 'dislike',
     folder_path: ['Встречи', 'Не люблю'], domain: 'meetings' })
     .script(FAST, { statement: 'Письменные итоги встреч', polarity: 'like',
       folder_path: ['Заметки', 'Люблю'], domain: 'notes' });
   const p = await core.prefs.preview(FAST);            // до подмены enrich
   const hold = holdEnrich(ai, HELD);
   const held = core.prefs.save({ text: HELD, source: 'text' });
   await hold.entered;                                   // HELD точно в enrich
   const fast = await Promise.race([
     core.prefs.save({ preview: { text: p.text, enrichment: p.enrichment }, source: 'text' }),
     wait(5000).then(() => 'blocked' as const),
   ]);
   hold.release();                                       // до assert'ов, чтобы не висел замок
   expect(fast).not.toBe('blocked');
   if (fast !== 'blocked') expect(fast.action).toBe('created');
   expect((await held).action).toBe('created');
   ```
   (При старом дизайне HELD держит замок в enrich → `fast` = `'blocked'` → детерминированный провал.)
2. `preview errors do not hold the write lock`: перенос текущего теста без изменений логики — фраза
   `'не люблю длинные созвоны'` → `{ statement: 'Длинные созвоны', polarity: 'dislike', folder_path:
   ['Работа', 'Не люблю'], domain: 'work' }`; `Promise.allSettled([save('фраза без сценария для
   FakeAi'), save('не люблю длинные созвоны')])` → первый `rejected`, второй `fulfilled` с `created`.

### 12.3. `packages/core/test/write-refresh.test.ts` (интеграция, реальный `recount`) (A1)

Изменение структуры (тесты 1–5 по логике без изменений):

```ts
let core: Core;
let ai: FakeAi;        // или AiProvider — тот тип, что принимает конструктор PreferenceService
let config: Config;
let recount: MockInstance;
let onChange: Mock<() => Promise<void>>;
let prefs: PreferenceService;

beforeAll(async () => {
  ({ core, ai, config } = await testCore());
  recount = vi.spyOn(core.folders, 'recount');
});
beforeEach(() => {
  recount.mockClear();
  onChange = vi.fn(async () => undefined);
  prefs = new PreferenceService(core.store, core.folders, ai, config, log, onChange);
});
afterAll(async () => {
  await core.qdrant.deleteCollection(config.QDRANT_COLLECTION);
  await core.qdrant.deleteCollection(config.QDRANT_FOLDERS_COLLECTION);
});
```

Новый `PreferenceService` на каждый тест (дёшево, без Qdrant-вызовов в конструкторе) — у каждого теста
свой `CoalescedRefresh` и свежий `onChange`. В тесте 3 (`a failed refresh...`) последней строкой
`error.mockRestore();`.

1. `coalesces a burst of writes into at most two refreshes` — как сейчас.
2. `refreshes after the last write of a burst` — как сейчас.
3. `a failed refresh does not fail the write and is logged` — как сейчас + `error.mockRestore()`.
4. `drain waits for the pending refresh` — как сейчас.
5. `write errors propagate and skip refresh` — как сейчас.

### 12.4. Регрессия

Существующие тесты core, api, mcp проходят без изменений.

## 13. Acceptance criteria (A1)

- AC1. Все тесты из §12 (12.1 п.1–9, 12.2 п.1–3, 12.2a п.1–2, 12.3 п.1–5) существуют и проходят;
  существующие тесты проходят.
- AC2. В `service.ts` вызов `previewText`/`prepareDraft` происходит вне `lock.run`; в `save.ts` нет
  `deps.ai.embed([draftText])`.
- AC3. `folders.recount()` и `onChange()` вызываются только из `CoalescedRefresh`, не под `lock.run`.
- AC4. `findConflict`, `ensurePath`, upsert остаются внутри `lock.run`.
- AC5. `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` — без ошибок.
- AC6. Каждый созданный/изменённый файл кода и тестов ≤ 150 строк (`wc -l`).
- AC7. Нет новых зависимостей (`package.json`/`package-lock.json` не изменены) и env-переменных.
- AC8. `apps/api` и `apps/mcp`: изменена ровно одна строка в `shutdown` каждого `main.ts`.
- AC9 (A1). `refresh.ts` совпадает с §6.3 дословно; тест 12.1 п.8 падает на старом `request()` и
  проходит на новом (проверено Implementer'ом и указано в отчёте).
- AC10 (A1). В `parallel-save.test.ts`, `parallel-save-lock.test.ts`, `write-refresh.test.ts` нет
  `beforeEach(... testCore ...)`; ровно один `testCore()` на файл в `beforeAll`; `afterAll` удаляет обе
  коллекции. В тестах нет порогов по времени выполнения (`Date.now()` остаётся только в 12.3 п.2 для
  сравнения порядка, не длительности).
- AC11 (A1). Два полных прогона `npm test -w @preference-memory/core` подряд — оба зелёные, ни один
  тест не длится ≥ 60 с.
- AC12 (A1). Нет `source: 'web'` в тестах.
- AC13 (A2). `packages/core/vitest.config.ts` отличается от HEAD ровно двумя добавленными строками
  из шага A2-1 (комментарий + `fileParallelism: false,`); `testTimeout`/`hookTimeout`/`globalSetup`
  не изменены. Двойной полный прогон `npm test -w @preference-memory/core` подряд — оба зелёные,
  ни один тест не длится ≥ 60 с; корневой `npm test` зелёный; `npm run lint` и `npm run typecheck`
  без ошибок.

## 14. Rollback

Изменение без миграций и без смены данных. Откат — revert коммита; хранилище и PREFERENCES.md
совместимы в обе стороны.

## 15. Files allowed to be modified (A1)

Изменить:

- packages/core/src/preferences/service.ts
- packages/core/src/preferences/save.ts
- apps/api/src/main.ts
- apps/mcp/src/main.ts

Создать:

- packages/core/src/preferences/draft.ts
- packages/core/src/preferences/refresh.ts
- packages/core/test/refresh.test.ts
- packages/core/test/parallel-save.test.ts
- packages/core/test/parallel-save-lock.test.ts (A1)
- packages/core/test/write-refresh.test.ts
- packages/core/test/concurrency-helpers.ts (A1)

Изменить (A2), только по шагу A2-1 — две добавленные строки, больше ничего:

- packages/core/vitest.config.ts

Ничего другого не трогать (в том числе `mutex.ts`, `conflict.ts`, `core.ts`, `folders/service.ts`,
`fake-ai.ts`, `test/helpers.ts`, `test/qdrant-global-setup.ts`, конфиги vitest других workspaces,
`.env.example`, `env.ts`). Документацию (README, CHANGELOG) синхронизирует Documenter после APPROVED. Не коммитить.

## 16. Ordered implementation steps for the Implementer

Исходная реализация (шаги 1–9 ниже) уже есть в рабочем дереве. Для Amendment 1 выполнить шаги A1-1…A1-8,
затем шаг 10.

1. [x] Создать `packages/core/src/preferences/draft.ts` по §6.1.
2. [x] Изменить `packages/core/src/preferences/save.ts` по §6.2.
3. [x] Создать `packages/core/src/preferences/refresh.ts` по §6.3 (код дословно).
4. [x] Изменить `packages/core/src/preferences/service.ts` по §6.4.
5. [x] `npm run typecheck` — исправить только ошибки типов в файлах из §15.
6. [x] Создать `packages/core/test/refresh.test.ts` по §12.1.
7. [x] Создать `packages/core/test/parallel-save.test.ts` по §12.2.
8. [x] Создать `packages/core/test/write-refresh.test.ts` по §12.3.
9. [x] Изменить `apps/api/src/main.ts` и `apps/mcp/src/main.ts` по §6.5.

Amendment 1:

- [x] A1-1. `packages/core/src/preferences/refresh.ts`: заменить `request()` (с doc-комментарием над ним) и
  `describe()` на код §6.3. Остальное не трогать.
- [x] A1-2. `packages/core/src/preferences/service.ts`: заменить doc-комментарий `drain()` по §6.4 п.5.
- [x] A1-3. Создать `packages/core/test/concurrency-helpers.ts` по §12.0.
- A1-4. `packages/core/test/refresh.test.ts`: удалить локальные хелперы, импортировать из
  `./concurrency-helpers.js`, добавить тесты 8 и 9 по §12.1. Выполнить проверку теста 8 на старом коде
  (§12.1, «Обязательная проверка»), вернуть код §6.3, `git diff packages/core/src/preferences/refresh.ts`
  должен соответствовать §6.3.
- [x] A1-5. `packages/core/test/parallel-save.test.ts`: переписать по §12.2 (beforeAll/afterAll,
  `barrierEnrich`, новые фразы/домены/папки, удалить `slowEnrich` и тест 4).
- [x] A1-6. Создать `packages/core/test/parallel-save-lock.test.ts` по §12.2a.
- [x] A1-7. `packages/core/test/write-refresh.test.ts`: перестроить хуки по §12.3.
- [x] A1-8. `grep -rn "source: 'web'\|beforeEach(async () => {\s*$" packages/core/test/parallel-save*.ts
  packages/core/test/write-refresh.test.ts` — не должно быть `source: 'web'` и вызова `testCore()` в
  `beforeEach`.

10. [x] Проверки (из корня `/home/dev/lessons/preference-memory`), по порядку:
    - `npm run format` — затем `git status`: изменены/созданы только файлы из §15 (плюс `openspec/`);
    - [x] `npm run lint`
    - [x] `npm run typecheck`
    - [x] `npm run build`
    - [x] `npm test -w @preference-memory/core` — ДВАЖДЫ подряд; оба зелёные; в выводе ни один тест не
      ≥ 60 с (AC11);
    - [x] `npm test` (все workspaces; нужен Docker или `QDRANT_TEST_URL`)
    - [x] `wc -l` для всех файлов кода и тестов из §15 — каждый ≤ 150.
11. Если тест нестабилен или двойной прогон core красный — не ослаблять проверки, не добавлять пороги
    и таймауты, не трогать `helpers.ts` и в `vitest.config.ts` ничего сверх шага A2-1, а остановиться
    и эскалировать с выводом теста.

Amendment 2 (код и тесты A1 уже приняты — их не трогать):

- [x] A2-1. `packages/core/vitest.config.ts`: в объекте `test` сразу после строки
  `    hookTimeout: 120_000,` вставить ровно две строки (отступ 4 пробела):

  ```ts
      // Файлы делят один Qdrant-контейнер: параллельный запуск выбивает старые тесты за testTimeout.
      fileParallelism: false,
  ```

  Итоговый файл:

  ```ts
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    test: {
      globalSetup: ['./test/qdrant-global-setup.ts'],
      testTimeout: 60_000,
      hookTimeout: 120_000,
      // Файлы делят один Qdrant-контейнер: параллельный запуск выбивает старые тесты за testTimeout.
      fileParallelism: false,
    },
  });
  ```

- A2-2. Проверки (из корня `/home/dev/lessons/preference-memory`), по порядку:
  - `npm run format` — затем `git diff packages/core/vitest.config.ts`: ровно две строки `+`, ни одной `-`;
    `git status`: вне §15 и `openspec/` ничего не изменено;
  - [x] `npm run lint`
  - [x] `npm run typecheck`
  - [x] `npm test -w @preference-memory/core` — первый прогон;
  - [x] `npm test -w @preference-memory/core` — второй прогон сразу после первого;
    оба зелёные, в выводе ни один тест не ≥ 60 с (AC11, AC13);
  - [x] `npm test` (все workspaces; нужен Docker или `QDRANT_TEST_URL`) — зелёный.
  В отчёте привести итоговые строки обоих прогонов (число тестов, длительность) и самый долгий тест.
- A2-3. Если и с `fileParallelism: false` какой-либо тест ≥ 60 с или прогон красный — не поднимать
  таймауты и не менять другие опции, остановиться и эскалировать с полным выводом.
