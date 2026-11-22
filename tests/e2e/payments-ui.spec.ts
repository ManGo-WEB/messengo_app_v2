// E2E экрана «Оплаты» (план D4, КП): тарифная сетка воспроизводит прототип
// (26 позиций), расчёт реагирует на период/количество, кнопка «Оплатить»
// показывает тост «Платёжный провайдер не подключён», red alert «не оплачен
// тариф». Реальных списаний нет (PRD §10). Эталонные состояния снимаются
// скриншотами (артефакты в test-results/payments/).
import { test, expect } from "@playwright/test";

const email = `e2e-payments-${Date.now()}@messengo.test`;
const password = "e2e-password-12345";

/** Регистрация + вход прямо в контексте страницы (кука остаётся у браузера). */
async function registerAndLogin(page: import("@playwright/test").Page) {
  await page.evaluate(
    async ({ email, password }) => {
      const register = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, name: "E2E Оплаты" }),
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

test("оплаты: сетка тарифа, «Мой тариф», red alert «не оплачен», тост «Оплатить»", async ({ page }) => {
  await page.goto("/payments");
  await registerAndLogin(page);
  await page.reload();

  await expect(page.locator(".page-title:visible")).toHaveText("Оплаты");

  // Тарифная сетка: 26 позиций каталога прототипа, период по умолчанию «Год»
  await expect(page.locator(".pay-grid .pay-tile")).toHaveCount(26);
  await expect(page.locator(".pay-period.is-active")).toHaveText(/Год/);

  // Red alert «не оплачен тариф» (мок TARIFF_UNPAID) виден сразу
  const unpaidAlert = page.locator(".ibanner--danger");
  await expect(unpaidAlert).toContainText("Тариф не оплачен");

  // Скриншот 1 «выбор тарифа»: сетка + периоды + стартовый состав тарифа
  await page.screenshot({ path: "test-results/payments/selection.png", fullPage: true });

  // «Мой тариф»: добавление канала кликом по плитке — итог пересчитывается
  await page.locator('.pay-tile[title="Добавить в тариф"]', { hasText: "Telegram Личный" }).click();
  await expect(page.locator(".pay-line", { hasText: "Telegram Личный" })).toBeVisible();
  const grand = page.locator(".pay-row--grand");
  // Telegram Личный 2275×12 мес добавился к стартовым 15 600 → 42 900 − 35% = 27 885
  await expect(grand).toHaveText(/27\s*885\s*Р/);

  // Stepper количества: +1 подключение VK (975×12) → 54 600 − 35% = 35 490
  await page.locator(".pay-line", { hasText: "ВКонтакте" }).locator(".stepper__btn").nth(1).click();
  await expect(grand).toHaveText(/35\s*490\s*Р/);

  // Скриншот 2 «Мой тариф»: карточка тарифа со строками и Stepper-ами
  await page.locator(".pay-side").screenshot({ path: "test-results/payments/my-tariff.png" });

  // Кнопка «Оплатить» — тост без реальных платежей
  await page.locator(".pay-side__pay").click();
  await expect(page.locator(".toast:visible")).toContainText("Платёжный провайдер не подключён");

  // Скриншот 3 «не оплачен»: red alert «не оплачен тариф»
  await unpaidAlert.screenshot({ path: "test-results/payments/unpaid.png" });

  // Пустой тариф: убрать все каналы — оплата блокируется, подсказка вместо строк
  for (const name of ["Чат на сайт", "Отключение логотипа", "ВКонтакте", "Telegram Личный"]) {
    await page.locator(`.pay-tile[title="Убрать из тарифа"]`, { hasText: name }).click();
  }
  await expect(page.locator(".pay-side__empty")).toHaveText("Добавьте каналы из списка слева");
  await expect(page.locator(".pay-side__pay")).toBeDisabled();
});
