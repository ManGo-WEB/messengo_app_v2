// E2E дизайн-системы (план D1 КП и п.4): страницы-заглушки всех разделов
// открываются через сайдбар; NotificationPanel раскрывается и гасит бейдж;
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

// У каждой заглушки есть текст-пояснение внутри пустого состояния
const EMPTY_STATE_MARK = ".estate__text";

test("все разделы открываются через сайдбар, визуал фиксируется скриншотами", async ({ page }) => {
  // Next.js 16 (dev) при клиентских переходах держит предыдущую страницу в DOM
  // скрытой (display:none) — поэтому assertions берём по видимому элементу.
  const pageTitle = page.locator(".page-title:visible");

  // Обход разделов кликами по сайдбару: стартуем с первого раздела.
  await page.goto("/chats");
  await expect(pageTitle).toHaveText("Чаты");

  for (const [index, section] of SECTIONS.entries()) {
    if (index > 0) {
      await page.locator(`.side__nav .side__item[title="${section.title}"]`).click();
    }
    await expect(page).toHaveURL(new RegExp(`${section.href}$`));
    await expect(pageTitle).toHaveText(section.title);
    // Активный пункт сайдбара подсвечен
    await expect(page.locator(`.side__nav .side__item.is-active[title="${section.title}"]`)).toBeVisible();
    // Заглушка отрисована (только видимый экземпляр — см. комментарий про переходы)
    const estate = page.locator(".estate:visible");
    await expect(estate.locator(".estate__title")).toBeVisible();
    await expect(estate.locator(EMPTY_STATE_MARK)).toBeVisible();

    // Скриншот эталонного состояния раздела (артефакт для сверки с прототипом)
    await page.screenshot({ path: `test-results/design-system/${section.href.slice(1)}.png`, fullPage: true });
  }

  // Сайдбар содержит ровно 6 навигационных пунктов плана
  expect(await page.locator(".side__nav .side__item").count()).toBe(6);
});

test("NotificationPanel: раскрытие, мок-уведомления, «отметить всё прочитанным»", async ({ page }) => {
  await page.goto("/chats");

  const bell = page.locator('button[aria-label="Уведомления"]');
  await expect(bell.locator(".topbar__badge")).toHaveText("3");
  await bell.click();

  const panel = page.locator(".npanel");
  await expect(panel).toBeVisible();
  expect(await panel.locator(".npanel__item").count()).toBe(3);

  await panel.locator(".npanel__clear").click();
  await expect(panel.locator(".npanel__empty")).toHaveText("Новых уведомлений нет");
  await expect(page.locator(".topbar__badge")).toHaveCount(0);
  await page.screenshot({ path: "test-results/design-system/notification-panel.png" });
});
