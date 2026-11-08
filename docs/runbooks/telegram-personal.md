# Runbook: Telegram личный — Secretary Mode (B3)

Статус: **🖥 серверная приёмка** — вебхук служебного бота требует публичный URL;
локально канал проверяется интеграционным тестом на фикстурах
(`tests/integration/telegram-personal.test.ts`). Механика перенесена из V1
`channels/telegram/personal/` в упрощённом виде (без таблицы кандидатов и
фонового reconciliation — при необходимости добавятся позже).

## 1. Служебный бот (создаёт владелец, один на приложение)

1. [@BotFather](https://t.me/BotFather) → `/newbot` → например, `messengo_secretary_bot`.
2. Скопировать токен → `.env`: `TELEGRAM_PERSONAL_BOT_TOKEN`.
3. Включить у бота **Telegram Business**: BotFather → `/mybots` → бот →
   *Business Mode* → включить (иначе business_connection не придёт).

## 2. Переменные окружения

```env
TELEGRAM_PERSONAL_BOT_TOKEN=<токен служебного бота>
TELEGRAM_PERSONAL_WEBHOOK_URL=https://<домен>/api/webhooks/telegram  # опционально, по умолчанию AUTH_BASE_URL
```

Секрет вебхука служебного бота — производный (sha256 от токена и AUTH_SECRET),
хранится также в конфиге каждого подключения.

## 3. Флоу привязки (оператор)

1. `POST /api/channels/telegram-personal/connect` → `{ deeplink, expiresAt }` —
   ссылка `https://t.me/<бот>?start=<nonce>` (nonce одноразовый, 15 минут — по V1).
2. Оператор открывает deeplink и нажимает **Start** — вебхук `/start <nonce>`
   привязывает telegram-user-id владельца к подключению (owner-proof).
3. Оператор включает бота для своего аккаунта: Telegram → Настройки →
   **Бизнес** → Боты → добавить служебного бота (разрешить чтение и отправку
   личных сообщений).
4. Telegram присылает `business_connection` (enabled) — подключение → **ACTIVE**.
   Статус: `GET /api/channels/telegram-personal/:id/status`
   (`{ status, ownerLinked, businessLinked }`).

## 4. Работа канала

- Входящие личные сообщения приходят апдейтом `business_message`;
  **каждый собеседник = отдельный диалог** (`peer:<telegram-user-id>`).
- Ответ оператора — `sendMessage` с `business_connection_id` (от имени владельца,
  через Telegram Business).
- Сообщения от самого владельца (отправленные в других клиентах) не попадают в Inbox.

## 5. Ограничения (Telegram Business)

- Ответы возможны только в чатах, разрешённых настройками Business-бота
  (архив/мут/новые чаты — управляются в настройках Telegram владельца).
- Один бизнес-бот на аккаунт пользователя Telegram; смена бота — через настройки Telegram.
- Отвязка аккаунта владельцем в Telegram не гасит подключение мгновенно —
  ошибки отправки переведут канал в ERROR (диагностика — B5).
