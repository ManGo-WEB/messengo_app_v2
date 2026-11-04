import { useState } from 'react'
import Icon from '../components/icons/Icon.jsx'
import { Button, Tabs, Toggle, Avatar } from '../components/ui/ui.jsx'
import './settings.css'

function FieldRow({ icon, label, hint, children, onEdit }) {
  return (
    <div className="set-row">
      <span className="set-row__ic">
        <Icon name={icon} size={18} />
      </span>
      <span className="set-row__label">
        {label}
        {hint && (
          <Icon name="info" size={13} className="dim set-row__hint" />
        )}
      </span>
      <div className="set-row__value">{children}</div>
      <button className="set-row__edit" onClick={onEdit} title="Изменить">
        <Icon name="pencil" size={15} />
      </button>
    </div>
  )
}

const NOTIFICATIONS = [
  { id: 'new', label: 'Новые диалоги', hint: 'Пуши при входящем сообщении' },
  { id: 'mention', label: 'Упоминания и ответы', hint: 'Когда вас упоминают в диалоге' },
  { id: 'sound', label: 'Звук уведомлений', hint: '' },
  { id: 'digest', label: 'Email-дайджест', hint: 'Сводка за день на почту' },
]

export default function SettingsPage() {
  const [tab, setTab] = useState('profile')
  const [topMenu, setTopMenu] = useState(false)
  const [notif, setNotif] = useState({ new: true, mention: true, sound: false, digest: true })

  return (
    <div>
      <h1 className="page-title">Настройки</h1>

      <Tabs
        items={[
          { id: 'profile', label: 'Профиль' },
          { id: 'notif', label: 'Уведомления' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'profile' && (
        <>
          <div className="set-profile">
            <Avatar name="Н П" size={56} className="set-profile__avatar" />
            <div className="set-profile__who">
              <div className="set-profile__name">
                Никита
                <button className="set-profile__edit" title="Переименовать">
                  <Icon name="pencil" size={14} />
                </button>
              </div>
              <div className="set-profile__role">Администратор</div>
            </div>
            <Button variant="outline" icon="logout">
              Выйти
            </Button>
          </div>

          <div className="set-fields">
            <FieldRow icon="phone" label="Телефон" onEdit={() => {}}>
              +7 964 410-60-18
            </FieldRow>
            <FieldRow icon="envelope" label="Почта" hint onEdit={() => {}}>
              info@example.ru
            </FieldRow>
            <FieldRow icon="lock" label="Пароль" onEdit={() => {}}>
              ••••••••
            </FieldRow>
          </div>

          <h3 className="set-subtitle">Дополнительно</h3>

          <div className="set-fields">
            <FieldRow icon="home" label="Стартовая страница" hint onEdit={() => {}}>
              Личный кабинет
            </FieldRow>
            <FieldRow icon="globe" label="Язык" onEdit={() => {}}>
              Русский
            </FieldRow>
          </div>

          <div className="set-toggle-row card">
            <span className="set-row__label">
              Верхнее меню в чате
              <Icon name="info" size={13} className="dim set-row__hint" />
            </span>
            <Toggle checked={topMenu} onChange={setTopMenu} />
          </div>
        </>
      )}

      {tab === 'notif' && (
        <div className="set-notif">
          {NOTIFICATIONS.map((n) => (
            <div key={n.id} className="set-toggle-row card">
              <span>
                <span className="set-row__label" style={{ display: 'inline-flex' }}>
                  {n.label}
                </span>
                {n.hint && <div className="dim set-notif__hint">{n.hint}</div>}
              </span>
              <Toggle
                checked={notif[n.id]}
                onChange={(v) => setNotif((prev) => ({ ...prev, [n.id]: v }))}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
