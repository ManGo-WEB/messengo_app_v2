#!/usr/bin/env bash
# Бэкап продакшн-БД Messengo V2 перед миграциями (по образцу V1 scripts/backup.sh).
# Запуск на сервере: DEPLOY_ROOT=/opt/messengo bash scripts/backup.sh
# Печатает путь к созданному дампу (pg_dump -Fc).
set -euo pipefail

root="${DEPLOY_ROOT:-/opt/messengo}"
project="${COMPOSE_PROJECT_NAME:-messengo-prod}"
compose=(docker compose --project-name "$project" --env-file "$root/shared/.env" -f "$root/current/compose.production.yaml")

test -f "$root/current/compose.production.yaml"

umask 077
mkdir -p "$root/backups"
backup="$root/backups/messengo-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
trap 'rm -f "$backup.partial"' EXIT

"${compose[@]}" exec -T db pg_dump -U "${POSTGRES_USER:-messengo}" -d "${POSTGRES_DB:-messengo}" -Fc > "$backup.partial"
test -s "$backup.partial"
mv "$backup.partial" "$backup"
printf '%s\n' "$backup"
