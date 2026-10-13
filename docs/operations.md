# Эксплуатация

Бэкапы, перенос данных, CI/CD и деплой.

## Бэкапы

Сервис `backup` при старте и затем каждые `BACKUP_INTERVAL_HOURS` часов снимает нативные snapshot'ы всех коллекций
Qdrant (`preferences`, `folders`, служебная `preferences__service`), выгружает их в volume `backups` вместе с копией
`PREFERENCES.md` и оставляет `BACKUP_KEEP` последних копий. Копия пишется атомарно (`<время>.partial` → `<время>`),
снимки на сервере Qdrant после выгрузки удаляются.

Healthcheck — метка свежей копии: контейнер `unhealthy`, если последней копии нет или она старше
2 × `BACKUP_INTERVAL_HOURS` (`docker compose ps` сразу покажет, что бэкапы встали).

```bash
docker compose exec backup node apps/backup/dist/restore.js          # список копий
docker compose exec backup node apps/backup/dist/restore.js latest   # восстановить последнюю (или по имени)
docker compose restart api mcp                                       # подхватить восстановленные данные
docker compose cp backup:/app/backups ./backups                      # забрать копии на хост / в другое хранилище
```

**Перенос данных с локального стека на сервер** (одна команда из корня проекта, нужен SSH к серверу Dokploy и
`docker` без sudo для этого пользователя):

```bash
scripts/push-dump.sh user@ваш-сервер        # спросит подтверждение; -y — без вопроса
```

Скрипт снимает свежую копию локально, копирует её на сервер по `scp`, находит там контейнер `backup` вашего стека,
восстанавливает копию и перезапускает `api` и `mcp`. Данные на сервере заменяются; их прежняя версия остаётся в
копиях серверного сервиса `backup`.

Восстановление пересоздаёт коллекции ровно в состоянии копии — с векторами и payload-индексами. Если копия снята
с другой моделью эмбеддингов, api при следующем старте сам переиндексирует данные.

## CI/CD и деплой (GitHub Actions → Dokploy)

Два способа деплоя в Dokploy:

- **Сборка на сервере из GitHub** — compose-приложение с файлом `docker-compose.yml`. У сервисов стоит
  `pull_policy: build`: образы собираются из исходников, реестр не нужен. В Environment приложения — все переменные
  из `.env.example` (обязательные: `OPENAI_API_KEY`, `MCP_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, для прода ещё
  `PUBLIC_URL=https://ваш-домен`).
- **Готовые образы из ghcr.io** (быстрее, без сборки на сервере) — файл `docker-compose.prod.yml`, образы собирает
  GitHub Actions (ниже).

`.github/workflows/ci.yml`:

| Задача | Что делает | Когда |
|---|---|---|
| `lint` | ESLint + Prettier, typecheck всех workspaces | каждый push и pull request |
| `test` | все тесты; Qdrant поднимается как service `qdrant/qdrant:v1.19.1` | каждый push и pull request |
| `build` | образы `api`, `mcp`, `backup`, `web` → `ghcr.io/<владелец>/<репозиторий>/<сервис>:<short-sha>`, `:latest` (main), `:<тег>` (теги `v*`); кэш слоёв GitHub Actions | push в main и теги |
| `deploy` | `POST $DOKPLOY_WEBHOOK_URL` — Dokploy тянет новые образы и перезапускает стек | push в main |

Настройка один раз:

1. GitHub → Settings → Secrets and variables → Actions: секрет `DOKPLOY_WEBHOOK_URL` — «Deploy webhook»
   compose-приложения Dokploy. Без него `deploy` пропускается.
2. Dokploy: Settings → Registry — `ghcr.io`, пользователь GitHub и Personal Access Token с правом `read:packages`
   (или сделайте пакеты публичными в GitHub → Packages).
3. Dokploy: compose-приложение из этого репозитория, файл `docker-compose.prod.yml`; в Environment — ваш `.env` плюс
   `REGISTRY_IMAGE=ghcr.io/<владелец>/<репозиторий>` и `IMAGE_TAG=latest`; домен с HTTPS на сервис `web` (порт 80) и
   `PUBLIC_URL=https://ваш-домен`.

`docker-compose.prod.yml` — те же сервисы, что и `docker-compose.yml`, но без `build`: образы только из registry
(`pull_policy: always`). Откат: `IMAGE_TAG=<short-sha прошлой сборки>` в Dokploy → Redeploy.

