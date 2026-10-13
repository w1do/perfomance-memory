## 1. Подготовка в core

- [x] 1.1 `folders/tree.ts`: экспорт `normName`, `sameName` через него; проверка: существующие тесты папок зелёные
- [x] 1.2 `folders/payload.ts` с `newFolderPayload`, удалить `FolderService.newFolder` и лишний импорт; проверка: `npm test -w @preference-memory/core`, `folders/service.ts` короче прежних 250 строк
- [x] 1.3 `types.ts` и `apps/api/src/query.ts`: `'import'` в enum `source`; проверка: typecheck без ошибок

## 2. Модуль transfer

- [x] 2.1 `format.ts` и `types.ts`: константы, zod-схемы, типы; проверка: `wc -l` каждого ≤ 150
- [x] 2.2 `keys.ts`, `dedup.ts`, `folders.ts`; проверка: юнит-сценарии 8–9 из `transfer-format.test.ts` проходят
- [x] 2.3 `parse.ts`, `tree.ts`, `preview.ts`; проверка: сценарии 1–7 из `transfer-format.test.ts` проходят, предпросмотр не пишет в Qdrant
- [x] 2.4 `export.ts`; проверка: roundtrip сценарии 1, 5, 6 проходят
- [x] 2.5 `embed.ts`, `apply.ts`, `write.ts`, `service.ts`; проверка: roundtrip 3–4 и `transfer-merge.test.ts` проходят, `grep -rn "enrich\|decideConflict\|groupDuplicates" packages/core/src/transfer` пуст
- [x] 2.6 `core.ts` и `index.ts`: подключить `TransferService`, экспортировать API; проверка: `npm run build -w @preference-memory/core`

## 3. Тесты core

- [x] 3.1 `transfer-format.test.ts` и `transfer-fixtures.ts`; проверка: файлы проходят
- [x] 3.2 `transfer-roundtrip.test.ts`: экспорт, предпросмотр, применение, повтор, подмножество, ошибки
- [x] 3.3 `transfer-merge.test.ts`: дубли, противоречия, смысловой дубль, сбой upsert, сбой эмбеддингов, пустая папка

## 4. API

- [x] 4.1 `routes/transfer.ts` и регистрация в `server.ts`; проверка: ручной вызов трёх маршрутов с сессией
- [x] 4.2 `apps/api/test/transfer.test.ts`: 200, 400, 413, 401, отсутствие секретов; проверка: `npm test -w @preference-memory/api`

## 5. Web

- [x] 5.1 Иконка `upload` из склада, `IconName`, `manifest.json` (или `missing.json`); проверка: файл начинается с `<svg`
- [x] 5.2 `lib/schemaTypes.ts`, `lib/schemaFile.ts`, методы `api.ts`, `types.ts`; проверка: typecheck web
- [ ] 5.3 `CheckTree`, `SchemaActions`, `ExportModal`, `ImportPreviewBody`, `ImportReportBody`, `ImportModal`, вставка в `FolderTree.tsx`; проверка: `npm run build`, ручной проход: экспорт, предпросмотр, применение, отчёт

## 6. Приёмка

- [x] 6.1 `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` — exit 0
- [x] 6.2 `wc -l` по созданным и изменённым файлам кода и тестов ≤ 150; `git status` без правок вне списка §15 proposal
- [x] 6.3 Нет новых env, `.env.example` и `apps/mcp` не изменены
