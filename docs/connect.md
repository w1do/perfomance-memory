# Подключение агентов

Адрес MCP-сервера, токен и навык для клиентов. Справочник по навыку — `skills/preference-memory/references/connect.md`.

Это настройка на стороне клиента, не сервиса. Агенту нужны два значения: адрес `<PUBLIC_URL>/mcp` и заголовок
`Authorization: Bearer <MCP_TOKEN>` (токен — из вашего `.env`). Без токена или с неверным токеном сервер отвечает
`401`. В веб-интерфейсе токен не показывается — только адрес.

### Claude Code — локально

Сервис запущен (`docker compose up -d`), команда выполняется в папке проекта — токен подставляется прямо из `.env`,
вводить и копировать его руками не нужно:

```bash
cd preference-memory
claude mcp add --transport http --scope user preferences http://localhost:3000/mcp \
  --header "Authorization: Bearer $(grep '^MCP_TOKEN=' .env | cut -d= -f2)"
```

- `--scope user` — сервер доступен во всех ваших проектах; без флага — только в текущей папке.
- Если `WEB_PORT` не `3000`, поменяйте порт в адресе.
- Внутри уже открытой сессии Claude Code команду можно запустить с префиксом `!`.

**Проверка**

1. Откройте **новую** сессию `claude` — уже запущенная сессия новый сервер не подхватит.
2. Команда `/mcp` — сервер `preferences` в статусе *connected*, 7 инструментов (6 при `MCP_ALLOW_WRITE=false`).
3. Попросите агента:
   - «Вызови get_context_for_task для задачи „напиши PHP-сервис“» — вернутся правила программирования и блок
     «Жёсткие ограничения» (например, `file_lines <= 100 lines`);
   - «Покажи мои предпочтения по рыбалке» — вызовется `get_preferences`;
   - «Запомни: не люблю, когда в коде нет тестов» — `add_preference`; новое правило появится в интерфейсе с
     источником `mcp`.
4. Готовый промпт: `/mcp__preferences__apply_my_preferences` — агент сам загрузит контекст и будет соблюдать
   ограничения.

Проверить сервер без Claude Code (ожидается `HTTP 401` без токена и `HTTP 200` с токеном):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -H "Authorization: Bearer $(grep '^MCP_TOKEN=' .env | cut -d= -f2)" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

**Если не работает**

| Симптом | Причина и решение |
|---|---|
| В `/mcp` статус *failed*, в логе `401` | Токен в Claude Code не совпадает с токеном запущенного сервиса (например, `MCP_TOKEN` поменяли в `.env`, но не перезапустили). Выполните `docker compose up -d`, затем `claude mcp remove preferences --scope user` и добавьте сервер заново командой выше |
| `connection refused` | Сервис не запущен или другой порт: `docker compose ps`, проверьте `WEB_PORT` |
| Нет инструмента `add_preference` | В `.env` стоит `MCP_ALLOW_WRITE=false` |
| Сервер есть, но агент его не вызывает | Попросите явно или используйте промпт `/mcp__preferences__apply_my_preferences` |

Смена `MCP_TOKEN`: поменяйте значение в `.env` → `docker compose up -d` → переподключите сервер в каждом агенте.

### Claude Code — удалённый сервер

```bash
claude mcp add --transport http --scope user preferences https://ваш-домен/mcp --header "Authorization: Bearer <MCP_TOKEN>"
```

### Claude Desktop и ChatGPT

Им нужен публичный **HTTPS**-адрес — `localhost` не подойдёт. Опубликуйте сервис через reverse proxy (например,
деплой в Dokploy с доменом и TLS) и укажите в `.env` `PUBLIC_URL=https://ваш-домен`.

**Claude.ai и Claude Desktop:** Customize → Connectors → Add custom connector → URL `https://ваш-домен/mcp` →
Continue → в **Request headers** выберите **`x-api-key`**, значение — `MCP_TOKEN` (без слова `Bearer`). Заголовок
`authorization` там недоступен: он занят под OAuth. Сервер принимает токен в `X-Api-Key` так же, как в
`Authorization: Bearer`. Коннекторы общие для аккаунта — в Claude Desktop он появится сам.

**ChatGPT** статичный токен не передаёт (только OAuth); нужен Secure MCP Tunnel или OAuth на стороне сервиса.

### Навык `preference-memory` для любых агентов

В `skills/preference-memory/` лежит навык в открытом формате Agent Skills: он учит агента загружать предпочтения в
начале задачи, соблюдать жёсткие ограничения, отвечать на вопросы «что я люблю» и сохранять новые правила.

| Файл | Зачем |
|---|---|
| `SKILL.md` | инструкции для агента |
| `references/tools.md` | параметры инструментов и формат ответов |
| `references/connect.md` | подключение сервера и навыка: Claude Code, Claude.ai/Desktop, ChatGPT, Codex, Cursor, VS Code/Copilot, Gemini CLI и др. |
| `references/claude-md-rules.md` | правила для проекта: «сначала предпочтения и сверка — потом реализация» |
| `references/agent-instructions.md` | короткая версия для custom instructions |
| `scripts/pm.mjs` | запасной клиент без зависимостей (Node ≥ 18) для агентов без MCP |
| `scripts/setup-project.mjs` | добавляет правила и хук в проект одной командой |
| `scripts/require-preferences.mjs` | хук Claude Code: не даёт править файлы, пока предпочтения не загружены |

**Установка глобально** (Claude Code и все агенты, читающие `~/.agents/skills`: Codex, Cursor, VS Code/Copilot,
Gemini CLI, Zed, Junie):

```bash
ln -s "$PWD/skills/preference-memory" ~/.agents/skills/preference-memory
ln -s ../../.agents/skills/preference-memory ~/.claude/skills/preference-memory
```

**Claude.ai и Claude Desktop:** соберите ZIP (`cd skills && zip -r preference-memory.zip preference-memory`) и
загрузите его в Customize → Skills → Upload a skill. Облачным клиентам сервер нужен по публичному HTTPS.

### Правила для каждого проекта: сначала предпочтения, потом код

Одна команда добавляет в проект блок правил в `CLAUDE.md` и хук-защёлку в `.claude/settings.json`:

```bash
node ~/.agents/skills/preference-memory/scripts/setup-project.mjs /путь/к/проекту --name "Семейный чат"
#   --inline     вставить текст правил целиком вместо строки-импорта
#   --agents-md  продублировать правила в AGENTS.md (Codex, Cursor, Copilot, Gemini, Zed…)
#   --no-hook    без хука
```

В `CLAUDE.md` появится:

```markdown
## Проект
Название в памяти предпочтений: «Семейный чат»

@~/.agents/skills/preference-memory/references/claude-md-rules.md
```

Что это даёт:

1. Агент **до любой правки** вызывает `get_context_for_task` (с названием проекта), `get_project` и, если нужно,
   `get_preferences`. Хук гарантирует это жёстко: `Write`/`Edit` блокируются, пока предпочтения не загружены (обход —
   ответ пользователя «без предпочтений», например, если сервис лежит).
2. Агент сверяет план с предпочтениями — жёсткие ограничения → «не люблю» → «люблю» → конфликты с задачей — и при
   конфликте спрашивает до начала работы.
3. Перед сдачей проверяет ограничения фактами (например, `wc -l` для `file_lines`), а в итоговом ответе есть раздел
   «Сверка с предпочтениями».

Правила живут в одном файле — правка `claude-md-rules.md` сразу действует во всех проектах. При первом запуске
Claude Code попросит разрешить импорт внешнего файла; если не хотите импорт — `--inline`. Название проекта должно
совпадать с папкой в «Проекты» сервиса (иначе агент получит общие правила без проектных).

