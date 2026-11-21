# Runbook: WhatsApp через Green API (C2)

Канал WhatsApp подключается через шлюз Green API «как новое устройство» (QR-авторизация).
Спецификации сверены с официальной документацией https://green-api.com/docs (21.11.2026):
`createInstance`, `qr`, `getStateInstance`, `setSettings`, `sendMessage`, вебхуки
`incomingMessageReceived` / `outgoingMessageStatus` / `stateInstanceChanged`, заголовок
вебхука `Authorization` (Webhook Endpoint).

## 1. Режимы подключения

### Тариф Developer (бесплатный, для разработки и пилота)

- В личном кабинете Green API создать 1 инстанс (лимит тарифа) с тарифом Developer.
- Ограничения: 3 чата для взаимодействия; лимиты на отдельные методы (checkWhatsapp — 100/мес
  и т.п.); лимит на количество отправляемых сообщений снят с 2023 г.
- В Messengo: POST `/api/channels/whatsapp/connect` с телом
  `{ "idInstance": "<из кабинета>", "apiTokenInstance": "<токен инстанса>" }`.

### Партнёрский аккаунт (промышленная эксплуатация)

- Ключ партнёра запрашивается у техподдержки GREEN-API (sales@green-api.com).
- Инстансы создаются программно: `POST {{partnerApiUrl}}/partner/createInstance/{{partnerToken}}`;
  посуточная тарификация за каждый созданный и не удалённый инстанс (списание в 00:00 UTC+3).
- В Messengo: тот же POST `/api/channels/whatsapp/connect` без кредов — инстанс создаётся
  автоматически, если задан `GREEN_API_PARTNER_TOKEN`.
- Особенность документации (зафиксирована в PR C1): `typeInstance` в теле запроса
  createInstance отсутствует — тип мессенджера приходит в ответе (`whatsapp` | `telegram` |
  `v3` для MAX). Проверить фактическое значение при первой серверной приёмке 🖥.

## 2. Окружение (.env)

| Переменная | Назначение |
|---|---|
| `GREEN_API_BASE_URL` | хост instance-API (`apiUrl`), по умолчанию `https://api.green-api.com` |
| `GREEN_API_PARTNER_API_URL` | хост партнёрского API (`partnerApiUrl` из кабинета) |
| `GREEN_API_PARTNER_TOKEN` | ключ партнёра; пусто — только Developer-режим |
| `GREEN_API_WEBHOOK_URL` | публичный URL вебхука: `https://…/api/webhooks/greenapi` |
| `GREEN_API_WEBHOOK_TOKEN` | `webhookUrlToken`; если пуст — производный от `AUTH_SECRET` |

Секреты инстансов (`apiTokenInstance`) хранятся только зашифрованными в
`ChannelConnection.config` (CHANNEL_SECRET_KEY, AES-256-GCM).

## 3. Флоу подключения (QR)

1. `initiateConnect` → подключение WHATSAPP в статусе PENDING; при партнёрском режиме
   создаётся инстанс, затем `setSettings` включает вебхуки (`incomingWebhook`,
   `outgoingWebhook`, `outgoingAPIMessageWebhook`, `outgoingMessageWebhook`,
   `stateWebhook`) и `webhookUrl/webhookUrlToken`.
2. Фронт (фаза D) показывает QR из ответа `qr` (PNG в base64, `data:image/png;base64,…`).
   По документации QR обновляется каждые 20 с — UI опрашивает
   GET `/api/channels/whatsapp/[id]/status` раз в 1–2 с и обновляет код.
3. Пользователь сканирует QR из WhatsApp Business на телефоне.
4. `getStateInstance` → `authorized` (через статус-эндпоинт или вебхук
   `stateInstanceChanged`) → подключение ACTIVE; настройки вебхуков применяются повторно.

**КП C2 (реализовано):** инстанс в состоянии `notAuthorized` дольше 10 минут → подключение
ERROR (reason `QR_EXPIRED`). Окно — `QR_EXPIRY_MS` в `src/server/channels/greenapi/runtime.ts`.

## 4. Ограничения WhatsApp (схема docs/Схема подключения WhatsApp.md)

- **Число подключённых устройств**: WhatsApp ограничивает количество связанных устройств.
  Ошибка «Подключено максимальное количество устройств» surfaced оператору: инстанс остаётся
  `notAuthorized` → через 10 мин ERROR; оператору — разлогинить лишнее устройство/инстанс
  (метод `logout`) и повторить подключение.
- **Телефон в сети раз в 14 дней**: устройство, привязанное к инстансу, должно выходить в
  сеть минимум раз в 14 дней, иначе WhatsApp разлогинивает его → инстанс `notAuthorized`
  → воркер помечает подключение ERROR (см. §6). Напоминать оператору в UI (фаза D).

## 5. Обмен сообщениями

- Входящие: вебхук `incomingMessageReceived` → общий пайплайн (Contact по `sender`,
  conversationKey = `chatId`, дедупликация по `idMessage`). Текстовые сообщения
  (`typeMessage: textMessage`); медиа и прочие типы — по мере появления в фазах D/E.
- Исходящие: адаптер `sendMessage` → Green API `sendMessage` (лимит текста 20 000 символов).
  Сетевые ошибки/таймауты → статус UNKNOWN, не ломают диалог.
- Reconcile: уведомления `outgoingMessageStatus` (sent/delivered/read → SENT;
  failed/noAccount/notInGroup → FAILED с `description`) закрывают UNKNOWN-исходы
  отправки. Ключ сверки — `Message.externalId` (idMessage из ответа sendMessage).
- Идемпотентность вебхуков: Green API повторяет уведомления при недоступности сервера —
  повторы отсекаются дедупликацией InboundEvent.

## 6. Мониторинг (воркер)

`checkGreenApiInstances` (раз в 5 минут, план C2 п.5):
- ACTIVE + `notAuthorized`/`blocked`/`suspended` → ERROR подключение;
- PENDING + `notAuthorized` > 10 мин → ERROR;
- `starting`/`sleepMode` — транзиентные, статус не меняют (до 5 минут до `authorized`;
  дольше — перезапуск `reboot` по документации, вручную).

Уведомление оператору: пока нет UI (фаза D) — лог воркера
`greenapi: подключение … → ERROR, состояние …`. В фазе D — уведомление на экране подключений.

## 7. Чеклист серверной приёмки 🖥 (реальный инстанс)

1. Создать инстанс (Developer или партнёрский), заполнить `.env` на сервере.
2. Подключение через UI/API → QR отображается → сканировать с телефона → ACTIVE.
3. Входящее: написать с другого телефона в привязанный WhatsApp → сообщение в диалоге.
4. Исходящее: ответить из интерфейса → доставлено («две галочки»), статус SENT.
5. Reconcile: прервать сеть на момент отправки (пример) → статус UNKNOWN → после
   восстановления уведомление `outgoingMessageStatus` переводит в SENT.
6. Отвал устройства: разлогинить устройство в WhatsApp (или выключить на 14+ дней в
   песочнице) → подключение ERROR в течение 5 минут (воркер) / по вебхуку.
7. Отключение подключения: DELETE `/api/channels/[id]` → DISCONNECTED, секреты затёрты.
   Полное снятие — `logout`/удаление инстанса в кабинете Green API (партнёрский —
   deleteInstanceAccount, иначе списание за неиспользуемый инстанс).
