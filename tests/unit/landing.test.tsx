// Юнит-рендер лендинга (план D6 п.1, по образцу d5-screens.test.tsx):
// страница отрисовывается на сервере (react-dom/server) без ошибок и содержит
// тексты всех блоков landing/structure.md; заглушки видны только на dev-стенде.
// Путь клиента «лендинг → регистрация → дашборд» и адаптив проверяются
// в tests/e2e/landing.spec.ts.
import { describe, test, expect } from "bun:test";
import { renderToString } from "react-dom/server";

const { default: LandingPage } = await import("../../src/components/landing/LandingPage");
const { FOOTER_DISCLAIMER } = await import("../../src/components/landing/content");

// React вставляет узлы-комментарии между текстовыми сегментами — вырезаем.
const render = () => renderToString(<LandingPage />).replace(/<!-- -->/g, "");

describe("Лендинг (план D6 п.1): серверный рендер", () => {
  test("целевое действие одно: четыре кнопки на регистрацию и четыре на вход", () => {
    const html = render();
    expect(html.split('href="/register"').length - 1).toBe(4);
    expect(html.split('href="/login"').length - 1).toBe(4);
    expect(html.split("Начать 7 дней бесплатно").length - 1).toBe(4);
  });

  test("блоки 0–10 по landing/structure.md", () => {
    const html = render();
    // 1. Первый экран
    expect(html).toContain("Одно окно для всех мессенджеров");
    expect(html).toContain("Клиенты пишут в Telegram, MAX и Instagram");
    expect(html).toContain("Без карты и установки · регистрация за минуту");
    expect(html).toContain("ИИ-черновик");
    // 2–3. Боли и аудитория: три карточки, три пункта, оговорка
    expect(html.split("ld-pain__num").length - 1).toBe(3);
    expect(html).toContain("В Messengo эти три проблемы закрываются одним окном.");
    expect(html).toContain("Один аккаунт рассчитан на одного человека");
    // 4–5. Возможности и шаги: шесть значков мессенджеров, три шага
    expect(html.split("ld-feature__channels").length - 1).toBe(1);
    expect(html.split("ld-step__num").length - 1).toBe(3);
    // 6–7. Пробный период и доверие: четыре условия, три гарантии
    expect(html).toContain("Попробуйте Messengo бесплатно");
    expect(html).toContain("7 дней полного доступа");
    expect(html).toContain("Остановиться — в любой момент.");
    expect(html).toContain("Ваша переписка остаётся вашей");
    expect(html.split("ld-card__ic").length - 1).toBe(6);
    // 8–10. Вопросы, финальный призыв, подвал
    expect(html.split("ld-faq__item").length - 1).toBe(8);
    expect(html).toContain("Все клиенты — в одном окне");
    expect(html).toContain('href="/privacy"');
    expect(html).toContain("© Messengo, 2026");
  });

  test("заглушки: четыре на dev-стенде, ни одной вне его", () => {
    // Переключить NODE_ENV в процессе нельзя (read-only), поэтому ожидание
    // выводим из окружения: в контейнере стенда NODE_ENV=development, в CI — test
    // (заглушки скрыты, как в прод-сборке).
    const count = render().split('class="ld-placeholder').length - 1;
    expect(count).toBe(process.env.NODE_ENV === "development" ? 4 : 0);
  });

  test("Facebook, Instagram и WhatsApp помечены звёздочкой; дисклеймер — в самом низу подвала", () => {
    const html = render();
    // Сам дисклеймер — единственное место без пометок, его исключаем
    const withoutDisclaimer = html.replace(FOOTER_DISCLAIMER, "");
    expect(withoutDisclaimer).not.toMatch(/(Facebook|Instagram|WhatsApp|Meta)(?!\*)/);
    expect(html.trim().endsWith(`${FOOTER_DISCLAIMER}</p></div></footer></div>`)).toBe(true);
  });

  test("значки WhatsApp, Instagram и Facebook на лендинге не показываются", () => {
    const html = render();
    // Начала path-путей логотипов в ChannelIcon (два других значка — MAX через <img>)
    for (const brandPath of ["M17.472 14.382", "M7.0301.084c", "M9.101 23.691"]) {
      expect(html).not.toContain(brandPath);
    }
    // Остались: три значка в блоке возможностей и шесть в макете окна
    expect(html.split('class="ch-icon').length - 1).toBe(9);
  });
});
