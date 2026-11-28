// E2E продуктового лендинга (план D6 п.1, КП): полный путь клиента
// «лендинг → регистрация → дашборд», сохранение данных регистрации в БД,
// кнопки и якоря, заготовка /privacy. Эталонные виды снимаются на ширинах
// 360–1440px без горизонтальной прокрутки (артефакты в test-results/landing/).
import { test, expect, type Page } from "@playwright/test";

const CTA = "Начать 7 дней бесплатно";
const password = "e2e-password-12345";

type Profile = {
  user: { email: string; name: string; role: string };
  organization: { name: string };
};

/** Профиль читается API из БД по сессии браузера. */
const readProfile = (page: Page) =>
  page.evaluate(async () => {
    const response = await fetch("/api/auth/me");
    return { status: response.status, body: (await response.json()) as Profile | { message: string } };
  });

test("лендинг → регистрация → дашборд: данные регистрации сохраняются в БД", async ({ page }) => {
  const email = `e2e-landing-${Date.now()}@messengo.test`;

  // Лендинг: заголовок страницы и единственное целевое действие
  await page.goto("/");
  await expect(page).toHaveTitle("Messengo — все клиентские переписки в одном окне");
  await expect(page.locator("h1")).toContainText("Клиенты пишут в Telegram, MAX и Instagram");
  await expect(page.locator('a[href="/register"]')).toHaveText([CTA, CTA, CTA, CTA]);
  await expect(page.locator('a[href="/login"]')).toHaveText(["Войти", "Войти", "Войти", "Войти"]);
  // Заглушки текстов (тарифы — 2 места, контакты в подвале — 2) видны только
  // на dev-стенде (NODE_ENV=development), в прод-сборке их нет
  await expect(page.locator(".ld-placeholder")).toHaveCount(4);
  // Упоминания Facebook, Instagram и WhatsApp помечены звёздочкой, дисклеймер —
  // самой нижней строкой подвала
  await expect(page.locator("h1")).toContainText("Instagram*");
  await expect(page.locator(".ld-footer__disclaimer")).toContainText(
    "деятельность которой признана экстремистской и запрещена на территории РФ",
  );

  // Кнопка в шапке ведёт на форму регистрации; обещание продолжается
  await page.locator(".ld-header").getByRole("link", { name: CTA }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.locator(".auth-title")).toHaveText("Создать аккаунт");
  await expect(page.locator(".auth-sub")).toContainText("7 дней бесплатно");

  // Заполнение формы → переход в приложение
  await page.locator("#reg-name").fill("Анна Клиентова");
  await page.locator("#reg-email").fill(email);
  await page.locator("#reg-password").fill(password);
  await page.locator("#reg-org").fill("Студия «Лендинг»");
  await page.locator("button[type=submit]").click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  await expect(page.locator(".page-title")).toHaveText("Дашборд");

  // Введённые данные читаются из БД (API берёт профиль по сессии)
  const signedIn = await readProfile(page);
  expect(signedIn.status).toBe(200);
  expect(signedIn.body).toMatchObject({
    user: { email, name: "Анна Клиентова", role: "ADMIN" },
    organization: { name: "Студия «Лендинг»" },
  });

  // Данные переживают выход: после нового входа профиль тот же
  await page.evaluate(() => fetch("/api/auth/logout", { method: "POST" }));
  expect((await readProfile(page)).status).toBe(401);
  await page.evaluate(
    async ({ email, password }) => {
      const login = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!login.ok) throw new Error(`login: ${login.status}`);
    },
    { email, password },
  );
  const signedInAgain = await readProfile(page);
  expect(signedInAgain.body).toMatchObject({
    user: { email, name: "Анна Клиентова" },
    organization: { name: "Студия «Лендинг»" },
  });
});

test("«Войти» ведёт на форму входа; меню и вопросы работают", async ({ page }) => {
  await page.goto("/");
  await page.locator(".ld-hero").getByRole("link", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator(".auth-title")).toHaveText("Вход в кабинет");

  // Якорь меню прокручивает к разделу возможностей
  await page.goto("/");
  await page.locator(".ld-nav").getByRole("link", { name: "Возможности" }).click();
  await expect(page).toHaveURL(/#features$/);
  await expect(page.locator("#features h2")).toBeInViewport();

  // Вопросы: 8 пунктов, ответ раскрывается по клику
  await expect(page.locator(".ld-faq__item")).toHaveCount(8);
  await expect(page.locator(".ld-faq__a").first()).toBeHidden();
  await page.locator(".ld-faq__q").first().click();
  await expect(page.locator(".ld-faq__a").first()).toContainText("Первые 7 дней — бесплатно");
});

test("/privacy: заготовка политики открывается из подвала и ведёт назад", async ({ page }) => {
  await page.goto("/");
  await page.locator(".ld-footer__nav").getByRole("link", { name: "Политика конфиденциальности" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  // Уточнённый селектор: в момент клиентского перехода на странице на миг
  // есть и h1 лендинга, и h1 политики
  await expect(page.locator(".ld-doc__title")).toHaveText("Политика конфиденциальности");
  await expect(page.locator(".ibanner--warning")).toContainText("Это черновок");
  await page.getByRole("link", { name: "На главную" }).click();
  await expect(page).toHaveURL(/\/$/);
});

for (const width of [1440, 1024, 768, 520, 360]) {
  test(`лендинг на ${width}px: без горизонтальной прокрутки, призыв виден`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    await expect(page.locator(".ld-hero").getByRole("link", { name: CTA })).toBeVisible();
    await page.screenshot({ path: `test-results/landing/landing-${width}.png`, fullPage: true });
  });
}
