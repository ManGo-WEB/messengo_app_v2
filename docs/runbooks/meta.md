# Runbook: Meta — Facebook Messenger + Instagram Direct (B4)

Статус: **🖥 серверная приёмка** — Facebook Login и вебхуки Meta требуют публичный
URL и прохождения App Review для продакшена; локально канал проверяется
интеграционным тестом на фикстурах (`tests/integration/meta.test.ts`).
Механика из V1 `channels/meta`, `channels/facebook`, `channels/instagram`.

## 1. Meta-приложение (создаёт владелец)

1. [developers.facebook.com](https://developers.facebook.com) → My Apps → Create App
   → тип **Business**.
2. Добавить продукты: **Facebook Login for Business** и **Messenger** (включает Instagram).
3. Facebook Login → Settings:
   - Valid OAuth Redirect URIs: `https://<домен>/api/channels/meta/callback`;
   - Deletion Callback URL: `https://<домен>/api/meta/data-deletion` (флоу B4).
4. App Settings → Basic: скопировать **App ID** и **App Secret**.
5. Сгенерировать произвольный **Verify Token** (строка) для верификации вебхука.
6. Webhooks → Page: subscription field `messages` (подписка на конкретную страницу
   выполняется автоматически при подключении — `subscribed_apps`).

## 2. Переменные окружения

```env
META_APP_ID=<app id>
META_APP_SECRET=<app secret>
META_VERIFY_TOKEN=<произвольная строка>
META_REDIRECT_URL=https://<домен>/api/channels/meta/callback
```

## 3. Флоу подключения (оператор в UI)

1. «Подключить Facebook» / «Подключить Instagram» →
   `GET /api/channels/meta/connect?platform=…` — ссылка Facebook Login
   (скоупы: FB — `pages_show_list,pages_messaging,pages_manage_metadata`;
   IG — `+ instagram_basic,instagram_manage_messages`; state — HttpOnly-печенька, 10 мин).
2. Callback: обмен кода на user-token → PENDING-подключение (токен зашифрован).
3. `GET /api/channels/meta/accounts` — страницы (`me/accounts`) с токенами и
   связанными IG-аккаунтами; для Instagram показываются только страницы с IG.
4. `POST /api/channels/meta/select-account` — подписка вебхуков страницы
   (`subscribed_apps`, поля `messages,messaging_postbacks`), Page Access Token
   зашифрован в конфиге → **ACTIVE** (FB: externalId = page id; IG: = IG-аккаунт).

## 4. Работа каналов

- Вебхук `POST /api/webhooks/meta`: **GET-верификация** (`hub.challenge` по
  `META_VERIFY_TOKEN`), подпись **X-Hub-Signature-256** (HMAC-SHA256 app secret по
  сырому телу, timing-safe); неверная подпись → 403.
- Каждый собеседник — диалог `psid:<id>` (FB PSID / IG PSID).
- Отправка: FB — `/{pageId}/messages`, IG — `/{igId}/messages`
  (messaging_type=RESPONSE).
- **24-часовое окно**: если последнее входящее старше 24 часов — отправка
  блокируется с ошибкой `META_WINDOW_EXPIRED` (расширение Human Agent —
  `humanAgent: true` в конфиге подключения, по умолчанию выключено; требует
  одобрения Meta).

## 5. Флоу удаления данных (обязательно для App Review)

Meta направляет пользователя на `https://<домен>/api/meta/data-deletion?code=…`:
- GET — страница подтверждения (рус.);
- POST — фиксация подтверждения в `MetaDeletionRequest` (status CONFIRMED).
Фактическое удаление данных канала выполняет фоновая обработка (B5/G).

## 6. App Review-чеклист (для Advanced Access)

- `pages_messaging`, `instagram_basic`, `instagram_manage_messages` — запросить
  Advanced Access с скринкастами (V1 проходил review — см. docs/Схема подключения
  Facebook и Instagram.md).
- Deletion Callback URL и работающая страница удаления — обязательны.
- Без Advanced Access канал работает только для администраторов приложения
  (тестовый режим).
