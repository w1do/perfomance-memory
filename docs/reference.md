# Справочник: MCP и данные

Инструменты MCP, REST API, схема Qdrant.

### Что умеет MCP-сервер (FastMCP, Streamable HTTP, путь `/mcp`)

| Инструмент | Что делает |
|---|---|
| `get_context_for_task({ task, applies_to?, top_k? })` | Главный. Определяет domain/project задачи, фильтрует по индексам, отдаёт правила по папкам со всеми constraints и отдельным блоком «Жёсткие ограничения»; правила работы агента (домен `ai_assistants`) — в каждой задаче разделом «Как работать агенту» |
| `get_preferences({ query, folder?, domain?, project?, polarity?, applies_to?, tags?, top_k? })` | Фильтр по метаданным + гибридный поиск |
| `get_folder({ path, cursor?, limit? })` | Папка с вложенными; большие ветки — постранично (`next_cursor`) |
| `list_folders()`, `list_projects()`, `get_project({ name })` | Дерево, проекты, правила проекта |
| `add_preference({ text, project? })` | Тот же конвейер, что в интерфейсе, `source="mcp"` (только при `MCP_ALLOW_WRITE=true`) |
| `redistribute_rules({ apply? })` | «Распределить»: план переносов общих правил по папкам; с `apply: true` — перенос и удаление опустевших папок (только при `MCP_ALLOW_WRITE=true`) |

Ресурсы: `preferences://main` (весь `PREFERENCES.md`), `preferences://folder/{path}` (ветка; путь через `/`,
URL-кодированный). Промпт: `apply_my_preferences`.


## Qdrant: payload и индексы

Коллекция `QDRANT_COLLECTION`, именованные векторы `dense` (EMBED_DIM, Cosine) и `sparse` (modifier idf).
Любой запрос сначала сужается фильтром по метаданным, потом ранжируется (prefetch dense + sparse, слияние RRF).

| Поле | Тип | Индекс |
|---|---|---|
| `id` | uuid | — (id точки) |
| `statement`, `details` | string / null | text (multilingual, lowercase) |
| `raw_text` | string | — |
| `polarity` | `like` \| `dislike` | keyword |
| `domain` | string | keyword |
| `project` | string / null | keyword |
| `applies_to[]`, `tags[]` | string[] | keyword |
| `constraints[]` | `{ metric, operator, value, unit }[]` | — (ищутся через `constraint_metrics`) |
| `constraint_metrics[]` | string[] | keyword |
| `level` | `hard` «жёстко» \| `default` «по умолчанию» \| `taste` «вкус» | keyword |
| `strength` | 5 / 3 / 1 — выводится из `level` (поле из ТЗ, фильтр `min_strength`) | integer |
| `why` | string / null — «почему», только со слов пользователя | text |
| `example_good`, `example_bad` | string / null — пример «так» / «не так» | — |
| `language` | string | keyword |
| `folder_id` | uuid | keyword |
| `folder_name` | string | — |
| `folder_path[]` | string[] | — |
| `folder_ancestors[]` | все префиксы пути: `Программирование`, `Программирование/Код`, … | keyword |
| `folder_depth` | integer | integer |
| `source` | `voice` \| `text` \| `mcp` | keyword |
| `is_active` | boolean | bool |
| `distinct_from[]` | id правил, помеченных «не дубли» | keyword |
| `history[]` | прежние версии с причиной | — |
| `created_at`, `updated_at` | ISO datetime | datetime |

Коллекция `QDRANT_FOLDERS_COLLECTION`: вектор `dense` по «имя + описание + путь»; payload `{ id, name, parent_id,
path[], ancestors[], depth, domain, description, preference_count, created_at }`; индексы keyword на `parent_id`,
`ancestors`, `domain`, integer на `depth`.

Служебная коллекция `<QDRANT_COLLECTION>__service` хранит одну точку с конфигурацией эмбеддингов (модель,
размерность, версия схемы) — по ней api замечает смену модели и переиндексирует данные.

При переименовании или переносе папки вложенные точки обновляются одним батчем `set_payload`
(`folder_path`, `folder_ancestors`, `folder_depth`, `folder_name`).

## REST API (для интерфейса)

`POST /api/transcribe` (webm/ogg/mp3/m4a до `MAX_AUDIO_MB`) · `POST /api/preferences/preview` ·
`POST /api/preferences` (`{ text | preview, source }` → `{ action, preference, replaced? }`) ·
`GET /api/preferences` (фильтры `folder` — с вложенными, `domain`, `project`, `polarity`, `applies_to`, `tags`,
`metric`, `level`, `min_strength`, `updated_after`; `q` — гибридный поиск) · `PATCH/DELETE /api/preferences/:id` ·
`GET/POST/PATCH/DELETE /api/folders` · `GET /api/facets` · `GET /api/stats` · `GET /api/export.md` ·
`GET /api/hygiene/duplicates` · `POST /api/hygiene/merge` (`{ keep, remove[] }`) ·
`POST /api/hygiene/distinct` (`{ ids[] }`) · `GET /api/status` (сервисы и активные модели, без секретов) · `GET /api/health`.
