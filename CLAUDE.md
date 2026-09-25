# CLAUDE.md — preference-memory («Сервис моих предпочтений»)

Этот файл — постоянный контекст проекта для Claude Code. Полное техническое задание лежит в `PROMPT.md`: читай его целиком перед началом работы и сверяйся с ним на каждом шаге. Если CLAUDE.md и PROMPT.md в чём-то расходятся, приоритет у PROMPT.md.

## Что это за проект
Универсальная личная память «люблю / не люблю» на любые темы (код, ИИ-ассистенты, рыбалка, путешествия, конкретные проекты).
- Ввод голосом (OpenAI Whisper) или текстом в React-интерфейсе.
- Обогащение фразы LLM-моделью (по умолчанию gpt-5.5) в структуру: statement, polarity, папка, domain, project, applies_to, tags, constraints, strength.
- Эмбеддинги OpenAI (text-embedding-3-small, 1536) + BM25 sparse, хранение и гибридный поиск в Qdrant.
- Дерево папок произвольной глубины и один главный файл `PREFERENCES.md`.
- Агенты (Claude Code, Claude Desktop, ChatGPT) читают данные через MCP-сервер на FastMCP.
- Интерфейс — bento-карты, всё оформление берётся из MCP-склада CMS автора.

## Главные правила (нарушать нельзя)
1. **Вся конфигурация — только `.env`.** Никаких CLI-команд настройки, генерации токенов, экранов настроек, дополнительных конфиг-файлов. Обязательные переменные пусты → сервис не стартует и пишет, какую переменную заполнить. Секреты никогда не попадают в логи, ответы API и фронтенд.
2. **Qdrant индексирует все метаданные.** Каждое поле payload из PROMPT.md §2 — обязательно, payload-индексы создаются при старте идемпотентно. Любой поиск: сначала фильтр по метаданным, потом ранжирование (dense + sparse, RRF).
3. **MCP — только FastMCP** (npm `fastmcp`, поверх официального `@modelcontextprotocol/sdk`). Никаких самописных JSON-RPC обработчиков. Авторизация — Bearer `MCP_TOKEN` из .env.
4. **Бизнес-логика только в `packages/core`.** `apps/api` и `apps/mcp` — тонкие слои над core.
5. **Оформление только из CMS.** Палитра, шрифты, радиусы, тени, анимации — из `palette_show`; композиция — из `rules_*`; иконки, иллюстрации, фоны, декор — из `assets_search`/`assets_get`. Сторонние иконочные библиотеки (lucide, heroicons, unDraw и т.п.) запрещены. Нет ассета — оставь место пустым и внеси в отчёт.
6. **Не выдумывать данные.** LLM-обогащение не добавляет того, чего пользователь не говорил.

## Структура репозитория (целевая)
```
preference-memory/
├── CLAUDE.md                  # этот файл
├── PROMPT.md                  # полное ТЗ
├── .env.example               # единственный шаблон конфигурации
├── .mcp.json                  # подключение CMS-склада для Claude Code (URL из переменной окружения)
├── docker-compose.yml         # qdrant, api, mcp, web
├── package.json               # npm workspaces
├── packages/
│   └── core/                  # env-схема (zod), OpenAI, Qdrant, обогащение, эмбеддинги, BM25,
│       ├── src/               # поиск, конфликты, папки, сборка PREFERENCES.md
│       └── test/
├── apps/
│   ├── api/                   # Fastify REST для фронта, volume data/ с PREFERENCES.md
│   ├── mcp/                   # FastMCP, httpStream, путь /mcp
│   └── web/                   # React + Vite + TS + Tailwind, nginx в проде
│       └── src/assets/{icons,illustrations,backgrounds,decor}/   # только из CMS
└── README.md
```

## Сервисы docker-compose
| Сервис | Стек | Наружу | Назначение |
|---|---|---|---|
| qdrant | qdrant/qdrant (закреплённая версия) | нет | векторное хранилище, volume qdrant_data |
| api | Node 20, TS, Fastify | нет | REST `/api/*` |
| mcp | Node 20, TS, FastMCP | нет | MCP `/mcp` (Streamable HTTP) |
| web | React, Vite, nginx | `WEB_PORT` | UI; проксирует `/api` → api, `/mcp` → mcp |

## Коллекции Qdrant (кратко, полная схема — PROMPT.md §2)
- `preferences`: векторы `dense` (EMBED_DIM, Cosine) и `sparse` (idf). Индексы: keyword — polarity, domain, project, applies_to, tags, folder_id, folder_ancestors, constraint_metrics, source, language; integer — strength, folder_depth; bool — is_active; datetime — created_at, updated_at; text — statement, details.
- `folders`: вектор `dense`; индексы parent_id, ancestors, domain, depth.

## MCP-инструменты (кратко, полностью — PROMPT.md §6)
`get_context_for_task` (главный), `get_preferences`, `get_folder`, `list_folders`, `list_projects`, `get_project`, `add_preference` (только при `MCP_ALLOW_WRITE=true`). Ресурсы `preferences://main`, `preferences://folder/{path}`. Промпт `apply_my_preferences`.

## Порядок работы
1. Проверь, что доступен MCP-сервер CMS (`assets_search`, `assets_get`, `palette_show`, `rules_genres`, `rules_show`, `rules_search`, `brand_storm`). Нет — остановись и сообщи.
2. Каркас монорепо, docker-compose, env-схема в core с валидацией.
3. core: Qdrant (коллекции, индексы, служебная конфигурация), OpenAI (Whisper, LLM с json_schema, эмбеддинги), BM25, обогащение, конфликты, папки, PREFERENCES.md. Тесты.
4. api (REST) и mcp (FastMCP). Тесты mcp через in-memory транспорт.
5. Дизайн: rules_genres → rules_show → brand_storm → palette_show → токены в tailwind.config и CSS-переменных → ассеты со склада.
6. web: bento-главная, экран папки, запись голоса, превью, тосты.
7. Сценарий проверки из PROMPT.md §9 и отчёт.
После каждого шага — сборка и запуск, прежде чем идти дальше.

## Команды (для разработки, не для настройки)
- Запуск всего: `docker compose up -d --build`
- Логи: `docker compose logs -f api mcp`
- Тесты: `npm test` (в корне, по всем workspaces)
- Линт: `npm run lint`

## Стиль кода
- Строгий TypeScript, ESLint + Prettier, zod для всех входов и env.
- Описания MCP-инструментов и их параметров — на английском; тексты интерфейса, README и ответы — на русском.
- Логи структурированные, уровень из `LOG_LEVEL`, без секретов.
- Маленькие модули; одна ответственность на файл.

## Готово, когда
- `docker compose up -d --build` с заполненным .env поднимает все четыре сервиса, healthcheck зелёные.
- Сценарий из PROMPT.md §9 проходит, MCP без токена отвечает 401.
- Все payload-индексы на месте (есть тест).
- В интерфейсе нет ни одной иконки/иллюстрации не из CMS.
- В репозитории нет `.env`, только `.env.example`.
- Отчёт: жанр и направление CMS, токены из palette_show, список ассетов с путями склада, чего не хватило.

<!-- preference-memory:start -->
## Проект
Название в памяти предпочтений: «Сервис моих предпочтений»

@~/.agents/skills/preference-memory/references/claude-md-rules.md
<!-- preference-memory:end -->
