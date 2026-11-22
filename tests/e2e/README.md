# E2E-тесты Playwright (план C4)

Сквозные сценарии против dev-стенда: регистрация → подключение testing-канала →
входящее сообщение → ответ оператора → статус SENT. UI-фаза D ещё не начата,
поэтому сценарий идёт через HTTP-API (request context Playwright).

## Пререквизиты

1. Dev-стенд поднят (из WSL, в корне репозитория):

   ```bash
   docker compose up -d   # db + web + worker
   ```

2. Браузер Playwright установлен (один раз):

   ```bash
   bun x playwright install chromium --only-shell
   ```

## Запуск

```bash
bun x playwright test            # все e2e-сценарии
bun x playwright test --headed   # с окном браузера (если нужен визуальный прогон)
```

Базовый адрес стенда: `http://127.0.0.1:3000` (переопределяется `E2E_BASE_URL`).

Отчёт о последнем прогоне: `bun x playwright show-report`.
