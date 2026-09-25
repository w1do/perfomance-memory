# Подключение сервера `preferences` и навыка к агентам

Нужны два значения из `.env` сервиса: адрес `<PUBLIC_URL>/mcp` (локально `http://localhost:3000/mcp`) и
`MCP_TOKEN`. В примерах токен берётся из переменной окружения `PREFERENCES_MCP_TOKEN`:

```bash
export PREFERENCES_MCP_TOKEN="$(grep '^MCP_TOKEN=' /путь/к/preference-memory/.env | cut -d= -f2)"
```

Сверено с официальной документацией клиентов на 2026-09-25; форматы меняются — при расхождении верьте доке клиента.

## Содержание
- [Сводка](#сводка)
- [Установка навыка](#установка-навыка)
- [Правила в проекте (CLAUDE.md / AGENTS.md)](#правила-в-проекте)
- [Claude Code](#claude-code) · [Claude.ai и Claude Desktop](#claudeai-и-claude-desktop) · [ChatGPT](#chatgpt) ·
  [Codex](#codex-cli-ide-chatgpt-desktop) · [Cursor](#cursor) · [VS Code + Copilot](#vs-code--github-copilot) ·
  [Gemini CLI](#gemini-cli) · [Другие](#другие-клиенты)
- [Проблемы](#проблемы)

## Сводка

| Клиент | Bearer-заголовок | Токен из переменной | Навык (глобально) |
|---|---|---|---|
| Claude Code | да | `${VAR}` в `.mcp.json` | `~/.claude/skills/` |
| Claude.ai / Claude Desktop (коннектор) | только бета «Request headers», нужен публичный HTTPS | нет | загрузка ZIP |
| Claude Desktop → localhost | через мост `mcp-remote` | `env` в конфиге | загрузка ZIP |
| ChatGPT web | **нет** (OAuth / без авторизации) — обход через Secure MCP Tunnel | `env:` в tunnel-client | загрузка ZIP (Business+) |
| Codex (CLI, IDE, ChatGPT desktop) | да | `bearer_token_env_var` | `~/.agents/skills/` |
| Cursor | да | `${env:VAR}` | `~/.agents/skills/`, `~/.cursor/skills/` |
| VS Code + Copilot | да | `${input:id}` | `~/.agents/skills/`, `~/.copilot/skills/` |
| Gemini CLI | да (`httpUrl`) | `${VAR}` | `~/.agents/skills/`, `~/.gemini/skills/` |
| Zed, Junie | да | не описано | `~/.agents/skills/`, `~/.junie/skills/` |
| Cline | да | не описано | `~/.cline/skills/` (`.agents` не читает) |

## Установка навыка

Навык — папка `preference-memory/` (SKILL.md + references/ + scripts/) в формате Agent Skills.

- **Один источник для большинства агентов:** положите папку (или симлинк) в `~/.agents/skills/preference-memory`,
  а для Claude Code — симлинк `~/.claude/skills/preference-memory → ~/.agents/skills/preference-memory`.
  `~/.agents/skills` читают Codex, Cursor, VS Code/Copilot, Gemini CLI, Zed, Junie, Devin; Claude Code читает
  `~/.claude/skills`; Cline — `~/.cline/skills`.
- **В проект:** `.agents/skills/preference-memory` + симлинк `.claude/skills/preference-memory`.
- **Claude.ai / Claude Desktop:** Customize → Skills → «+» → Upload a skill → ZIP, внутри которого папка
  `preference-memory/` (имя папки = `name` в SKILL.md). Нужна включённая «Code execution and file creation».
- **ChatGPT:** Skills → Create → Upload (ZIP) — доступно на части планов.

## Правила в проекте

Чтобы агент в проекте **сначала** получал предпочтения и сверял с ними план, а потом писал код, добавьте правила
из `references/claude-md-rules.md`:

- **Claude Code** — в `CLAUDE.md` проекта одной строкой-импортом (Claude Code один раз попросит разрешить импорт
  внешнего файла) или вставкой текста целиком:
  ```markdown
  ## Проект
  Название в памяти предпочтений: «<Название>»

  @~/.agents/skills/preference-memory/references/claude-md-rules.md
  ```
  Жёсткая гарантия «никаких правок до загрузки предпочтений» — хук `scripts/require-preferences.mjs` в
  `.claude/settings.json` проекта (см. README навыка/сервиса или `scripts/setup-project.mjs`).
- **Остальные агенты** — тот же текст в `AGENTS.md` (Codex, Cursor, Copilot, Zed, Junie, Devin, Cline читают его;
  Gemini — если в `settings.json` задано `"context": {"fileName": ["AGENTS.md", "GEMINI.md"]}`), в
  `.cursor/rules/*.mdc` (только `.mdc`), `.github/copilot-instructions.md`, custom instructions ChatGPT. Короткая
  версия для полей с лимитом символов — `references/agent-instructions.md`.
- Если в проекте есть и `CLAUDE.md`, и `AGENTS.md`, Claude Code читает только `CLAUDE.md` — добавьте в него
  строку `@AGENTS.md`.

## Claude Code

```bash
claude mcp add --transport http --scope user preferences http://localhost:3000/mcp \
  --header "Authorization: Bearer $PREFERENCES_MCP_TOKEN"
```

Токен сохранится в `~/.claude.json` открытым текстом. Чтобы хранить только ссылку на переменную — `.mcp.json`
проекта:

```json
{ "mcpServers": { "preferences": {
  "type": "http",
  "url": "${PREFERENCES_MCP_URL:-http://localhost:3000/mcp}",
  "headers": { "Authorization": "Bearer ${PREFERENCES_MCP_TOKEN}" } } } }
```

Проверка: новая сессия → `/mcp` → `preferences` connected, 7 инструментов.

## Claude.ai и Claude Desktop

- **Коннектор (web и Desktop):** Customize → Connectors → Add custom connector → URL `https://ваш-домен/mcp`.
  Серверу нужен **публичный HTTPS** — к нему ходит облако Anthropic, `localhost` недоступен. Bearer задаётся в
  разделе **Request headers** (бета, есть не у всех): заголовок `authorization`, значение целиком `Bearer <TOKEN>`.
  Нет такого раздела — Bearer передать нельзя.
- **Desktop → локальный сервер:** мост `mcp-remote` в `claude_desktop_config.json`
  (Windows `%APPDATA%\Claude\`, macOS `~/Library/Application Support/Claude/`):
  ```json
  { "mcpServers": { "preferences": {
    "command": "npx",
    "args": ["-y", "mcp-remote", "http://localhost:3000/mcp", "--transport", "http-only",
             "--header", "Authorization:${PREFS_AUTH_HEADER}"],
    "env": { "PREFS_AUTH_HEADER": "Bearer <TOKEN>" } } } }
  ```
  (без пробела в `Authorization:${…}` — у Desktop на Windows есть баг с экранированием аргументов).

## ChatGPT

- **Web (developer mode):** Settings → Security and login → Developer mode; сервер добавляется как app.
  Поддерживаются только OAuth, «No Authentication» и Mixed — **статичный Bearer не передать**. Варианты: Secure MCP
  Tunnel от OpenAI (`tunnel-client` сам добавит заголовок: `extra_headers: { Authorization: env:PREFS_AUTH_HEADER }`)
  или OAuth на стороне сервиса.
- **ChatGPT desktop** использует конфиг Codex — см. ниже.
- Постоянные правила — Settings → Personalization → Custom instructions (короткая версия:
  `references/agent-instructions.md`).

## Codex (CLI, IDE, ChatGPT desktop)

```bash
codex mcp add preferences --url http://localhost:3000/mcp --bearer-token-env-var PREFERENCES_MCP_TOKEN
```

```toml
# ~/.codex/config.toml
[mcp_servers.preferences]
url = "http://localhost:3000/mcp"
bearer_token_env_var = "PREFERENCES_MCP_TOKEN"
```

Если переменная не задана, Codex подключится **без** авторизации и получит 401. Правила — `~/.codex/AGENTS.md` или
`AGENTS.md` проекта.

## Cursor

`~/.cursor/mcp.json` (или `.cursor/mcp.json` проекта):

```json
{ "mcpServers": { "preferences": {
  "url": "http://localhost:3000/mcp",
  "headers": { "Authorization": "Bearer ${env:PREFERENCES_MCP_TOKEN}" } } } }
```

Правила — `AGENTS.md` или `.cursor/rules/preferences.mdc` (с `alwaysApply: true`).

## VS Code + GitHub Copilot

`.vscode/mcp.json` (или команда «MCP: Open User Configuration»):

```json
{ "inputs": [ { "type": "promptString", "id": "prefs-token", "description": "Preferences MCP token", "password": true } ],
  "servers": { "preferences": {
    "type": "http", "url": "http://localhost:3000/mcp",
    "headers": { "Authorization": "Bearer ${input:prefs-token}" } } } }
```

Copilot CLI: `copilot mcp add --transport http --header "Authorization: Bearer $PREFERENCES_MCP_TOKEN" preferences http://localhost:3000/mcp`.
Правила — `.github/copilot-instructions.md` или `AGENTS.md`.

## Gemini CLI

```bash
gemini mcp add --transport http --scope user --header "Authorization: Bearer $PREFERENCES_MCP_TOKEN" \
  preferences http://localhost:3000/mcp
```

В `settings.json` ключ `httpUrl` (Streamable HTTP; `url` — это SSE). Навыки: `gemini skills link <путь>` или
`~/.agents/skills`. Правила — `GEMINI.md` (или `AGENTS.md` через `context.fileName`).

## Другие клиенты

Любой MCP-клиент с Streamable HTTP и произвольными заголовками: URL `…/mcp`, заголовок
`Authorization: Bearer <MCP_TOKEN>`. Zed — `context_servers` с `url` и `headers`; Junie — `~/.junie/mcp/mcp.json`;
Cline — `"type": "streamableHttp"`; JetBrains AI Assistant — заголовков в доке нет, используйте мост `mcp-remote`.
Клиента нет совсем, но есть терминал — `scripts/pm.mjs`.

## Проблемы

| Симптом | Что делать |
|---|---|
| 401 | Токен в клиенте ≠ `MCP_TOKEN` запущенного сервиса. После смены в `.env`: `docker compose up -d` и переподключить клиент |
| `connection refused` | Сервис не запущен или другой порт: `docker compose ps`, `WEB_PORT` |
| Облачный клиент не видит сервер | Нужен публичный HTTPS (reverse proxy, например Dokploy) |
| Нет `add_preference` | В `.env` `MCP_ALLOW_WRITE=false` |
| Навык не срабатывает | Проверьте путь установки для клиента; попросите явно «загрузи мои предпочтения» |
