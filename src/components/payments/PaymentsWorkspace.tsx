"use client";

// Экран «Оплаты» (план D4): тарифная сетка каналов (26 позиций), карта
// «Мой тариф» со Stepper-ами количества, переключатель периода со скидками,
// расчёт итоговой суммы и red alert «не оплачен тариф». Всё — на моках
// прототипа (src/app/(app)/payments/mocks.ts); реальных платежей нет — кнопка
// «Оплатить» показывает тост (PRD §10, открытый вопрос №6).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../icons/Icon";
import ChannelIcon from "../icons/ChannelIcon";
import { Button, InfoBanner, Stepper, Tabs, Toast, ToastStack, type ToastTone } from "../ui";
import {
  CATALOG,
  PERIODS,
  PERIOD_LABEL,
  DEFAULT_TARIFF_LINES,
  TARIFF_UNPAID,
  catalogById,
  type TariffLine,
} from "../../app/(app)/payments/mocks";
import { money, formatDate, addMonths } from "./format";
import "./payments.css";

type ToastItem = { id: number; tone: ToastTone; text: string };

export default function PaymentsWorkspace() {
  const [tab, setTab] = useState("tariff");
  const [period, setPeriod] = useState("m12");
  const [lines, setLines] = useState<TariffLine[]>(DEFAULT_TARIFF_LINES);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);

  const pushToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = ++toastSeq.current;
    setToasts((current) => [...current.slice(-2), { ...toast, id }]);
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 7_000);
  }, []);

  const p = PERIODS.find((x) => x.id === period)!;
  const inTariff = (id: string) => lines.some((l) => l.id === id);

  const toggleChannel = (id: string) => {
    setLines((prev) =>
      prev.some((l) => l.id === id) ? prev.filter((l) => l.id !== id) : [...prev, { id, qty: 1 }],
    );
  };

  const setQty = (id: string, qty: number) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, qty } : l)));

  const subtotal = useMemo(
    () =>
      lines.reduce((s, l) => {
        const c = catalogById(l.id);
        return s + (c ? c.price * l.qty * p.months : 0);
      }, 0),
    [lines, p],
  );
  const discountValue = Math.round((subtotal * p.discount) / 100);
  const total = subtotal - discountValue;
  // Дата окончания зависит от текущего времени: считаем после монтирования —
  // new Date() в рендере не даёт Next 16 пререндерить маршрут (build падает
  // с prerender-error, см. next-prerender-current-time-client).
  const [endDate, setEndDate] = useState("");
  useEffect(() => {
    setEndDate(formatDate(addMonths(new Date(), p.months)));
  }, [p.months]);

  return (
    <div>
      <h1 className="page-title">Оплаты</h1>

      <Tabs
        items={[
          { id: "tariff", label: "Мой тариф" },
          { id: "history", label: "История" },
          { id: "manage", label: "Управление платежами" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "tariff" && (
        <>
          <div className="pay-space" />

          {TARIFF_UNPAID && (
            <InfoBanner tone="danger" icon={<span className="pay-coin pay-coin--danger"><Icon name="close" size={16} /></span>}>
              Тариф не оплачен. До оплаты подключённые каналы могут приостанавливаться.
            </InfoBanner>
          )}

          <InfoBanner
            tone="info"
            icon={
              <span className="pay-coin">
                <Icon name="wallet" size={16} />
              </span>
            }
            action={
              <Button variant="outline" size="sm">
                Сменить валюту оплаты
              </Button>
            }
          >
            Все дальнейшие оплаты будут проходить в рублях
          </InfoBanner>

          <div className="pay-layout">
            <div className="pay-main">
              <div className="pay-periods">
                {PERIODS.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    className={`pay-period ${period === x.id ? "is-active" : ""}`}
                    onClick={() => setPeriod(x.id)}
                  >
                    {x.label}
                    {x.discount > 0 && <span className="pay-period__disc">-{x.discount}%</span>}
                  </button>
                ))}
              </div>

              <div className="pay-grid">
                {CATALOG.map((c) => {
                  const active = inTariff(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`pay-tile ${active ? "is-in-tariff" : ""}`}
                      onClick={() => toggleChannel(c.id)}
                      title={active ? "Убрать из тарифа" : "Добавить в тариф"}
                    >
                      {c.badge && <span className="pay-tile__corner">{c.badge}</span>}
                      <ChannelIcon id={c.icon} size={56} mono={!active} />
                      <span className={`pay-tile__price ${c.price === 0 ? "is-free" : ""}`}>
                        {c.price === 0 ? "Free" : `${money(c.price * p.months)} Р`}
                      </span>
                      <span className="pay-tile__name">{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <aside className="pay-side">
              <div className="pay-side__title">Мой тариф</div>
              <div className="pay-side__hint">
                Нажмите на канал слева, чтобы добавить или убрать его из тарифа.
              </div>

              <div className="pay-side__lines">
                {lines.map((l) => {
                  const c = catalogById(l.id)!;
                  const linePrice = c.price * l.qty * p.months;
                  return (
                    <div key={l.id} className="pay-line">
                      <ChannelIcon id={c.icon} size={30} />
                      <span className="pay-line__name">{c.name}</span>
                      <Stepper value={l.qty} min={1} onChange={(q) => setQty(l.id, q)} />
                      <span className={`pay-line__price ${c.price === 0 ? "is-free" : ""}`}>
                        {c.price === 0 ? "Free" : `${money(linePrice)} Р`}
                      </span>
                    </div>
                  );
                })}
                {!lines.length && <div className="pay-side__empty">Добавьте каналы из списка слева</div>}
              </div>

              <div className="pay-side__total">
                <div className="pay-row">
                  <span className="muted">Стоимость за {PERIOD_LABEL[period]}</span>
                  <span>{money(subtotal)} Р</span>
                </div>
                {p.discount > 0 && (
                  <div className="pay-row pay-row--discount">
                    <span>Скидка {p.discount}%</span>
                    <span>-{money(discountValue)} Р</span>
                  </div>
                )}
                <div className="pay-row pay-row--grand">
                  <span>Итого за {PERIOD_LABEL[period]}</span>
                  <span>{money(total)} Р</span>
                </div>
              </div>

              {endDate && (
                <div className="pay-side__due">
                  <div className="pay-due__title">Расчёт окончания: {endDate}</div>
                  <p className="pay-due__text">
                    {lines.length
                      ? "Тариф продлится автоматически, если не отключить автосписание."
                      : "Добавьте хотя бы один канал, чтобы оформить тариф."}
                  </p>
                </div>
              )}

              <Button
                className="pay-side__pay"
                disabled={!lines.length}
                onClick={() => pushToast({ tone: "info", text: "Платёжный провайдер не подключён." })}
              >
                Оплатить
              </Button>

              <p className="pay-side__note">
                Для оплаты по счёту (от 5000 рублей) напишите на{" "}
                <a href="#" onClick={(e) => e.preventDefault()}>
                  billing@example.ru
                </a>
                . Закрывающие документы высылаем после оплаты.
              </p>
            </aside>
          </div>
        </>
      )}

      {tab === "history" && (
        <div className="pay-empty card">
          <Icon name="table" size={40} className="dim" />
          <div>Здесь появится история платежей по вашему тарифу</div>
        </div>
      )}

      {tab === "manage" && (
        <div className="pay-empty card">
          <Icon name="pencil" size={40} className="dim" />
          <div>Управление подписками и способами оплаты — в разработке</div>
        </div>
      )}

      <ToastStack>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            tone={toast.tone}
            onClose={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
          >
            {toast.text}
          </Toast>
        ))}
      </ToastStack>
    </div>
  );
}
