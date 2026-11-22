// E2E инбокса (план D2, КП): оператор открывает Чаты → видит диалог из
// testing-канала → пишет ответ → статусы PENDING→SENT отображаются;
// черновик переживает перезагрузку страницы; фильтры работают.
import { test, expect } from "@playwright/test";

const email = `e2e-inbox-${Date.now()}@messengo.test`;
const devEmail = `e2e-inbox-dev-${Date.now()}@messengo.test`;
const password = "e2e-password-12345";

/** Регистрация + вход прямо в контексте страницы (кука остаётся у браузера). */
async function registerAndLogin(page: import("@playwright/test").Page, userEmail: string = email) {
  await page.evaluate(
    async ({ email, password }) => {
      const register = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, name: "E2E Инбокс" }),
      });
      if (!register.ok && register.status !== 409) throw new Error(`register: ${register.status}`);
      const login = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!login.ok) throw new Error(`login: ${login.status}`);
    },
    { email: userEmail, password },
  );
}

async function sendTestingInbound(page: import("@playwright/test").Page, event: Record<string, string>) {
  return page.evaluate(
    async (event) => {
      const me = (await (await fetch("/api/auth/me")).json()) as { organization: { id: string } };
      const response = await fetch("/api/testing/inbound", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId: me.organization.id, events: [event] }),
      });
      if (!response.ok) throw new Error(`inbound: ${response.status}`);
    },
    event,
  );
}

test("инбокс: диалог → ответ → SENT; черновик переживает перезагрузку; фильтры; реалтайм", async ({ page }) => {
  await page.goto("/chats");
  await registerAndLogin(page);

  // Входящие через testing-ручку: два диалога.
  await sendTestingInbound(page, {
    externalEventId: `e2e-inbox-a-${Date.now()}`,
    contactExternalId: "anna",
    contactName: "Анна Смирнова",
    conversationKey: "anna-chat",
    text: "Здравствуйте! Хочу заказать дизайн",
  });
  await sendTestingInbound(page, {
    externalEventId: `e2e-inbox-b-${Date.now()}`,
    contactExternalId: "boris",
    contactName: "Борис Козлов",
    conversationKey: "boris-chat",
    text: "Добрый день",
  });

  // Список: оба диалога видны; открываем первый.
  await page.reload();
  await expect(page.locator(".inbox__row", { hasText: "Анна Смирнова" })).toBeVisible();
  await expect(page.locator(".inbox__row", { hasText: "Борис Козлов" })).toBeVisible();
  await page.locator(".inbox__row", { hasText: "Анна Смирнова" }).click();
  await expect(page.locator(".chat__bubble", { hasText: "Хочу заказать дизайн" })).toBeVisible();

  // Поиск по имени контакта (фильтр из КП).
  const search = page.locator(".search input");
  await search.fill("Борис");
  await expect(page.locator(".inbox__row")).toHaveCount(1);
  await search.fill("");

  // Черновик: правка → автосохранение → перезагрузка → текст вернулся (КП).
  const textarea = page.locator(".chat__input textarea");
  await textarea.fill("Занимаюсь вашим заказом, скоро отвечу");
  await expect(page.locator(".chat__draft-state")).toContainText("Черновик сохранён", { timeout: 5000 });
  await page.reload();
  await page.locator(".inbox__row", { hasText: "Анна Смирнова" }).click();
  await expect(textarea).toHaveValue("Занимаюсь вашим заказом, скоро отвечу");

  // Ответ оператора: Enter → исходящее появляется (PENDING уходит в SENT воркером).
  await textarea.press("Enter");
  await expect(page.locator(".chat__msg--me .chat__bubble", { hasText: "Занимаюсь вашим заказом" })).toBeVisible();
  await expect(page.locator(".chat__msg--me").last().locator(".chat__status--sent")).toBeVisible({ timeout: 20_000 });
  // Отправленный текст перестаёт быть черновиком.
  await expect(textarea).toHaveValue("");

  // Фильтры по статусу (КП): после ответа Анна — «отвечена», Борис — «ожидает».
  await page.locator(".fchip", { hasText: "Ожидают ответа" }).click();
  await expect(page.locator(".inbox__row", { hasText: "Анна Смирнова" })).toHaveCount(0);
  await expect(page.locator(".inbox__row", { hasText: "Борис Козлов" })).toHaveCount(1);
  await page.locator(".fchip", { hasText: "Отвечены" }).click();
  await expect(page.locator(".inbox__row", { hasText: "Анна Смирнова" })).toHaveCount(1);

  // Фильтр по каналу: TESTING-канал отфильтровывает чужие типы (в сочетании со статусом).
  await page.locator(".fchip", { hasText: "Тестовый" }).click();
  await expect(page.locator(".inbox__row", { hasText: "Анна Смирнова" })).toBeVisible();

  // Реалтайм: новое входящее в открытом диалоге появляется без перезагрузки
  // (SSE; запасной путь — опрос ≤10 c).
  await page.locator(".fchip", { hasText: "Все" }).click();
  await page.locator(".fchip", { hasText: "Тестовый" }).click();
  await page.locator(".inbox__row", { hasText: "Борис Козлов" }).click();
  await sendTestingInbound(page, {
    externalEventId: `e2e-inbox-c-${Date.now()}`,
    contactExternalId: "boris",
    contactName: "Борис Козлов",
    conversationKey: "boris-chat",
    text: "Второе сообщение без перезагрузки",
  });
  await expect(page.locator(".chat__bubble", { hasText: "Второе сообщение без перезагрузки" })).toBeVisible({
    timeout: 12_000,
  });
});

test("dev-кнопка тестового сообщения: диалог создаётся из UI (план B0 п.6)", async ({ page }) => {
  await page.goto("/chats");
  await registerAndLogin(page, devEmail);
  await page.reload();
  await expect(page.locator(".inbox__empty", { hasText: "Диалогов нет" })).toBeVisible();

  await page.locator("button", { hasText: "Отправить тестовое сообщение" }).click();
  await expect(page.locator(".inbox__row", { hasText: "Тестовый клиент" })).toBeVisible({ timeout: 12_000 });
});
