// E2E экрана «Каналы связи» (план D3, КП): подключение testing-канала и
// TG-бота с фикстурным токеном отображается корректно; отключение с
// подтверждением; возврат из OAuth по query-параметру обрабатывается.
// TG-часть требует реального токена тест-бота (env E2E_TELEGRAM_BOT_TOKEN):
// без него сценарий помечается skip (приёмка с реальными сервисами — 🖥).
import { test, expect } from "@playwright/test";

const email = `e2e-channels-${Date.now()}@messengo.test`;
const password = "e2e-password-12345";

/** Регистрация + вход прямо в контексте страницы (кука остаётся у браузера). */
async function registerAndLogin(page: import("@playwright/test").Page) {
  await page.evaluate(
    async ({ email, password }) => {
      const register = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, name: "E2E Каналы" }),
      });
      if (!register.ok && register.status !== 409) throw new Error(`register: ${register.status}`);
      const login = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!login.ok) throw new Error(`login: ${login.status}`);
    },
    { email, password },
  );
}

const fixtureToken = process.env.E2E_TELEGRAM_BOT_TOKEN ?? "";

test("каналы: пустое состояние → testing-канал через UI → отключение с подтверждением", async ({ page }) => {
  await page.goto("/channels");
  await registerAndLogin(page);
  await page.reload();

  // Новая организация: подключений нет — пустое состояние и сетка «Подключить канал»
  await expect(page.locator(".estate__title", { hasText: "Подключений пока нет" })).toBeVisible();
  await expect(page.locator(".ch-card", { hasText: "WhatsApp" })).toBeVisible();
  await expect(page.locator(".ch-card", { hasText: "ВКонтакте" })).toBeVisible();
  // testing-карточка — dev-only (NODE_ENV development на dev-стенде)
  const testingCard = page.locator(".ch-card", { hasText: "Тестовый канал" });
  await expect(testingCard).toBeVisible();

  // Подключение testing-канала кликом по карточке (план D3 п.4)
  await testingCard.click();
  await expect(page.locator(".toast--success", { hasText: "Тестовый канал подключён" })).toBeVisible();
  const testingRow = page.locator(".ch-table__row", { hasText: "Тестовый канал" });
  await expect(testingRow).toBeVisible();
  await expect(testingRow.locator(".badge", { hasText: "Активен" })).toBeVisible();

  // Отключение с подтверждением (план D3 п.3)
  await testingRow.locator("button", { hasText: "Отключить" }).click();
  await expect(page.locator(".modal__title", { hasText: "Отключить канал?" })).toBeVisible();
  await page.locator(".modal").locator("button", { hasText: "Отключить" }).click();
  await expect(page.locator(".toast--success", { hasText: "отключён" })).toBeVisible();
  await expect(testingRow.locator(".badge", { hasText: "Отключён" })).toBeVisible();
  // у отключённого подключения кнопки «Отключить» больше нет
  await expect(testingRow.locator("button", { hasText: "Отключить" })).toHaveCount(0);
});

test("каналы: возврат из OAuth с кодом ошибки VK — понятный тост, query вычищен", async ({ page }) => {
  await page.goto("/channels");
  await registerAndLogin(page);
  // B1 callback возвращает ошибки в ?vk=<код>; страница /settings/channels
  // редиректит сюда с сохранением query (D3)
  await page.goto("/settings/channels?vk=VK_CANCELLED");

  await expect(page).toHaveURL(/\/channels$/);
  await expect(page.locator(".toast--error", { hasText: "Вход через VK отменён" })).toBeVisible();
});

test.describe("каналы: TG-бот с фикстурным токеном", () => {
  test.skip(!fixtureToken, "E2E_TELEGRAM_BOT_TOKEN не задан — реальное подключение бота приёмка 🖥");

  test("диалог токена → бот подключён и виден в списке", async ({ page }) => {
    await page.goto("/channels");
    await registerAndLogin(page);
    await page.reload();

    await page.locator(".ch-card", { hasText: "Telegram-бот" }).click();
    await expect(page.locator(".modal__title", { hasText: "Подключение Telegram-бота" })).toBeVisible();

    // пустой токен — валидация на клиенте
    await page.locator(".modal").locator("button", { hasText: "Подключить" }).click();
    await expect(page.locator(".ch-dlg__error", { hasText: "Введите токен бота" })).toBeVisible();

    await page.locator(".modal input[type=password]").fill(fixtureToken);
    await page.locator(".modal").locator("button", { hasText: "Подключить" }).click();
    await expect(page.locator(".toast--success", { hasText: "подключён" })).toBeVisible();
    const botRow = page.locator(".ch-table__row", { hasText: "Telegram-бот" });
    await expect(botRow.locator(".badge", { hasText: "Активен" })).toBeVisible();
  });
});
