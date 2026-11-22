// E2E настройки воронки (дополнение D5 по замечанию владельца): пользователь
// строит воронку под себя — добавляет колонки, переименовывает, переставляет,
// удаляет. Конфигурация хранится в БД (FunnelStage) и переживает
// перезагрузку страницы. Сделки — демо-моки (бэкенд сделок отдельно).
import { test, expect } from "@playwright/test";

const password = "e2e-password-12345";
// Уникальная организация на каждый тест: настройки колонок из одного теста
// не должны видеться в другом (email = ключ организации).
const testEmail = (tag: string) => `e2e-funnel-cols-${tag}-${Date.now()}@messengo.test`;

/** Регистрация + вход прямо в контексте страницы (кука остаётся у браузера). */
async function registerAndLogin(page: import("@playwright/test").Page, userEmail: string, userPassword: string) {
  await page.evaluate(
    async ({ email, password }) => {
      const register = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, name: "Е2Е Воронка" }),
      });
      if (!register.ok && register.status !== 409) throw new Error(`register: ${register.status}`);
      const login = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!login.ok) throw new Error(`login: ${login.status}`);
    },
    { email: userEmail, password: userPassword },
  );
}

/** Колонка по точному заголовку — см. локальный helper `col` в тестах. */

test("воронка: добавить колонку, переименовать, переставить, удалить; сохраняется после перезагрузки", async ({ page }) => {
  const email = testEmail("crud");
  // Колонка по точному заголовку
  const col = (title: string) =>
    page.locator(".board-col").filter({ has: page.locator(".board-col__title", { hasText: new RegExp(`^${title}$`) }) });

  // Дожидаемся GET /api/funnel/stages ПОСЛЕ входа (status 200): SSR показывает
  // дефолтные этапы с временными id, и до ответа сервера редактировать нельзя
  // (модалки открылись бы на устаревших id). Первый GET до логина отдаёт 401 —
  // его игнорируем.
  await page.goto("/funnel");
  await registerAndLogin(page, email, password);
  const stagesLoaded = page.waitForResponse((r) => r.url().includes("/api/funnel/stages") && r.request().method() === "GET" && r.status() === 200);
  await page.reload();
  await stagesLoaded;
  await expect(page.locator(".board__toolbar")).toBeVisible();

  // Дефолтные 7 колонок прототипа (засеиваются при первом GET организации)
  await expect(page.locator(".board-col")).toHaveCount(7);
  await expect(page.locator(".board-card")).toHaveCount(5);

  // Вне режима редактирования кнопок колонок и «Добавить колонку» нет
  await expect(page.locator(".board__add-col")).toHaveCount(0);

  // Включаем режим редактирования воронки
  await page.locator("button", { hasText: "Редактирование воронки" }).click();
  await expect(page.locator(".board__add-col")).toBeVisible();
  await expect(page.locator('.board-col__act[title="Переименовать колонку"]').first()).toBeVisible();

  // Скриншот «режим редактирования включён»
  await page.screenshot({ path: "test-results/funnel-columns/edit-mode.png", fullPage: true });

  // 1. Добавление колонки: модалка с названием и палитрой цветов
  await page.locator(".board__add-col").click();
  await expect(page.locator(".modal__title")).toHaveText("Новая колонка");
  await page.locator("#board-add-label").fill("Холодные лиды");
  await page.locator(".board-color").nth(1).click();
  await page.locator(".modal__footer button", { hasText: "Добавить" }).click();
  await expect(page.locator(".toast:visible", { hasText: "Колонка добавлена." })).toBeVisible();
  await expect(page.locator(".board-col")).toHaveCount(8);
  const added = col("Холодные лиды");
  await expect(added).toBeVisible();
  await expect(added.locator(".board-col__count")).toHaveText("0 из 0");

  // 2. Переименование «Спам» → «Отзывы»
  await col("Спам").locator('.board-col__act[title="Переименовать колонку"]').click();
  await expect(page.locator(".modal__title")).toHaveText("Переименовать колонку");
  await page.locator("#board-rename-label").fill("Отзывы");
  await page.locator(".modal__footer button", { hasText: "Сохранить" }).click();
  await expect(page.locator(".toast:visible", { hasText: "Название обновлено." })).toBeVisible();
  await expect(col("Отзывы")).toBeVisible();

  // 3. Перестановка кнопками ◀: «Холодные лиды» (последняя, 8-я) сдвигаем
  //    на вторую позицию — порядок сохраняется на сервере после каждого шага
  for (let step = 0; step < 6; step++) {
    await added.locator('.board-col__act[title="Сдвинуть колонку влево"]').click();
  }
  await expect(page.locator(".board-col__title").nth(1)).toHaveText(/^Холодные лиды$/);
  // У первой колонки кнопка «влево» задизейблена (краеё положение)
  await expect(col("Непринятые диалоги").locator('.board-col__act[title="Сдвинуть колонку влево"]')).toBeDisabled();
  await expect(added.locator('.board-col__act[title="Сдвинуть колонку влево"]')).toBeEnabled();

  // 4. Удаление пустой колонки «Вторичный контакт» — с подтверждением
  await col("Вторичный контакт").locator('.board-col__act[title="Удалить колонку"]').click();
  await expect(page.locator(".modal__title")).toHaveText("Удалить колонку?");
  await page.locator(".modal__footer button", { hasText: "Удалить" }).click();
  await expect(page.locator(".toast:visible", { hasText: "Колонка удалена." })).toBeVisible();
  await expect(page.locator(".board-col")).toHaveCount(7);

  // Скриншот «настроенная воронка»
  await page.screenshot({ path: "test-results/funnel-columns/customized.png", fullPage: true });

  // 5. Перезагрузка: конфигурация колонок переживает перезагрузку (БД)
  await page.reload();
  await expect(page.locator(".board__toolbar")).toBeVisible();
  await expect(page.locator(".board-col")).toHaveCount(7);
  await expect(page.locator(".board-col__title").nth(1)).toHaveText(/^Холодные лиды$/);
  await expect(col("Отзывы")).toBeVisible();
  const titles = await page.locator(".board-col__title").allTextContents();
  expect(titles).not.toContain("Вторичный контакт");
});

test("воронка: перенос колонки мышью работает при узком окне (pointer-события)", async ({ page }) => {
  const email = testEmail("drag");
  const col = (title: string) =>
    page.locator(".board-col").filter({ has: page.locator(".board-col__title", { hasText: new RegExp(`^${title}$`) }) });

  const stagesLoaded = page.waitForResponse((r) => r.url().includes("/api/funnel/stages") && r.request().method() === "GET" && r.status() === 200);
  await page.goto("/funnel");
  await registerAndLogin(page, email, password);
  await page.reload();
  await stagesLoaded;
  await page.locator("button", { hasText: "Редактирование воронки" }).click();

  // Дефолтный вьюпорт 1280×720: доска скроллится по горизонтали (7 колонок
  // не влезают) — именно тут ломался нативный HTML5 DnD. Реальные
  // mouse-события: «Принимает решение» (4-я) тащим на «Первичный контакт» (2-ю).
  const source = col("Принимает решение");
  const target = col("Первичный контакт");
  await source.scrollIntoViewIfNeeded();
  // Хватаем за заголовок колонки: справа в шапке кнопки редактирования, по ним
  // перетаскивание не стартует (кнопка — не ручка драга).
  const sourceBox = (await source.locator(".board-col__title").boundingBox())!;
  const targetBox = (await target.locator(".board-col__title").boundingBox())!;
  await page.mouse.move(sourceBox.x + 10, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + 10, targetBox.y + targetBox.height / 2, { steps: 15 });
  await page.mouse.up();

  // Колонка встала на вторую позицию (живой reorder во время движения)
  await expect(page.locator(".board-col__title").nth(1)).toHaveText(/^Принимает решение$/);

  // Порядок сохранён в БД: после перезагрузки на месте
  await page.reload();
  const stagesReloaded = page.waitForResponse((r) => r.url().includes("/api/funnel/stages") && r.request().method() === "GET" && r.status() === 200);
  await stagesReloaded;
  await expect(page.locator(".board-col__title").nth(1)).toHaveText(/^Принимает решение$/);
  await page.screenshot({ path: "test-results/funnel-columns/mouse-reorder.png", fullPage: true });
});

test("воронка: удаление колонки со сделками предупреждает, карточки удаляются вместе с колонкой", async ({ page }) => {
  const email = testEmail("delete");
  const col = (title: string) =>
    page.locator(".board-col").filter({ has: page.locator(".board-col__title", { hasText: new RegExp(`^${title}$`) }) });

  const stagesLoaded = page.waitForResponse((r) => r.url().includes("/api/funnel/stages") && r.request().method() === "GET" && r.status() === 200);
  await page.goto("/funnel");
  await registerAndLogin(page, email, password);
  await page.reload();
  await stagesLoaded;
  await page.locator("button", { hasText: "Редактирование воронки" }).click();

  // Колонка со сделками: предупреждение о демо-сделках
  await col("Принимает решение").locator('.board-col__act[title="Удалить колонку"]').click();
  await expect(page.locator(".modal__title")).toHaveText("Удалить колонку?");
  await expect(page.locator(".board-modal-text")).toContainText("В колонке есть сделки");
  await page.locator(".modal__footer button", { hasText: "Отмена" }).click();
  await expect(page.locator(".board-col")).toHaveCount(7);

  // Отмена ничего не удалила; удаляем действительно
  await col("Принимает решение").locator('.board-col__act[title="Удалить колонку"]').click();
  await page.locator(".modal__footer button", { hasText: "Удалить" }).click();
  await expect(page.locator(".toast:visible", { hasText: "Колонка удалена." })).toBeVisible();
  await expect(page.locator(".board-col")).toHaveCount(6);
  // Демо-карточка исчезла вместе с колонкой (в остальных — 4)
  await expect(page.locator(".board-card")).toHaveCount(4);
});
