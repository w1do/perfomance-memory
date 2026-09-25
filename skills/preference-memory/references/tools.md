# Инструменты MCP-сервера `preferences`

Транспорт — Streamable HTTP, путь `/mcp`, авторизация `Authorization: Bearer <MCP_TOKEN>` (без неё — `401`).
Все ответы — текст, сгруппированный по папкам, на языке правил.

## Содержание
- [get_context_for_task](#get_context_for_task) — главный, в начале задачи
- [get_preferences](#get_preferences) — поиск с фильтрами
- [get_folder](#get_folder), [list_folders](#list_folders) — дерево и папки
- [list_projects](#list_projects), [get_project](#get_project) — проекты
- [add_preference](#add_preference) — сохранить новое
- [Ресурсы и промпт](#ресурсы-и-промпт)
- [Формат правила в ответе](#формат-правила-в-ответе)

## get_context_for_task

`{ task: string, applies_to?: string[], top_k?: number }`

Сервис определяет по задаче домены (programming, ai_assistants, …) и проект (только если он назван в `task`),
фильтрует правила по индексам, ранжирует гибридным поиском и **всегда** добавляет все правила с ограничениями из
найденных доменов.

```
Контекст задачи — domains: programming

# Жёсткие ограничения
- `file_lines <= 100 lines` — Файлы с кодом больше 100 строк (Программирование › Код › Не люблю)

# Правила
## Программирование › Код › Не люблю
- [не люблю] Файлы с кодом больше 100 строк (сила 3/5)
  constraints: `file_lines <= 100 lines`
  id: 7f8c05e8-…
```

Если строки «domains» нет («все области»), подходящих доменов не нашлось — возвращаются просто самые близкие по
смыслу правила.

## get_preferences

`{ query: string, folder?: string, domain?: string, project?: string, polarity?: "like"|"dislike",
applies_to?: string[], tags?: string[], top_k?: number }`

Сначала фильтр по метаданным, потом ранжирование (dense + BM25, RRF). `folder` — путь через `/`, включает вложенные
папки (`"Программирование"` найдёт и `Программирование/Код/Не люблю`).

## get_folder

`{ path: string, cursor?: string, limit?: number }` — папка, её подпапки со счётчиками и правила постранично.
Если в конце ответа есть `next_cursor: …`, вызови снова с `cursor`.

## list_folders

`{}` — всё дерево с числом правил (включая вложенные).

## list_projects

`{}` — проекты (папки внутри «Проекты») со счётчиками.

## get_project

`{ name: string, cursor?: string }` — все правила проекта по папкам.

## add_preference

`{ text: string, project?: string }` — тот же конвейер, что в интерфейсе: обогащение LLM, выбор или создание
папки, проверка на конфликт или дубль, индексация, пересборка PREFERENCES.md. Источник записи — `mcp`.

```
Результат: создано · папка: Программирование › Код › Не люблю
```

Варианты результата: `создано`, `обновлено (конфликт)` (плюс «Прежняя версия: …»), `дубль`, `проект создан`.
Инструмента нет, если в сервисе `MCP_ALLOW_WRITE=false`.

## Ресурсы и промпт

- `preferences://main` — весь PREFERENCES.md (дерево заголовками, правила, ограничения, сила).
- `preferences://folder/{path}` — одна ветка; `path` URL-кодированный: `Проекты%2FДача`.
- Промпт `apply_my_preferences({ task? })` — просит агента вызвать `get_context_for_task` и соблюдать ограничения.

## Формат правила в ответе

```
- [люблю|не люблю] <правило> (сила N/5)
  constraints: `<metric> <operator> <value> <unit>`   ← требование, которое должно выполняться
  <пояснение>
  applies_to: <кому> · project: <проект> · id: <uuid>
```

`applies_to`: `me` — про самого пользователя, `any_ai` — требование к любому ИИ-помощнику, конкретные метки —
`chatgpt`, `claude`, `php`, `react` и т. п.
