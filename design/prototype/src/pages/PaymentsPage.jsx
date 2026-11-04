import { useMemo, useState } from 'react'
import Icon from '../components/icons/Icon.jsx'
import ChannelIcon from '../components/icons/ChannelIcon.jsx'
import { Button, Badge, Tabs, InfoBanner, Stepper } from '../components/ui/ui.jsx'
import { CATALOG, catalogById } from '../data/mock.js'
import { money, addMonths, formatDate } from '../lib/util.js'
import './payments.css'

const PERIODS = [
  { id: 'm1', label: 'Месяц', months: 1, discount: 0 },
  { id: 'm6', label: 'Полгода', months: 6, discount: 10 },
  { id: 'm12', label: 'Год', months: 12, discount: 35 },
  { id: 'm24', label: '2 года', months: 24, discount: 50 },
]

const PERIOD_LABEL = { m1: 'Месяц', m6: 'Полгода', m12: 'Год', m24: '2 года' }

export default function PaymentsPage() {
  const [tab, setTab] = useState('tariff')
  const [period, setPeriod] = useState('m12')
  const [lines, setLines] = useState([
    { id: 'site', qty: 1 },
    { id: 'logo', qty: 1 },
    { id: 'vk', qty: 1 },
  ])

  const p = PERIODS.find((x) => x.id === period)
  const inTariff = (id) => lines.some((l) => l.id === id)

  const toggleChannel = (id) => {
    setLines((prev) =>
      prev.some((l) => l.id === id) ? prev.filter((l) => l.id !== id) : [...prev, { id, qty: 1 }],
    )
  }

  const setQty = (id, qty) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, qty } : l)))

  const subtotal = useMemo(
    () =>
      lines.reduce((s, l) => {
        const c = catalogById(l.id)
        return s + (c ? c.price * l.qty * p.months : 0)
      }, 0),
    [lines, p],
  )
  const discountValue = Math.round((subtotal * p.discount) / 100)
  const total = subtotal - discountValue
  const endDate = formatDate(addMonths(new Date(), p.months))

  return (
    <div>
      <h1 className="page-title">Оплаты</h1>

      <Tabs
        items={[
          { id: 'tariff', label: 'Мой тариф' },
          { id: 'history', label: 'История' },
          { id: 'manage', label: 'Управление платежами' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'tariff' && (
        <>
          <div className="pay-space" />
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
                    className={`pay-period ${period === x.id ? 'is-active' : ''}`}
                    onClick={() => setPeriod(x.id)}
                  >
                    {x.label}
                    {x.discount > 0 && <span className="pay-period__disc">-{x.discount}%</span>}
                  </button>
                ))}
              </div>

              <div className="pay-grid">
                {CATALOG.map((c) => {
                  const active = inTariff(c.id)
                  return (
                    <button
                      key={c.id}
                      className={`pay-tile ${active ? 'is-in-tariff' : ''}`}
                      onClick={() => toggleChannel(c.id)}
                      title={active ? 'Убрать из тарифа' : 'Добавить в тариф'}
                    >
                      {c.badge && <span className="pay-tile__corner">Beta</span>}
                      <ChannelIcon id={c.icon} size={56} mono={!active} />
                      <span className={`pay-tile__price ${c.price === 0 ? 'is-free' : ''}`}>
                        {c.price === 0 ? 'Free' : `${money(c.price * p.months)} Р`}
                      </span>
                      <span className="pay-tile__name">{c.name}</span>
                    </button>
                  )
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
                  const c = catalogById(l.id)
                  const linePrice = c.price * l.qty * p.months
                  return (
                    <div key={l.id} className="pay-line">
                      <ChannelIcon id={c.icon} size={30} />
                      <span className="pay-line__name">{c.name}</span>
                      <Stepper value={l.qty} min={1} onChange={(q) => setQty(l.id, q)} />
                      <span className={`pay-line__price ${c.price === 0 ? 'is-free' : ''}`}>
                        {c.price === 0 ? 'Free' : `${money(linePrice)} Р`}
                      </span>
                    </div>
                  )
                })}
                {!lines.length && (
                  <div className="pay-side__empty">Добавьте каналы из списка слева</div>
                )}
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

              <div className="pay-side__due">
                <div className="pay-due__title">Расчёт окончания: {endDate}</div>
                <p className="pay-due__text">
                  {lines.length
                    ? 'Тариф продлится автоматически, если не отключить автосписание.'
                    : 'Добавьте хотя бы один канал, чтобы оформить тариф.'}
                </p>
              </div>

              <Button className="pay-side__pay" disabled={!lines.length}>
                Оплатить
              </Button>

              <p className="pay-side__note">
                Для оплаты по счёту (от 5000 рублей) напишите на{' '}
                <a href="#" onClick={(e) => e.preventDefault()}>
                  billing@example.ru
                </a>
                . Закрывающие документы высылаем после оплаты.
              </p>
            </aside>
          </div>
        </>
      )}

      {tab === 'history' && (
        <div className="pay-empty card">
          <Icon name="table" size={40} className="dim" />
          <div>Здесь появится история платежей по вашему тарифу</div>
        </div>
      )}

      {tab === 'manage' && (
        <div className="pay-empty card">
          <Icon name="pencil" size={40} className="dim" />
          <div>Управление подписками и способами оплаты — в разработке</div>
        </div>
      )}
    </div>
  )
}
