# Messengo V2

Мультитенантный SaaS-агрегатор мессенджеров: единый Inbox (VK, Telegram ×2,
Facebook, Instagram, WhatsApp, MAX) + RAG-база знаний и AI-черновики.
Документация: `docs/PRD.md`, `docs/План разработки.md`.

## Стек

- **Next.js** (App Router, TypeScript strict) — UI и API
- **Bun** — рантайм и менеджер пакетов (lock-файл `bun.lock`)
- **PostgreSQL + Prisma** — база данных (миграции в `prisma/`)
- **Docker** — контейнеры на базе `oven/bun`

## Запуск (WSL под Windows)

```bash
bun install
bun run dev          # http://localhost:3000
curl localhost:3000/api/health   # {"status":"ok"}
```

## База данных

```bash
cp .env.example .env     # заполнить пароли/секреты
docker compose up -d db  # PostgreSQL 18 (localhost:5432)
bun run db:migrate       # prisma migrate dev
```

## Проверки

```bash
bun run lint         # ESLint
bun run typecheck    # tsc --noEmit
bun test             # unit-тесты (bun:test)
bun run build        # продакшн-сборка
```

## Запуск в Docker (образ oven/bun)

```bash
docker run --rm -v "$PWD":/app -w /app -p 3000:3000 oven/bun bun run dev
```

Рабочая среда — WSL (Ubuntu). Дизайн-прототип: `design/prototype/`.
