import Icon from '../components/icons/Icon.jsx'
import ChannelIcon, { ChannelIconStack } from '../components/icons/ChannelIcon.jsx'
import { Button, Badge, Tabs, InfoBanner } from '../components/ui/ui.jsx'
import { CONNECTABLE, CONNECTED } from '../data/mock.js'
import './channels.css'

export default function ChannelsPage({ navigate }) {
  return (
    <div>
      <h1 className="page-title">Каналы связи</h1>

      <div className="ch-alert">
        <span className="ch-alert__ic">
          <Icon name="info" size={18} />
        </span>
        <div className="ch-alert__body">
          <div className="ch-alert__title">У вас не оплачен тариф</div>
          <div className="ch-alert__text">
            Платные каналы не работают. После оплаты тарифа они возобновят свою работу
            автоматически
          </div>
        </div>
        <Button onClick={() => navigate('payments')}>Перейти к оплате тарифа</Button>
      </div>

      <Tabs
        items={[
          { id: 'main', label: 'Основные' },
          { id: 'site', label: 'Чат на сайт' },
        ]}
        active="main"
        onChange={() => {}}
      />

      <div className="ch-manage">
        <Button variant="outline" icon="users">
          Управлять доступами
        </Button>
        <a href="#" onClick={(e) => e.preventDefault()}>
          Настроить уведомления
        </a>
      </div>

      <div className="ch-table">
        <div className="ch-table__head">
          <span>Канал</span>
          <span>Статус</span>
          <span>
            Работает до <Icon name="info" size={13} />
          </span>
          <span>Действия</span>
        </div>
        {CONNECTED.map((c) => (
          <div key={c.id} className="ch-table__row">
            <div className="ch-table__channel">
              <ChannelIcon id={c.channel} size={34} />
              <span className="ch-table__name">{c.name}</span>
              <Icon name="info" size={14} className="dim" />
            </div>
            <div>
              <Badge tone="red">
                {c.statusLabel} <Icon name="info" size={13} />
              </Badge>
            </div>
            <div className="dim">—</div>
            <div>
              <button className="ch-table__more" title="Действия">
                <Icon name="dots" size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="section-title">Можно подключить ещё</h2>
      <div className="ch-grid">
        {CONNECTABLE.map((c) => (
          <button key={c.id} className="ch-card" title={`Подключить ${c.name}`}>
            {c.badge && (
              <span className={`ch-card__corner ${c.badge === 'Beta' ? 'is-beta' : ''}`}>
                {c.badge}
              </span>
            )}
            <span className="ch-card__plus">
              <Icon name="plus" size={13} />
            </span>
            <ChannelIcon id={c.id} size={44} />
            <span className="ch-card__name">{c.name}</span>
          </button>
        ))}
        <button className="ch-card" title="Другие каналы">
          <ChannelIconStack
            ids={['autoru', 'max', 'ok', 'viber', 'phone']}
            size={22}
          />
          <span className="ch-card__name">Другое</span>
        </button>
      </div>

      <InfoBanner
        tone="info"
        icon={
          <span className="ch-coin">
            <Icon name="wallet" size={16} />
          </span>
        }
        action={
          <Button variant="outline" size="sm">
            Как подключить канал
          </Button>
        }
      >
        Каналы подключаются за пару минут: авторизуйтесь в мессенджере — и диалоги появятся
        в едином окне.
      </InfoBanner>
    </div>
  )
}
