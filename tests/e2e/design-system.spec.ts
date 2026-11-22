// E2E дизайн-системы (планы D1/D2): страницы всех разделов открываются через
// сайдбар; NotificationPanel получает живые уведомления по SSE (D2 п.3);
// эталонные состояния снимаются скриншотами (артефакты в test-results/).
import { test, expect } from "@playwright/test";

const SECTIONS = [
  { href: "/chats", title: "Чаты" },
  { href: "/channels", title: "Каналы связи" },
  { href: "/payments", title: "Оплаты" },
  { href: "/funnel", title: "Воронка" },
  { href: "/tasks", title: "Задачи" },
  { href: "/settings", title: "Настройки" },
];

// У каждой заглушки есть текст-пояснение внутри пустого состояния;
// «Чаты» (D2) вместо заглушки — рабочий инбокс.
const EMPTY_STATE_MARK = ".estate__text";

test("все разделы открываются через сайдбар, визуал фиксируется скриншотами", async ({ page }) => {
  // Next.js 16 (dev) при клиентских переходах держит предыдущую страницу в DOM
  // скрытой (display:none) — поэтому assertions берём по видимому элементу.
  // Заголовок «Чаты» живёт в верхней панели (инбокс рендерится во всю ширину
  // без page-title), остальные разделы — в .page-title.
  const pageTitle = page.locator(".page-title:visible");
  const topbarTitle = page.locator(".topbar__title:visible");

  // Обход разделов кликами по сайдбару: стартуем с первого раздела.
  await page.goto("/chats");
  await expect(topbarTitle).toHaveText("Чаты");

  for (const [index, section] of SECTIONS.entries()) {
    if (index > 0) {
      await page.locator(`.side__nav .side__item[title="${section.title}"]`).click();
    }
    await expect(page).toHaveURL(new RegExp(`${section.href}$`));
    if (section.href === "/chats") {
      await expect(topbarTitle).toHaveText(section.title);
    } else {
      await expect(pageTitle).toHaveText(section.title);
    }
    // Активный пункт сайдбара подсвечен
    await expect(page.locator(`.side__nav .side__item.is-active[title="${section.title}"]`)).toBeVisible();

    if (section.href === "/chats") {
      // D2: инбокс — тулбар со фильтрами и поиском вместо заглушки
      await expect(page.locator(".inbox__toolbar")).toBeVisible();
      await expect(page.locator(".search input")).toBeVisible();
    } else {
      // Заглушка отрисована (только видимый экземпляр — см. комментарий про переходы)
      const estate = page.locator(".estate:visible");
      await expect(estate.locator(".estate__title")).toBeVisible();
      await expect(estate.locator(EMPTY_STATE_MARK)).toBeVisible();
    }

    // Скриншот эталонного состояния раздела (артефакт для сверки с прототипом)
    await page.screenshot({ path: `test-results/design-system/${section.href.slice(1)}.png`, fullPage: true });
  }

  // Сайдбар содержит ровно 6 навигационных пунктов плана
  expect(await page.locator(".side__nav .side__item").count()).toBe(6);
});

test("NotificationPanel: живое уведомление по SSE (D2 п.3)", async ({ page }) => {
  await page.goto("/chats");

  // Регистрация и вход в контексте страницы.
  const email = `e2e-notify-${Date.now()}@messengo.test`;
  await page.evaluate(async (email) => {
    const register = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "e2e-password-12345", name: "E2E Нотификации" }),
    });
    if (!register.ok && register.status !== 409) throw new Error(`register: ${register.status}`);
    const login = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "e2e-password-12345" }),
    });
    if (!login.ok) throw new Error(`login: ${login.status}`);
  }, email);

  // EventSource при 401 закрывается навсегда (без авто-переподключения):
  // перезагружаем страницу, чтобы SSE открылся уже с сессией.
  await page.reload();

  // До события — бейджа нет.
  const bell = page.locator('button[aria-label="Уведомления"]');
  await expect(bell.locator(".topbar__badge")).toHaveCount(0);

  // Входящее через testing-ручку → живое уведомление по SSE.
  await page.evaluate(async (email) => {
    const me = (await (await fetch("/api/auth/me")).json()) as { organization: { id: string } };
    const response = await fetch("/api/testing/inbound", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationId: me.organization.id,
        events: [
          {
            externalEventId: `notify-${Date.now()}`,
            contactExternalId: "anna",
            contactName: "Анна Смирнова",
            conversationKey: "anna-chat",
            text: "Здравствуйте!",
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`inbound: ${response.status}`);
  }, email);

  await expect(bell.locator(".topbar__badge")).toHaveText("1", { timeout: 12_000 });
  await bell.click();
  const panel = page.locator(".npanel");
  await expect(panel.locator(".npanel__item", { hasText: "Анна Смирнова" })).toBeVisible();

  await panel.locator(".npanel__clear").click();
  await expect(panel.locator(".npanel__empty")).toHaveText("Новых уведомлений нет");
  await expect(page.locator(".topbar__badge")).toHaveCount(0);
  await page.screenshot({ path: "test-results/design-system/notification-panel.png" });
});
