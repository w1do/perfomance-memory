# PROMPT.md — ТЗ: «Сервис моих предпочтений» (preference-memory)

Собери с нуля проект «Сервис моих предпочтений» (preference-memory): универсальная личная память «люблю / не люблю» на любые темы (код, ИИ-ассистенты, рыбалка, путешествия, конкретные проекты), разложенная по дереву папок с одним главным файлом, полностью проиндексированная в Qdrant. Агенты (Claude Code, Claude Desktop, ChatGPT) получают данные через MCP-сервер. Интерфейс — bento-карты, всё оформление берётся из моего MCP-склада CMS.

Работай по шагам, после каждого шага проверяй, что всё запускается. Перед началом проверь, что тебе доступен MCP-сервер CMS (assets_search, assets_get, palette_show, rules_genres, rules_show, rules_search, brand_storm). Если его нет — остановись и скажи мне.

## 0. Главный принцип: вся конфигурация — только .env
- Единственный способ настроить сервис — файл .env в корне. Никаких CLI-команд настройки, скриптов генерации токенов, экранов настроек с редактированием, файлов конфигурации помимо .env, ручных миграций.
- Запуск для пользователя: скопировать .env.example в .env, вписать значения, выполнить `docker compose up -d --build`. Больше ничего.
- Все сервисы читают переменные через env_file: .env в docker-compose. Значения по умолчанию — в коде (для необязательных), обязательные — без значений по умолчанию.
- Валидация env при старте каждого сервиса через zod: если обязательная переменная пуста или некорректна — сервис не стартует и пишет в лог одну понятную строку, какую переменную заполнить. Ничего не генерировать за пользователя.
- Смена любой переменной применяется перезапуском `docker compose up -d`. Если в .env поменяли OPENAI_EMBED_MODEL или EMBED_DIM и они не совпадают с сохранённой конфигурацией коллекции — api при старте сам пересоздаёт векторы и переиндексирует все точки (payload сохраняется), в логе прогресс. Без кнопок и команд.
- Секреты (ключи, токены) никогда не попадают в логи, ответы API, фронтенд и собранный бандл.
- Шаблон конфигурации — файл `.env.example` в корне (уже создан, используй его как есть; если добавляешь переменную — добавь её туда с комментарием и в таблицу README).

## 1. Поток данных
1. React: нажимаю кнопку микрофона и говорю. Примеры: «не люблю, когда ChatGPT отвечает грубо», «не люблю, когда файл с кодом больше 100 строк», «на рыбалке не люблю вставать раньше пяти», «в проекте Семейный чат люблю минимальный UI».
2. Аудио → api → OpenAI Whisper (OPENAI_STT_MODEL, язык STT_LANGUAGE) → текст. Показываю текст, можно поправить. Текстовый ввод тоже есть.
3. Обогащение через OPENAI_LLM_MODEL, строго JSON по json_schema. Модель получает текущее дерево папок и топ-3 похожих папки из Qdrant и возвращает:
   - statement — короткая чистая формулировка правила;
   - details — пояснение 1–2 фразами, только из сказанного;
   - polarity — like | dislike;
   - folder_path — путь: ["Программирование", "Код", "Не люблю"], ["Рыбалка", "Не люблю"], ["Проекты", "Семейный чат", "Люблю"]; новую папку создаёт, только если ни одна не подходит;
   - domain — programming, ai_assistants, fishing, travel, food, communication, project, other (расширяемо);
   - project — имя проекта или null;
   - applies_to — массив: ["chatgpt"], ["claude"], ["any_ai"], ["me"], ["php"], ["react"]…;
   - tags — 3–7 слов в нижнем регистре;
   - constraints — [{ "metric": "file_lines", "operator": "<=", "value": 100, "unit": "lines" }] или [];
   - strength — 1–5;
   - language.
4. Эмбеддинги: dense — OPENAI_EMBED_MODEL, EMBED_DIM, cosine, по statement + details + folder_path + tags; sparse (BM25) — считается в core (токенизация с русским стеммингом, modifier idf в Qdrant).
5. Конфликт/дубль: гибридный поиск с фильтром по domain (и project), score ≥ CONFLICT_SCORE, top 5 → LLM решает: противоречит (обновить, прежнее в history[], при смене polarity перенести в соседнюю папку) / дублирует (обновить updated_at и strength) / новое (создать).
6. Upsert в Qdrant со всеми метаданными и пересборка главного файла.

## 2. Qdrant — обязательная индексация ВСЕХ метаданных
Коллекция QDRANT_COLLECTION, именованные векторы: `dense` (EMBED_DIM, Cosine), `sparse` (modifier idf).
Payload каждой точки (все поля обязательны, пустые — null или []):
{ id, statement, details, raw_text, polarity, domain, project, applies_to[], tags[], constraints[],
  constraint_metrics[], strength, language,
  folder_id, folder_name, folder_path[], folder_ancestors[] (все префиксы пути: "Программирование", "Программирование/Код", …), folder_depth,
  source ("voice"|"text"|"mcp"), is_active, history[], created_at, updated_at }
Payload-индексы создаются при старте, идемпотентно:
- keyword: polarity, domain, project, applies_to, tags, folder_id, folder_ancestors, constraint_metrics, source, language
- integer: strength, folder_depth
- bool: is_active
- datetime: created_at, updated_at
- text (multilingual tokenizer, lowercase): statement, details
Поиск: Query API — prefetch по dense и sparse, слияние RRF, поверх filter. Любой запрос сначала сужается фильтром по метаданным, потом ранжируется векторами.

Коллекция QDRANT_FOLDERS_COLLECTION: вектор `dense` по «имя + описание + путь»; payload { id, name, parent_id, path[], ancestors[], depth, domain, description, preference_count, created_at }; индексы keyword на parent_id, ancestors, domain; integer на depth.

Коллекции, индексы и служебная точка с конфигурацией (модель эмбеддингов, размерность) создаются и проверяются автоматически при старте api.

## 3. Дерево папок и главный файл
- Дерево произвольной глубины; верхний уровень — темы и «Проекты»; листья обычно «Люблю» / «Не люблю».
- Проект = папка внутри «Проекты»; создаётся автоматически, если я говорю «создай проект X» или правило явно про новый проект.
- Главный файл PREFERENCES.md: всё дерево заголовками, под ними правила, constraints моноширинно, сила рядом. Пересобирается после каждого изменения, лежит в volume data/, отдаётся по GET /api/export.md (и ?folder=<путь> для ветки).

## 4. Архитектура
Монорепо на npm workspaces: apps/web, apps/api, apps/mcp, packages/core.
- packages/core — вся бизнес-логика: env-схема (zod), клиенты OpenAI и Qdrant, обогащение, эмбеддинги, BM25, поиск, конфликты, папки, сборка PREFERENCES.md. api и mcp используют только его.
- qdrant: qdrant/qdrant с закреплённой версией (Query API + sparse), volume qdrant_data, наружу не публикуется.
- api: Node 20 + TypeScript + Fastify — REST для фронта, volume data/.
- mcp: Node 20 + TypeScript на FastMCP (npm fastmcp, построен на официальном @modelcontextprotocol/sdk), транспорт httpStream (Streamable HTTP), путь /mcp, встроенный health-эндпоинт.
- web: React + Vite + TypeScript + Tailwind, в проде nginx; nginx проксирует /api → api, /mcp → mcp. Наружу публикуется только WEB_PORT.
- Healthcheck у всех сервисов, api и mcp ждут готовности qdrant.

## 5. REST API
Если WEB_PASSWORD задан — вход по паролю (httpOnly cookie-сессия, без токенов во фронтенде); если пуст — без авторизации. Валидация zod.
- POST /api/transcribe — audio (webm/ogg/mp3/m4a, до MAX_AUDIO_MB) → { text }.
- POST /api/preferences/preview — { text } → обогащение без сохранения.
- POST /api/preferences — { text | preview, source } → { action, preference, replaced? }.
- GET /api/preferences — фильтры: folder (с вложенными), domain, project, polarity, applies_to, tags, metric, min_strength, updated_after; q — гибридный поиск.
- PATCH/DELETE /api/preferences/:id (после правки — переэмбеддинг).
- GET/POST/PATCH/DELETE /api/folders (при переносе/переименовании — батч set_payload для folder_path и folder_ancestors вложенных точек).
- GET /api/facets, GET /api/stats, GET /api/export.md.
- GET /api/status — статус сервисов и активные модели из env (без секретов), для карточки на главной.

## 6. MCP-сервер (сервис mcp, FastMCP)
- Только FastMCP поверх официального SDK, никаких самописных JSON-RPC обработчиков.
- Авторизация через опцию authenticate FastMCP: заголовок Authorization: Bearer <MCP_TOKEN>, иначе 401. MCP_TOKEN берётся только из .env.
- Если MCP_ALLOW_WRITE=false — инструмент add_preference не регистрируется.
- Схемы параметров — zod; описания инструментов и параметров на английском, ответы — на языке правил, компактно, по папкам; большие ветки — с cursor и лимитом.
- Логи вызовов: имя инструмента, длительность, число результатов, без секретов.
Инструменты:
- get_context_for_task({ task, applies_to?, top_k? }) — ГЛАВНЫЙ: по описанию задачи определяет domain/project, фильтрует по индексам, отдаёт релевантные правила со всеми constraints. Описание: "Call this at the start of any task to load the user's likes, dislikes and hard constraints."
- get_preferences({ query, folder?, domain?, project?, polarity?, applies_to?, tags?, top_k? }) — фильтр + гибридный поиск.
- get_folder({ path, cursor? }), list_folders(), list_projects(), get_project({ name }).
- add_preference({ text, project? }) — тот же конвейер, source="mcp".
Ресурсы: `preferences://main`, шаблон `preferences://folder/{path}`.
Промпт: `apply_my_preferences` — «загрузи предпочтения через get_context_for_task и соблюдай constraints».
README: как подключить агентов (это настройка на стороне клиента, не сервиса):
- Claude Code: `claude mcp add --transport http preferences <PUBLIC_URL>/mcp --header "Authorization: Bearer <MCP_TOKEN>"`
- Claude Desktop и ChatGPT: публичный HTTPS через reverse proxy (деплой через Dokploy), URL <PUBLIC_URL>/mcp и Bearer MCP_TOKEN.

## 7. Дизайн: bento-интерфейс, всё оформление — из MCP-склада CMS
Цель: спокойный, стильный, не перегруженный UI в виде bento-сетки. Воздух, крупная типографика, одна мысль на карточку, акценты точечно.

### 7.1 Облик и токены — из CMS
1. rules_genres → выбери жанр, ближайший к веб-приложению/дашборду; rules_show прочитай целиком ДО вёрстки; точечные вопросы — rules_search.
2. brand_storm(genre, about: «личный сервис памяти предпочтений для разработчика: голосовой ввод, папки, Qdrant, MCP») → одно спокойное светлое направление с мягкими тенями.
3. palette_show(family направления) → цвета обеих схем, типографика, шкалы (размеры, отступы, радиусы, тени), стиль иконок, пары шрифтов, виды появления и движения.
4. Design tokens: tailwind.config + CSS-переменные для светлой и тёмной темы. В компонентах только токены.
5. Цвета ролей из моей схемы — смысловые акценты поверх палитры (бейджи, обводки, иконки):
   «люблю» #E0457B / #FFD6E8; «не люблю» #666 / #EDEDED; интерфейс #3A6FF7 / #D6E4FF; ИИ #8A3FFC / #E9D6FF; MCP #0FA3D1 / #D6F5FF; сервис #1BAA5C / #D6FFE4; обогащение #F07A1A / #FFE3CC; сеть #E0A800 / #FFF1C2. При конфликте по контрасту — приоритет WCAG AA.

### 7.2 Ассеты — только со склада
- Иконки: assets_search(kind:"icon") → assets_get; один стиль (по умолчанию line-black, termicons-line / universal-line), первая найденная фиксирует стиль. Нужны: микрофон, папка/открытая папка, файл, чат, поиск, фильтр, AI, разъём (MCP), карандаш, корзина, копировать, стрелки дерева, лайк/дизлайк, иконки доменов (код, рыбалка, самолёт, еда, проект).
- Иллюстрации: kind:"illustration" — акцент для hero («Cognition brain learning brain», набор tech, или близкая) и для пустых состояний.
- Фоны: kind:"background" — едва заметная текстура на фон (4–8%) и полотно «разработка / кодеры» под маской в hero, если есть.
- Декор: kind:"decor" — 2–4 мелких шейпа на страницу.
- mask_ready: true → CSS mask-image с цветом из токенов; остальное — SVG-компонент с currentColor.
- Сохраняй в apps/web/src/assets/{icons,illustrations,backgrounds,decor}; атрибуция по SOURCES.md склада — в футере.
- Нет ассета — не рисуй свой и не бери сторонние библиотеки (lucide, heroicons, unDraw запрещены); перечисли в отчёте.

### 7.3 Раскладка
Главный экран — grid 12 колонок:
- Hero (8 кол.): заголовок, подзаголовок, большая кнопка микрофона с кольцом уровня звука и таймером, шаги «Запись → Whisper → Обогащение → Индексация» с подсветкой активного; иллюстрация и фон под маской.
- Статистика (4 кол.): всего правил, полоса «люблю / не люблю», папки, проекты, последняя запись.
- Последние записи (6 кол.), Папки (6 кол., плитки с иконкой домена и счётчиком).
- Проекты (4 кол.).
- MCP (4 кол.): статус сервиса, адрес <PUBLIC_URL>/mcp, активные модели из /api/status; токен не показывается.
- PREFERENCES.md (4 кол.): тёмная карточка-превью, кнопка «Открыть».
Экран папки: слева дерево (раскрытие, счётчики, drag&drop, создание/переименование, раздел «Проекты», PREFERENCES.md сверху); сверху фильтры-чипы из /api/facets и строка гибридного поиска; справа bento-карточки «Люблю» и «Не люблю».
Карточка правила: statement крупно, details мелко, путь моноширинно, бейджи тегов и applies_to, constraints моноширинно, сила 1–5 точками, дата, история в раскрытии, редактирование полей.
Превью после записи — модальная bento-карточка: текст, предложенная папка (сменить), метаданные (править), «Сохранить». Тост с результатом.
Экрана настроек нет: вся конфигурация в .env. Переключатель темы — в шапке (хранится в localStorage).

### 7.4 Правила вида
Скругления, тени, отступы — из шкал palette_show; одна основная тень, лёгкий подъём на hover; не больше двух акцентных карточек на экран; заголовок + максимум две строки в карточке; пара шрифтов из palette_show + моноширинный для путей, тегов, constraints (иначе Cascadia Code или JetBrains Mono); анимации из palette_show, prefers-reduced-motion; светлая и тёмная тема; на мобиле одна колонка, микрофон зафиксирован внизу.

## 8. Качество
- Строгий TypeScript, ESLint + Prettier.
- Тесты core (OpenAI замокан): метаданные и constraints, выбор/создание папки и проекта, конфликт/дубль/новое, перенос при смене polarity, обновление folder_ancestors, фильтры, сборка PREFERENCES.md, валидация env (пустой MCP_TOKEN или OPENAI_API_KEY → понятная ошибка).
- Тесты mcp через in-memory транспорт FastMCP: каждый инструмент, фильтры, 401 без токена, отсутствие add_preference при MCP_ALLOW_WRITE=false.
- Тест, что все payload-индексы существуют после старта.
- Демо-данные — только через SEED_DEMO=true при пустой базе (папки ChatGPT, Программирование › Код, Программирование › PHP, Рыбалка, Проекты › Семейный чат и по 2–3 правила).
- README на русском: 1) скопировать .env.example в .env и заполнить; 2) docker compose up -d --build; таблица всех переменных .env; подключение агентов; схема payload и индексов; Mermaid-схема потока данных.

## 9. Проверка и отчёт
Создай .env из .env.example с тестовыми значениями только для прогона (реальный ключ OpenAI возьми из окружения, если он есть; иначе замокай OpenAI в тестовом режиме), `docker compose up -d --build`, healthcheck, затем сценарий:
1) «не люблю, когда ChatGPT отвечает грубо» → ChatGPT › Не люблю;
2) «люблю, когда ChatGPT отвечает дерзко» → конфликт, обновление с историей, перенос в ChatGPT › Люблю;
3) «не люблю файлы с кодом больше 100 строк» → Программирование › Код › Не люблю, file_lines <= 100;
4) «на рыбалке не люблю вставать раньше пяти» → Рыбалка › Не люблю;
5) «создай проект Дача, там люблю всё делать без покраски» → Проекты › Дача › Люблю;
6) MCP с Bearer MCP_TOKEN: get_context_for_task({task:"напиши PHP-сервис"}), get_preferences({query:"рыбалка", domain:"fishing"}), get_folder({path:"Проекты/Дача"}); запрос без токена → 401.
Покажи ответы, список payload-индексов и итоговый PREFERENCES.md. Тестовый .env после прогона удали, в репозитории остаётся только .env.example.

Короткий отчёт: что сделано; жанр и направление из CMS; токены из palette_show; все ассеты с путями склада; где ассетов не хватило; расхождения по контрасту.
