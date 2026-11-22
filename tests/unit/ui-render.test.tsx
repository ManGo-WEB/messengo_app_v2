// Минимальные тесты рендера примитивов дизайн-системы (план D1 п.4):
// каждый компонент отрисовывается на сервере (react-dom/server) без ошибок
// и содержит ожидаемую разметку. Интерактивные поведения (сайдбар, верхняя
// панель, модалка) проверяются e2e-сценарием tests/e2e/design-system.spec.ts.
import { describe, test, expect } from "bun:test";
import { renderToString } from "react-dom/server";

import Button from "../../src/components/ui/Button";
import Badge from "../../src/components/ui/Badge";
import Tabs from "../../src/components/ui/Tabs";
import Toggle from "../../src/components/ui/Toggle";
import Stepper from "../../src/components/ui/Stepper";
import Checkbox from "../../src/components/ui/Checkbox";
import SearchInput from "../../src/components/ui/SearchInput";
import FilterChip from "../../src/components/ui/FilterChip";
import InfoBanner from "../../src/components/ui/InfoBanner";
import Avatar from "../../src/components/ui/Avatar";
import Input from "../../src/components/ui/Input";
import Select from "../../src/components/ui/Select";
import Modal from "../../src/components/ui/Modal";
import EmptyState from "../../src/components/ui/EmptyState";
import Toast, { ToastStack } from "../../src/components/ui/Toast";
import TrialBanner from "../../src/components/layout/TrialBanner";
import PaymentsWorkspace from "../../src/components/payments/PaymentsWorkspace";

describe("Дизайн-система: рендер примитивов", () => {
  test("Button: варианты и размеры", () => {
    const html = renderToString(<Button variant="outline" size="sm" icon="plus">Добавить</Button>);
    expect(html).toContain("btn--outline");
    expect(html).toContain("btn--sm");
    expect(html).toContain(">Добавить</button>");
    expect(html).toContain("<svg");
  });

  test("Badge: тон по умолчанию gray", () => {
    const html = renderToString(<Badge>ACTIVE</Badge>);
    expect(html).toContain("badge badge--gray");
    expect(html).toContain("ACTIVE");
  });

  test("Tabs: активный пункт помечен", () => {
    const html = renderToString(
      <Tabs
        items={[
          { id: "all", label: "Все", count: 5 },
          { id: "open", label: "Открытые" },
        ]}
        active="open"
        onChange={() => {}}
      />,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain("tabs__count");
    const activeItem = html.split("tabs__item").length;
    expect(activeItem).toBeGreaterThanOrEqual(2);
    expect(html).toContain("is-active");
    expect(html).toContain("Все");
  });

  test("Toggle: состояние включено", () => {
    const html = renderToString(<Toggle checked onChange={() => {}} />);
    expect(html).toContain("toggle is-on");
    expect(html).toContain('aria-checked="true"');
  });

  test("Stepper: значение и границы", () => {
    const html = renderToString(<Stepper value={3} onChange={() => {}} min={0} max={99} />);
    expect(html).toContain("stepper__val");
    expect(html).toContain(">3<");
    expect(html).toContain('aria-label="Увеличить"');
  });

  test("Checkbox: подпись и галочка", () => {
    const html = renderToString(<Checkbox checked label="Запомнить меня" onChange={() => {}} />);
    expect(html).toContain("checkbox is-checked");
    expect(html).toContain("Запомнить меня");
  });

  test("SearchInput: поле поиска", () => {
    const html = renderToString(<SearchInput value="иван" onChange={() => {}} />);
    expect(html).toContain("search");
    expect(html).toContain('value="иван"');
  });

  test("FilterChip: активное значение", () => {
    const html = renderToString(<FilterChip label="Канал" value="WhatsApp" onClick={() => {}} />);
    expect(html).toContain("fchip is-active");
    expect(html).toContain("WhatsApp");
  });

  test("InfoBanner: три тона", () => {
    expect(renderToString(<InfoBanner>Текст</InfoBanner>)).toContain("ibanner--info");
    expect(renderToString(<InfoBanner tone="warning">Внимание</InfoBanner>)).toContain("ibanner--warning");
    expect(renderToString(<InfoBanner tone="danger">Алерт</InfoBanner>)).toContain("ibanner--danger");
  });

  test("Avatar: инициалы из имени", () => {
    const html = renderToString(<Avatar name="Иван Царевич" size={36} />);
    expect(html).toContain("avatar");
    expect(html).toContain("ИЦ");
  });

  test("Input: ошибка даёт модификатор", () => {
    expect(renderToString(<Input placeholder="Email" />)).toContain("input");
    expect(renderToString(<Input error />)).toContain("input--error");
  });

  test("Select: пункты и шеврон", () => {
    const html = renderToString(
      <Select
        options={[
          { value: "vk", label: "VK" },
          { value: "tg", label: "Telegram" },
        ]}
      />,
    );
    expect(html).toContain("select__field");
    expect(html).toContain("Telegram");
    expect(html).toContain("select__chevron");
  });

  test("Modal: открыт и закрыт", () => {
    const open = renderToString(
      <Modal open onClose={() => {}} title="Подключение канала">
        Содержимое
      </Modal>,
    );
    expect(open).toContain("modal-overlay");
    expect(open).toContain("Подключение канала");
    expect(open).toContain('role="dialog"');
    expect(renderToString(<Modal open={false} onClose={() => {}} title="X" />)).toBe("");
  });

  test("EmptyState: иконка, заголовок, текст, действие", () => {
    const html = renderToString(
      <EmptyState icon="chat" title="Диалогов пока нет" text="Подключите канал" action={<button>Подключить</button>} />,
    );
    expect(html).toContain("estate__ic");
    expect(html).toContain("Диалогов пока нет");
    expect(html).toContain("Подключите канал");
    expect(html).toContain(">Подключить</button>");
  });

  test("Toast: тон задаёт иконку", () => {
    const html = renderToString(
      <ToastStack>
        <Toast tone="success">Отправлено</Toast>
      </ToastStack>,
    );
    expect(html).toContain("toast-stack");
    expect(html).toContain("toast--success");
    expect(html).toContain("Отправлено");
  });

  test("TrialBanner: заголовок и кнопка оплаты", () => {
    const html = renderToString(<TrialBanner />);
    expect(html).toContain("Пробный период закончился");
    expect(html).toContain("Оплатить тариф");
  });
});

describe("Экран «Оплаты» (план D4): серверный рендер", () => {
  test("тарифная сетка на моках: 26 позиций, периоды, red alert, суммы", () => {
    const html = renderToString(<PaymentsWorkspace />);
    // Табы раздела
    expect(html).toContain(">Мой тариф</button>");
    expect(html).toContain(">История</button>");
    // Red alert «не оплачен тариф» (мок TARIFF_UNPAID)
    expect(html).toContain("ibanner--danger");
    expect(html).toContain("Тариф не оплачен");
    // Тарифная сетка — 26 позиций каталога, период «Год» активен по умолчанию
    expect((html.match(/pay-tile /g) ?? []).length).toBe(26);
    expect(html).toContain("pay-period is-active");
    // Карта «Мой тариф»: стартовый состав и итоговая строка (React SSR вставляет
    // комментарии-маркеры между текстовыми узлами — проверяем часть строки)
    expect(html).toContain("pay-side__title");
    expect(html).toContain("Итого за");
    // Реальных платежей нет — кнопка «Оплатить»
    expect(html).toContain(">Оплатить</button>");
  });
});
