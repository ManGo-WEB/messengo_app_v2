import Icon from '../icons/Icon.jsx'
import './ui.css'

/* ---------- Кнопка ---------- */
export function Button({ variant = 'primary', size = 'md', icon, children, className = '', ...rest }) {
  return (
    <button className={`btn btn--${variant} btn--${size} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children}
    </button>
  )
}

/* ---------- Плашка статуса ---------- */
const TONES = {
  green: 'badge--green',
  red: 'badge--red',
  blue: 'badge--blue',
  yellow: 'badge--yellow',
  gray: 'badge--gray',
  outline: 'badge--outline',
}

export function Badge({ tone = 'gray', children, className = '', ...rest }) {
  return (
    <span className={`badge ${TONES[tone]} ${className}`} {...rest}>
      {children}
    </span>
  )
}

/* ---------- Табы (подчёркнутые и «пилюли») ---------- */
export function Tabs({ items, active, onChange, variant = 'underline' }) {
  return (
    <div className={`tabs tabs--${variant}`} role="tablist">
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={active === it.id}
          className={`tabs__item ${active === it.id ? 'is-active' : ''}`}
          onClick={() => onChange(it.id)}
        >
          {it.label}
          {it.count != null && <span className="tabs__count">{it.count}</span>}
        </button>
      ))}
    </div>
  )
}

/* ---------- Переключатель ---------- */
export function Toggle({ checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      className={`toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__knob" />
    </button>
  )
}

/* ---------- Степпер количества ---------- */
export function Stepper({ value, onChange, min = 0, max = 99 }) {
  return (
    <span className="stepper">
      <button
        className="stepper__btn"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Уменьшить"
      >
        <Icon name="close" size={11} style={{ strokeWidth: 2.6 }} />
      </button>
      <span className="stepper__val">{value}</span>
      <button
        className="stepper__btn"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Увеличить"
      >
        <Icon name="plus" size={12} style={{ strokeWidth: 2.4 }} />
      </button>
    </span>
  )
}

/* ---------- Чекбокс ---------- */
export function Checkbox({ checked, onChange, label }) {
  return (
    <label className={`checkbox ${checked ? 'is-checked' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="checkbox__box" aria-hidden="true">
        <svg viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="m1.5 5.2 2.8 2.8 5.7-6" />
        </svg>
      </span>
      {label && <span className="checkbox__label">{label}</span>}
    </label>
  )
}

/* ---------- Поиск ---------- */
export function SearchInput({ value, onChange, placeholder = 'Поиск...', width = 220 }) {
  return (
    <label className="search" style={{ width }}>
      <Icon name="search" size={16} className="search__ic" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  )
}

/* ---------- Фильтр-чип «Название ▾» ---------- */
export function FilterChip({ label, value, onClick }) {
  return (
    <button className={`fchip ${value ? 'is-active' : ''}`} onClick={onClick}>
      {value || label}
      <Icon name="chevronDown" size={13} />
    </button>
  )
}

/* ---------- Инфо-баннер ---------- */
export function InfoBanner({ tone = 'info', icon, children, action }) {
  return (
    <div className={`ibanner ibanner--${tone}`}>
      {icon}
      <div className="ibanner__body">{children}</div>
      {action}
    </div>
  )
}

/* ---------- Аватар с инициалами ---------- */
const AV_COLORS = ['#5b8def', '#27ae60', '#f2994a', '#bb6bd9', '#eb5757', '#14b8c9']
export function Avatar({ name = '', size = 36, className = '' }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  const bg = AV_COLORS[Math.abs(hash) % AV_COLORS.length]
  return (
    <span
      className={`avatar ${className}`}
      style={{ width: size, height: size, background: bg, fontSize: Math.round(size * 0.38) }}
    >
      {initials || <Icon name="user" size={Math.round(size * 0.55)} />}
    </span>
  )
}
