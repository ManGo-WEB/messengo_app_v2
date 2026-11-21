# Runbook: MAX через Green API (C3)

Канал MAX подключается через нативную интеграцию Green API «как новое устройство»
(QR-авторизация, при необходимости — 2FA-пароль). Спецификации сверены с официальной
документацией MAX API https://green-api.com/v3/docs (21.11.2026): `qr`,
`sendAuthorizationPassword`, `getStateInstance`, `sendMessage`, вебхуки
`incomingMessageReceived` / `outgoingMessageStatus` / `stateInstanceChanged`, заголовок
вебхука `Authorization`.

Отличия MAX от WhatsApp (C2) — по фактической документации:

| Аспект | WhatsApp (C2) | MAX (C3) |
|---|---|---|
| Состояния инстанса | notAuthorized, authorized, blocked, sleepMode (устар.), starting, yellowCard (устар.), suspended | notAuthorized, authorized, blocked, starting, suspended, **pendingPassword** (2FA) |
| 2FA | passkeyRequired в QR-ответе | QR → pendingPassword → `sendAuthorizationPassword {password}` |
| Обновление QR | каждые 20 с (опрос ~1–2 с) | каждые **5 с** |
| Лимит текста sendMessage | 20 000 символов | **4 000** символов |
| chatId | `7999…@c.us`, группы `…@g.us` | числовой id (`"10000000"`), телефон `7999…@c.us`, группы **с минусом** (`"-698…"`) |
| typeInstance (ответ createInstance) | `whatsapp` | **`v3`** |
| QR-ответ, типы | qrCode/timeout/error/passkeyRequired/alreadyLogged | qrCode/**already_registered**/error (timeout, not_ready, connection_closed) |

## 1. Режимы подключения

Как и для WhatsApp (см. docs/runbooks/whatsapp-greenapi.md §1): тариф Developer (креды
инстанса из личного кабинета в `POST /api/channels/max/connect` с `{ idInstance,
apiTokenInstance }`) либо партнёрский ключ (`GREEN_API_PARTNER_TOKEN` — инстанс создаётся
через API автоматически; в ответе `typeInstance: "v3"`).

## 2. Флоу подключения (QR + 2FA)

1. `initiateConnect` → подключение MAX в статусе PENDING + QR (PNG base64).
2. UI (фаза D) опрашивает GET `/api/channels/max/[id]/status` (QR обновляется каждые 5 с).
3. Пользователь: MAX → «Профиль» → «Устройства» → «Войти по QR-коду» → сканирует.
4. **Если на аккаунте включена 2FA**: инстанс переходит в `pendingPassword` → статус-эндпоинт
   возвращает `{status: "PENDING", stateInstance: "pendingPassword", twoFaRequired: true}`
   (состояние PENDING_2FA). Оператор вводит пароль → POST `/api/channels/max/[id]/twofa`
   с `{"password": "…"}` → `sendAuthorizationPassword`. Результат пробрасывается
   оператору: `success: true` либо `success: false, reason: invalid_password |
   rate_limit_exceeded | authorization_not_started | timeout | attempts_exceeded |
   time_limit_expired_logout` (все ошибки приходят с HTTP 200).
5. `authorized` (через статус-эндпоинт или вебхук `stateInstanceChanged`) → ACTIVE.

**КП C3 (реализовано):** флоу 2FA покрыт интеграционным тестом
(tests/integration/max-greenapi.test.ts): pendingPassword → неверный пароль (invalid_password,
подключение остаётся PENDING) → верный пароль → authorized → ACTIVE.

**Окно QR 10 минут** действует для состояния `notAuthorized` (КП «отвалившийся QR»).
Шаг 2FA (pendingPassword) этим окном не ограничивается — у MAX есть собственный лимит
ввода пароля (`time_limit_expired_logout` → состояние вернётся в notAuthorized, после
чего сработает правило 10 минут).

## 3. Policy-риски и рекомендации (docs/Схема подключения MAX.md)

- Подход «как устройство» у агрегаторов (Umnico) исторически опирался на **неофициальный
  внутренний API MAX** с риском изменения/блокировок. Green API — официальная интеграция,
  но rule-of-thumb прежний: не рассылать спам, соблюсти лимиты интервалов отправки
  (delaySendMessagesMilliseconds ≥ 500 мс), не подключать аккаунты без согласия владельца.
- Umnico предупреждает: 2FA нужно отключить для стабильной работы. Messengo вместо
  требования «отключите 2FA» поддерживает ввод пароля оператором (п.2.4) — при
  массовых сбоях авторизации (attempts_exceeded, time_limit_expired_logout) документируем
  «подождать и повторить подключение».
- suspended (временные ограничения MAX): отправка возможна только на номера из контактов,
  иначе 403; срок — в GetAccountSettings (`suspendedUntil`). Воркер помечает подключение
  ERROR — оператору ждать окончания ограничения.
- Массовые сбои приёма/авторизации — алертить (health-check воркера + логи greenapi).

## 4. Обмен сообщениями

- Входящие: вебхук `incomingMessageReceived` (та же обёртка, `typeInstance: "v3"`,
  chatId — числовой id) → общий пайплайн: Contact по sender, conversationKey = chatId,
  дедупликация по idMessage. Текстовые сообщения; медиа — по мере появления (фазы D/E).
- Исходящие: адаптер `sendMessage` → Green API `sendMessage` (chatId как conversationKey;
  лимит 4 000 символов; очередь Green API до 24 ч, интервал отправки настраивается).
- Reconcile: `outgoingMessageStatus` (sent/delivered/read → SENT; failed → FAILED;
  docs sendMessage подтверждает failed-статус для недоставленных сообщений) закрывает
  UNKNOWN-исходы; ключ сверки — `Message.externalId` (idMessage).

## 5. Мониторинг

`checkGreenApiInstances` (воркер, раз в 5 минут) покрывает WHATSAPP и MAX: ACTIVE +
notAuthorized/blocked/suspended → ERROR; PENDING + notAuthorized > 10 мин → ERROR;
pendingPassword/starting — без смены статуса. Уведомление оператору — лог до фазы D.

## 6. Чеклист серверной приёмки 🖥 (реальный инстанс)

1. Создать инстанс MAX (Developer или партнёрский), заполнить `.env` на сервере.
2. Подключение через UI/API → QR → сканировать в MAX («Профиль» → «Устройства»).
3. 2FA: на аккаунте с включённой 2FA — ввести пароль через `/twofa` → ACTIVE.
4. Входящее: написать с другого аккаунта MAX → сообщение в диалоге.
5. Исходящее: ответ из интерфейса → доставлено, статус SENT.
6. Reconcile: прервать сеть на момент отправки → UNKNOWN → outgoingMessageStatus → SENT/FAILED.
7. Отвал: разлогинить устройство в MAX → подключение ERROR в течение 5 минут (воркер).
8. Отключение: DELETE `/api/channels/[id]` → DISCONNECTED, секреты затёрты; полное снятие —
   logout/удаление инстанса в кабинете Green API (партнёрский — deleteInstanceAccount).
