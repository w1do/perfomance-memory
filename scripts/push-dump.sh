#!/usr/bin/env bash
# Переносит данные локального стека на сервер одной командой:
#   свежий бэкап Qdrant (+ PREFERENCES.md) → scp на сервер → restore в контейнере backup → restart api и mcp.
# Использование (из корня проекта):  scripts/push-dump.sh user@server [-y]
#   user@server — SSH-доступ к серверу Dokploy (пользователь должен уметь `docker` без sudo);
#   -y          — не спрашивать подтверждение.
# Данные на сервере ЗАМЕНЯЮТСЯ копией. Страховка: сервис backup на сервере уже хранит свои копии
# (restore.js без аргументов покажет список) — откатиться можно так же, как описано в README «Бэкапы».
set -euo pipefail

TARGET="${1:?Укажите сервер: scripts/push-dump.sh user@server [-y]}"
YES="${2:-}"
cd "$(dirname "$0")/.."

latest() {
  docker compose exec -T backup ls /app/backups </dev/null 2>/dev/null | grep -v '\.partial$' | sort | tail -1 || true
}

echo "1/4 Снимаю свежую копию локально…"
before="$(latest)"
docker compose restart backup </dev/null >/dev/null 2>&1
name=""
for _ in $(seq 1 60); do
  name="$(latest)"
  [ -n "$name" ] && [ "$name" != "$before" ] && break
  sleep 2
done
if [ -z "$name" ] || [ "$name" = "$before" ]; then
  echo "Копия не появилась — смотрите: docker compose logs backup" >&2
  exit 1
fi
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
docker compose cp "backup:/app/backups/$name" "$tmp/$name" </dev/null >/dev/null 2>&1
echo "    копия $name ($(du -sh "$tmp/$name" | cut -f1))"

if [ "$YES" != "-y" ]; then
  read -r -p "Заменить данные на $TARGET копией $name? [y/N] " answer
  [[ "$answer" =~ ^[YyДд]$ ]] || { echo "Отменено."; exit 0; }
fi

echo "2/4 Копирую на $TARGET…"
ssh "$TARGET" "rm -rf /tmp/pm-dump && mkdir -p /tmp/pm-dump"
scp -rq "$tmp/$name" "$TARGET:/tmp/pm-dump/"

echo "3/4 Восстанавливаю на сервере…"
ssh "$TARGET" bash -s -- "$name" <<'REMOTE'
set -euo pipefail
name="$1"
c="$(docker ps --format '{{.Names}}' | grep -E '(preference|perfomance|performance)-memory.*-backup-1$' | head -1)"
if [ -z "$c" ]; then
  echo "На сервере не найден контейнер backup стека preference-memory (docker ps)" >&2
  exit 1
fi
prefix="${c%-backup-1}"
echo "    стек: $prefix"
docker cp "/tmp/pm-dump/$name" "$c:/app/backups/$name"
docker exec "$c" node apps/backup/dist/restore.js "$name"
echo "4/4 Перезапускаю api и mcp…"
docker restart "$prefix-api-1" "$prefix-mcp-1" >/dev/null
rm -rf /tmp/pm-dump
REMOTE

echo "Готово: данные с локального стека перенесены на $TARGET."
