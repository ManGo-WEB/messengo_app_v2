// Юнит-рендер экранов D5 (план D5 п.4, по образцу ui-render.test.tsx):
// каждый экран отрисовывается на сервере (react-dom/server) без ошибок и
// содержит ожидаемую разметку. Интерактивности (drag&drop воронки,
// навигация календаря, модалки настроек) проверяются в
// tests/e2e/d5-secondary-screens.spec.ts.
import { describe, test, expect, mock } from "bun:test";
import { renderToString } from "react-dom/server";

// SettingsWorkspace использует useRouter (next/navigation) — без замокания
// SSR-рендер падает с «app router to be mounted». Замок до динамического
// импорта компонента.
mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
}));

const { default: FunnelWorkspace } = await import("../../src/components/funnel/FunnelWorkspace");
const { default: TasksWorkspace } = await import("../../src/components/tasks/TasksWorkspace");
const { default: DashboardWorkspace } = await import("../../src/components/dashboard/DashboardWorkspace");
const { default: SettingsWorkspace } = await import("../../src/components/settings/SettingsWorkspace");

// React вставляет узлы-комментарии между текстовыми сегментами («Всего <!---->7») —
// для текстовых проверок вырезаем их.
const clean = (html: string) => html.replace(/<!-- -->/g, "");

describe("D5: рендер второстепенных экранов", () => {
  test("Воронка: тулбар, 7 колонок, карточки сделок", () => {
    const html = clean(renderToString(<FunnelWorkspace />));
    // Тулбар: фильтры и действия из прототипа
    expect(html).toContain("board__toolbar");
    expect(html).toContain("Массовые действия");
    expect(html).toContain("Триггеры");
    expect(html).toContain("Редактирование воронки");
    expect(html).toContain("Скачать в XLS");
    // 7 этапов воронки
    expect(html.split("board-col__title").length - 1).toBe(7);
    // Моковые сделки: 5 карточек (2 + 1 + 0 + 1 + 1 + 0 + 0)
    expect(html.split("board-card__top").length - 1).toBe(5);
    expect(html).toContain("Максим Орлов");
    // toLocaleString("ru-RU") в Bun — неразрывный пробел между разрядами
    expect(html).toMatch(/100\s*000/);
    // Пустые колонки: подсказка о перетаскивании
    expect(html).toContain("Перетащите существующую сделку в этот этап");
  });

  test("Задачи: тулбар, дни недели, счётчики статусов", () => {
    const html = clean(renderToString(<TasksWorkspace />));
    expect(html).toContain("cal__toolbar");
    // 7 дней недели
    expect(html.split("cal__weekdays").length - 1).toBe(1);
    for (const w of ["Воскресенье", "Понедельник", "Вторник", "Суббота"]) {
      expect(html).toContain(w);
    }
    // Переключатель видов и «Сегодня»
    expect(html).toContain("cal__view");
    expect(html).toContain("Сегодня");
    // Счётчики статусов моковых задач
    expect(html).toContain("Всего 7");
    expect(html).toContain("В работе 4");
    expect(html).toContain("Выполненные 2");
    expect(html).toContain("Просроченные 1");
    // До гидрации сетка месяца пуста (серверный снимок времени — "")
    expect(html).not.toContain("cal-cell__num");
  });

  test("Дашборд: карточки-счётчики в состоянии загрузки", () => {
    const html = clean(renderToString(<DashboardWorkspace />));
    expect(html).toContain("dash__grid");
    expect(html).toContain("Всего диалогов");
    expect(html).toContain("Ожидают ответа");
    expect(html).toContain("Новые за сегодня");
    expect(html).toContain("Среднее время первого ответа");
    expect(html).toContain("Первый ответ в течение часа");
    // Пока данные не загружены — значения-заглушки
    expect(html).toContain("dash-card__value");
    expect(html).toContain("Открыть чаты");
  });

  test("Настройки: вкладки, строки профиля, LLM-заглушка", () => {
    const html = clean(renderToString(<SettingsWorkspace />));
    expect(html).toContain("set-profile");
    expect(html).toContain("Профиль");
    expect(html).toContain("Уведомления");
    // Строки-поля
    expect(html).toContain("Организация");
    expect(html).toContain("Почта");
    expect(html).toContain("Пароль");
    // LLM-ключ: заглушка до фазы E
    expect(html).toContain("API-ключ LLM");
    expect(html).toContain("Проверить ключ");
    expect(html).toContain("Появится на этапе RAG (фаза E).");
    // Кнопка выхода; вкладка «Уведомления» — переключаемая (проверяется в e2e)
    expect(html).toContain("Выйти");
    expect(html).toContain("Уведомления");
  });
});
