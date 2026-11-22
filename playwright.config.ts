import { defineConfig } from "@playwright/test";

// E2E-тесты (план C4). Пререквизиты:
//   1. Dev-стенд поднят: docker compose up -d (db, web, worker) — см. README.
//   2. Браузеры установлены: bun x playwright install chromium --only-shell.
// Базовый адрес стенда можно переопределить через E2E_BASE_URL.
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    browserName: "chromium",
  },
});
