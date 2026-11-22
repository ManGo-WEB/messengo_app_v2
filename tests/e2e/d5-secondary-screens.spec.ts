// E2E второстепенных экранов (план D5, КП): все экраны прототипа
// («Воронка», «Задачи», «Настройки») присутствуют и кликабельны; дашборд
// показывает живые счётчики (после входящего через testing-канал счётчик
// растёт). Эталонные состояния снимаются скриншотами
// (артефакты в test-results/d5/).
import { test, expect } from "@playwright/test";

const email = `e2e-d5-${Date.now()}@messengo.test`;
const password = "e2e-password-12345";
const newPassword = "e2e-password-67890";

/** Регистрация + вход прямо в контексте страницы (кука остаётся у браузера). */
async function registerAndLogin(page: import("@playwright/test").Page, userEmail: string, userPassword: string) {
  await page.evaluate(
    async ({ email, password }) => {
      const register = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, name: "Е2Е Даша" }),
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

test("дашборд: живые счётчики после входящего через testing-канал", async ({ page }) => {
  await page.goto("/dashboard");
  await registerAndLogin(page, email, password);
  await page.reload();

  // Карточки сводки на месте, у новой организации нули
  await expect(page.locator(".dash-card", { hasText: "Всего диалогов" })).toBeVisible();
  await expect(page.locator(".dash-card", { hasText: "Всего диалогов" })).toContainText("0");
  await page.screenshot({ path: "test-results/d5/dashboard-empty.png", fullPage: true });

  // Входящее сообщение через testing-канал → счётчики «оживают»
  await sendTestingInbound(page, {
    externalEventId: `e2e-d5-in-${Date.now()}`,
    contactExternalId: "d5-anna",
    contactName: "Анна Смирнова",
    conversationKey: "d5-anna-chat",
    text: "Здравствуйте! Хочу заказать дизайн",
  });
  await page.locator(".dash__head button", { hasText: "Обновить" }).click();
  await expect(page.locator(".dash-card", { hasText: "Всего диалогов" })).toContainText("1");
  await expect(page.locator(".dash-card", { hasText: "Ожидают ответа" })).toContainText("1");
  await expect(page.locator(".dash-card", { hasText: "Новые за сегодня" })).toContainText("1");
  // «нет данных» у SLA: ответа оператора ещё не было
  await expect(page.locator(".dash-card", { hasText: "Первый ответ в течение часа" })).toContainText("нет данных");
  await page.screenshot({ path: "test-results/d5/dashboard-live.png", fullPage: true });

  // Дашборд в сайдбаре — первый пункт; «открыть чаты» ведёт в инбокс
  await expect(page.locator(".side__item", { hasText: "Дашборд" })).toBeVisible();
  await page.locator(".dash-link", { hasText: "Открыть чаты" }).click();
  await expect(page).toHaveURL(/\/chats$/);
});

test("воронка: 7 колонок, 5 сделок, перетаскивание карточки между этапами", async ({ page }) => {
  await page.goto("/funnel");
  await registerAndLogin(page, email, password);
  // Дожидаемся GET этапов ПОСЛЕ входа: при приходе конфигурации колонки
  // пересобираются (SSR-раскладка на временных id заменяется серверной) —
  // перетаскивание до этого момента откатилось бы.
  const stagesLoaded = page.waitForResponse((r) => r.url().includes("/api/funnel/stages") && r.request().method() === "GET" && r.status() === 200);
  await page.reload();
  await stagesLoaded;
  await expect(page.locator(".board__toolbar")).toBeVisible();

  // Колонка по точному заголовку: «Успешно завершено» — подстрока «Не успешно
  // завершено», поэтому hasText по всей колонке даёт 2 совпадения.
  const col = (title: string) =>
    page.locator(".board-col").filter({ has: page.locator(".board-col__title", { hasText: new RegExp(`^${title}$`) }) });

  // 7 этапов воронки, стартовая раскладка моков: 5 сделок
  await expect(page.locator(".board-col")).toHaveCount(7);
  await expect(page.locator(".board-card")).toHaveCount(5);
  await expect(col("Непринятые диалоги")).toContainText(/20\s*000\s*·\s*2\s*шт\./);

  // Скриншот 1 «Воронка до перемещения»
  await page.screenshot({ path: "test-results/d5/funnel.png", fullPage: true });

  // Drag&Drop: «Максим Орлов» из «Непринятых» в «Успешно завершено»
  const card = page.locator(".board-card", { hasText: "Максим Орлов" });
  await card.dragTo(col("Успешно завершено"));
  await expect(col("Успешно завершено").locator(".board-card", { hasText: "Максим Орлов" })).toBeVisible();
  // Карточка ушла из исходной колонки: 12 000 − счётчик обновился
  await expect(col("Непринятые диалоги")).toContainText(/8\s*000\s*·\s*1\s*шт\./);
  // Пустая колонка показывает подсказку
  await expect(col("Вторичный контакт")).toContainText("Перетащите существующую сделку");
});

test("задачи: месячная сетка, счётчики статусов, «сегодня» подсвечено", async ({ page }) => {
  await page.goto("/tasks");
  await registerAndLogin(page, email, password);
  await page.reload();
  await expect(page.locator(".cal__toolbar")).toBeVisible();

  // Шапка дней недели и сетка месяца: 42 ячейки
  await expect(page.locator(".cal__weekdays span")).toHaveCount(7);
  await expect(page.locator(".cal-cell")).toHaveCount(42);
  await expect(page.locator(".cal-task")).toHaveCount(7);

  // Счётчики статусов моковых задач
  await expect(page.locator(".cal-stat--total")).toHaveText("Всего 7");
  await expect(page.locator(".cal-stat--active")).toHaveText("В работе 4");
  await expect(page.locator(".cal-stat--done")).toHaveText("Выполненные 2");
  await expect(page.locator(".cal-stat--overdue")).toHaveText("Просроченные 1");

  // Задача «на сегодня» в подсвеченной ячейке (мок mkTask(0, …))
  await expect(page.locator(".cal-cell.is-today", { hasText: "Созвон с Никитой Вамиловым" })).toBeVisible();

  // Навигация по месяцам работает (в следующем месяце «сегодня» не подсвечено),
  // «Сегодня» возвращает к текущему месяцу
  await page.locator('.cal__nav[title="Следующий месяц"]').click();
  await expect(page.locator(".cal-cell.is-today")).toHaveCount(0);
  await page.locator(".cal__toolbar button", { hasText: "Сегодня" }).click();
  await expect(page.locator(".cal-cell.is-today")).toHaveCount(1);
  await expect(page.locator(".cal-task")).toHaveCount(7);

  await page.screenshot({ path: "test-results/d5/tasks.png", fullPage: true });
});

test("настройки: профиль, смена пароля, LLM-заглушка disabled", async ({ page }) => {
  await page.goto("/settings");
  await registerAndLogin(page, email, password);
  await page.reload();
  await expect(page.locator(".page-title")).toHaveText("Настройки");

  // Карточка профиля: имя из регистрации, роль, выход
  await expect(page.locator(".set-profile__name")).toHaveText("Е2Е Даша");
  await expect(page.locator(".set-profile__role")).toHaveText("Администратор");
  await expect(page.locator(".set-profile button", { hasText: "Выйти" })).toBeVisible();

  // Почта — read-only (без карандаша), пароль и имя редактируются
  const emailRow = page.locator(".set-row", { hasText: "Почта" });
  await expect(emailRow).toContainText("@messengo.test");
  await expect(emailRow.locator(".set-row__edit")).toHaveCount(0);

  // Редактирование имени: модалка → сохранить → тост + новое имя
  await page.locator(".set-row", { hasText: "Имя" }).locator(".set-row__edit").click();
  await expect(page.locator(".modal__title")).toHaveText("Изменить имя");
  await page.locator("#set-name").fill("Дарья Петрова");
  await page.locator(".modal__footer button", { hasText: "Сохранить" }).click();
  await expect(page.locator(".toast:visible")).toContainText("Имя обновлено.");
  await expect(page.locator(".set-profile__name")).toHaveText("Дарья Петрова");

  // Скриншот 1 «Профиль»
  await page.screenshot({ path: "test-results/d5/settings-profile.png", fullPage: true });

  // LLM-ключ: поле и кнопка disabled до фазы E (план D5 п.3)
  await expect(page.locator(".set-llm input")).toBeDisabled();
  await expect(page.locator(".set-llm button", { hasText: "Проверить ключ" })).toBeDisabled();
  await expect(page.locator(".set-llm__hint")).toContainText("Появится на этапе RAG");

  // Смена пароля: реально меняем, разлогин и вход под новым паролем
  await page.locator(".set-row", { hasText: "Пароль" }).locator(".set-row__edit").click();
  await expect(page.locator(".modal__title")).toHaveText("Смена пароля");
  await page.locator("#set-pass-current").fill("wrong-password");
  await page.locator("#set-pass-new").fill(newPassword);
  await page.locator("#set-pass-repeat").fill(newPassword);
  await page.locator(".modal__footer button", { hasText: "Сменить пароль" }).click();
  await expect(page.locator(".set-modal-error")).toContainText("Текущий пароль указан неверно");
  await page.locator("#set-pass-current").fill(password);
  await page.locator(".modal__footer button", { hasText: "Сменить пароль" }).click();
  // Тосты копятся в стеке — ищем именно тост про пароль (рядом висит «Имя обновлено»)
  await expect(page.locator(".toast:visible", { hasText: "Пароль изменён." })).toBeVisible();

  // Выйти → форма входа → новый пароль подходит
  await page.locator(".set-profile button", { hasText: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await registerAndLogin(page, email, newPassword);
  await page.goto("/settings");
  await expect(page.locator(".set-profile__name")).toHaveText("Дарья Петрова");

  // Скриншот 2 «Уведомления»: тумблеры прототипа переключаются
  await page.locator('.tabs__item:has-text("Уведомления")').click();
  await expect(page.locator(".set-toggle-row", { hasText: "Новые диалоги" })).toBeVisible();
  await page.locator(".set-toggle-row", { hasText: "Звук уведомлений" }).locator(".toggle").click();
  await page.screenshot({ path: "test-results/d5/settings-notifications.png", fullPage: true });
});
