# Runbook: деплой Messengo V2 на VDS messengo.ru

Статус: **заготовка (фаза A5)**. Реальные доступы к серверу владельц предоставит в фазе G —
после этого шаг «Деплой по SSH» в `.github/workflows/deploy.yml` наполняется фактическими
командами по этому runbook'у. До тех пор workflow только проверяет наличие секретов.

## 1. Секреты и переменные репозитория (настраивает владелец вручную)

GitHub → **ManGo-WEB/messengo_app_v2** → Settings:

| Где | Имя | Значение |
|---|---|---|
| Secrets and variables → Actions → **Secrets** | `VDS_SSH_KEY` | приватный SSH-ключ для входа на VDS |
| Secrets and variables → Actions → **Secrets** | `VDS_KNOWN_HOSTS` | вывод `ssh-keyscan messengo.ru` (защита от MITM) |
| Secrets and variables → Actions → **Variables** | `VDS_HOST` | `messengo.ru` (или IP VDS) |
| Secrets and variables → Actions → **Variables** | `VDS_USER` | пользователь деплоя на VDS |

Секреты приложения на самом сервере лежат в `/opt/messengo/shared/.env`
(см. `.env.example`: `POSTGRES_PASSWORD`, `AUTH_SECRET`, `AUTH_BASE_URL`, `CHANNEL_SECRET_KEY`,
`SMTP_URL`, `MAIL_FROM`, `MAIL_TRANSPORT=smtp`).

## 2. Порядок деплоя (каждый релиз)

1. Убедиться, что проверки Checks зелёные на коммите main.
2. Actions → **Deploy VDS** → Run workflow (ветка `main`).
3. На сервере workflow выполняет:
   ```bash
   cd /opt/messengo/current && git pull origin main
   docker build --target runtime -t messengo:$(git rev-parse --short HEAD) .
   DEPLOY_ROOT=/opt/messengo bash scripts/backup.sh        # бэкап БД ДО миграций
   docker compose --project-name messengo-prod \
     --env-file /opt/messengo/shared/.env \
     -f compose.production.yaml run --rm web bun run db:migrate:deploy
   docker compose --project-name messengo-prod \
     --env-file /opt/messengo/shared/.env \
     -f compose.production.yaml up -d
   ```
4. Проверка после деплоя: `curl https://messengo.ru/api/health` →
   `{"status":"ok","worker":{"alive":true,...}}`.
5. Откат: восстановить дамп из `/opt/messengo/backups/…dump` (`pg_restore`) и вернуть
   предыдущий образ/коммит.

Бэкапы хранятся в `/opt/messengo/backups/` — настроить регулярность и чистку в фазе G.

## 3. Branch protection на main (настраивает владелец вручную)

Settings → Branches → Add branch ruleset (или classic rule) для `main`:

- ✅ Require a pull request before merging (запрет прямых push в main);
- ✅ Require status checks to pass before merging → обязательный check
  **«Bun lint + typecheck + tests + build»** (имя job из `checks.yml`);
- ✅ Require branches to be up to date before merging;
- Право на обход (bypass) — только владелец.

После включения правила слияние PR возможно только с зелёными проверками.

## 4. Что осталось на фазу G (продакшн-готовность)

- Доступы к VDS и первый реальный деплой (включение SSH-шага в deploy.yml).
- HTTPS/реверс-прокси (по образцу V1: Caddy), SECRET_KEY/SMTP-доступы для прод-писем.
- Мониторинг, логи, регулярные бэкапы (cron), финальная приёмка серверных КП фаз B–C (🖥).
