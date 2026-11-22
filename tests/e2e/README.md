# E2E-тесты Playwright (планы C4 и D1)

Сквозные сценарии против dev-стенда:
- C4: регистрация → подключение testing-канала → входящее сообщение → ответ оператора → статус SENT (HTTP-API, request context);
- D1: дизайн-система — навигация по разделам через сайдбар, NotificationPanel, скриншоты эталонных состояний (браузер).

## Пререквизиты

1. Dev-стенд поднят (из WSL, в корне репозитория):

   ```bash
   docker compose up -d   # db + web + worker
   ```

2. Браузеры Playwright (один раз):

   ```bash
   bun x playwright install chromium --only-shell
   ```

## Запуск

API-сценарии (C4) запускаются прямо в WSL:

```bash
bun x playwright test
```

Браузерные сценарии (D1 и далее) требуют системных библиотек chromium в WSL.
Два варианта:

- **Нативно (предпочтительно)** — одноразовая установка зависимостей
  (нужен пароль sudo):

  ```bash
  sudo bun x playwright install-deps chromium
  bun x playwright test
  ```

- **Через Docker** — без изменений системы (образ должен совпадать с версией
  `@playwright/test` в package.json):

  ```bash
  docker run --rm --network host -v "$PWD":/work -w /work \
    mcr.microsoft.com/playwright:v1.65.1-noble npx playwright test
  ```

Базовый адрес стенда: `http://127.0.0.1:3000` (переопределяется `E2E_BASE_URL`).

Отчёт о последнем прогоне: `bun x playwright show-report`.
Скриншоты D1 пишутся в `test-results/design-system/` (в git не попадают).

