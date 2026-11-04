import Icon from '../icons/Icon.jsx'
import './sidebar.css'

const NAV = [
  { id: 'inbox', icon: 'chat', label: 'Чаты' },
  { id: 'channels', icon: 'send', label: 'Каналы' },
  { id: 'board', icon: 'kanban', label: 'Воронка' },
  { id: 'calendar', icon: 'tasks', label: 'Задачи' },
  { id: 'visitors', icon: 'users', label: 'Посетители' },
  { id: 'analytics', icon: 'chart', label: 'Аналитика' },
  { id: 'tools', icon: 'tools', label: 'Инструменты' },
  { id: 'payments', icon: 'wallet', label: 'Оплаты' },
  { id: 'settings', icon: 'gear', label: 'Настройки' },
]

export default function Sidebar({ page, onNavigate }) {
  return (
    <aside className="side">
      <nav className="side__nav">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`side__item ${page === item.id ? 'is-active' : ''}`}
            onClick={() => onNavigate(item.id)}
            title={item.label}
          >
            <span className="side__ic">
              <Icon name={item.icon} size={21} />
            </span>
            <span className="side__label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="side__bottom">
        <button className="side__item" title="Помощь">
          <span className="side__ic">
            <Icon name="help" size={21} />
          </span>
          <span className="side__label">Помощь</span>
        </button>
        <button className="side__item" title="Уведомления">
          <span className="side__ic">
            <Icon name="bell" size={21} />
            <span className="side__badge">2</span>
          </span>
          <span className="side__label">Уведомления</span>
        </button>
      </div>
    </aside>
  )
}
