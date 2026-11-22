// E2E страниц входа (формы D6 п.2, реализованы досрочно в рамках замечаний
// владельца к D2): без них данные в приложении недоступны из браузера.
import { test, expect } from "@playwright/test";

const stamp = Date.now();
const email = `e2e-auth-ui-${stamp}@messengo.test`;
const password = "e2e-password-12345";

test("регистрация через UI → сразу на дашборде", async ({ page }) => {
  await page.goto("/register");
  await expect(page.locator(".auth-title")).toHaveText("Создать аккаунт");

  await page.locator("#reg-name").fill("Оператор UI");
  await page.locator("#reg-email").fill(email);
  await page.locator("#reg-password").fill(password);
  await page.locator("#reg-org").fill("Студия E2E");
  await page.locator("button[type=submit]").click();

  // После входа — редирект на дашборд (план D6 п.2, дашборд появился в D5).
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  await expect(page.locator(".page-title")).toHaveText("Дашборд");
  await expect(page.locator(".dash__grid")).toBeVisible();
});

test("вход через UI → дашборд; неавторизованный инбокс — дружелюбное состояние", async ({ page }) => {
  // Готовим аккаунт через API (не через UI — регистрация покрыта отдельным тестом).
  await page.goto("/login");
  await page.evaluate(
    async ({ email, password }) => {
      const register = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, name: "Оператор Логин" }),
      });
      if (!register.ok && register.status !== 409) throw new Error(`register: ${register.status}`);
    },
    { email, password },
  );

  // Неавторизованный инбокс: дружелюбное состояние вместо ошибки в консоли.
  await page.goto("/chats");
  await expect(page.locator(".estate__title:visible")).toHaveText("Требуется вход");
  await expect(page.locator(".estate__action:visible a", { hasText: "Войти" })).toBeVisible();

  // Логинимся через форму.
  await page.locator(".estate__action:visible a", { hasText: "Войти" }).click();
  await expect(page.locator(".auth-title")).toHaveText("Вход в кабинет");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.locator("form button[type=submit]").click();

  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  await expect(page.locator(".page-title")).toHaveText("Дашборд");
});

test("«напомнить пароль»: одинаковое сообщение при любом email", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.locator("#forgot-email").fill("nobody@example.com");
  await page.locator("button[type=submit]").click();
  await expect(page.locator(".auth-ok")).toContainText("мы отправили ссылку для смены пароля");

  // Форма нового пароля без токена — понятная ошибка.
  await page.goto("/reset-password");
  await expect(page.locator(".auth-error")).toContainText("Ссылка недействительна");
});

test("favicon и иконка приложения из V1 подключены", async ({ page }) => {
  await page.goto("/");
  const iconHref = await page.locator('link[rel="icon"]').first().getAttribute("href");
  expect(iconHref, "Next должен подключить app/icon.png как favicon").toBeTruthy();
  const response = await page.request.get(iconHref!);
  expect(response.ok()).toBeTruthy();
});
