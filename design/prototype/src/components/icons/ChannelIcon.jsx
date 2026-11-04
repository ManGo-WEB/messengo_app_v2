/* Круглые брендированные иконки каналов связи.
   mono=true — «неактивный» серо-голубой вариант (как в тарифной сетке). */

const GLYPHS = {
  phone: (
    <path
      d="M6.8 10.9c1.3 2.6 3.7 5 6.3 6.3l2.1-2.1c.3-.3.7-.4 1-.3 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1v3.3c0 .6-.4 1-1 1-8.8 0-16.4-7.6-16.4-16.4 0-.6.4-1 1-1h3.3c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.3 0 .7-.3 1l-2.1 2.1Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  send: (
    <path d="M3 20.2 21.5 12 3 3.8v6.3L15 12 3 13.9v6.3Z" fill="currentColor" stroke="none" />
  ),
  envelope: (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4.5 7.5 7.5 5.6 7.5-5.6" />
    </g>
  ),
  camera: (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3.8" y="3.8" width="16.4" height="16.4" rx="4.5" />
      <circle cx="12" cy="12" r="3.6" />
      <circle cx="16.9" cy="7.1" r="1" fill="currentColor" stroke="none" />
    </g>
  ),
  chat: (
    <path
      d="M12 3.6c4.9 0 8.9 3.2 8.9 7.2s-4 7.2-8.9 7.2c-.9 0-1.9-.1-2.7-.3L5 19.9l.9-2.9c-1.7-1.3-2.8-3.4-2.8-6.2 0-4 4-7.2 8.9-7.2Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  bolt: (
    <path d="M12.6 2.5 5.5 13h4.6l-1.2 8.5L16.8 11h-4.7l.5-8.5Z" fill="currentColor" stroke="none" />
  ),
  user: (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8.2" r="3.4" />
      <path d="M4.8 20c.8-3.4 3.7-5.3 7.2-5.3s6.4 1.9 7.2 5.3" />
    </g>
  ),
  personOk: (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="7.4" r="3.1" />
      <path d="M6.6 13.2c3.3 2.3 7.5 2.3 10.8 0M9.3 16.6l-2 4M14.7 16.6l2 4" />
    </g>
  ),
  avito: (
    <g>
      <circle cx="8" cy="7.8" r="2.6" fill="#97CF26" stroke="none" />
      <circle cx="15.9" cy="6.8" r="1.7" fill="#FF4053" stroke="none" />
      <circle cx="16.7" cy="14.3" r="2.6" fill="#00AAFF" stroke="none" />
      <circle cx="8.3" cy="16" r="1.7" fill="#97CF26" stroke="none" />
    </g>
  ),
  discord: (
    <g fill="currentColor">
      <ellipse cx="9.2" cy="12" rx="1.8" ry="2.2" />
      <ellipse cx="14.8" cy="12" rx="1.8" ry="2.2" />
    </g>
  ),
  logoOff: (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2" />
    </g>
  ),
}

const BRANDS = {
  whatsapp: { bg: '#25D366', glyph: 'phone' },
  telegram: { bg: '#229ED9', glyph: 'send' },
  vk: { bg: '#0077FF', text: 'VK' },
  instagram: {
    bg: 'linear-gradient(45deg,#f7c948 0%,#ee2a7b 55%,#6228d7 100%)',
    glyph: 'camera',
  },
  avito: { bg: '#ffffff', fg: '#97cf26', glyph: 'avito', border: true },
  max: { bg: 'linear-gradient(135deg,#8b5cf6,#4e7cff)', text: 'M' },
  email: { bg: '#7b68ee', glyph: 'envelope' },
  messenger: { bg: 'linear-gradient(180deg,#00b2ff,#006aff)', glyph: 'bolt' },
  facebook: { bg: '#1877F2', text: 'f' },
  discord: { bg: '#5865F2', glyph: 'discord' },
  viber: { bg: '#7360F2', glyph: 'phone' },
  ok: { bg: '#F7931E', glyph: 'personOk' },
  autoru: { bg: '#FF3D00', text: 'auto', small: true },
  chatsite: { bg: '#14b8c9', glyph: 'chat' },
  operator: { bg: '#8395AB', glyph: 'user' },
  phone: { bg: '#27ae60', glyph: 'phone' },
  logo: { bg: '#b7c3d4', glyph: 'logoOff' },
  bitrix: { bg: '#2fc7f7', text: '24' },
  amo: { bg: '#339dc7', text: 'amo', small: true },
  ytiger: { bg: '#ff8a3c', text: 'yT' },
  moysklad: { bg: '#70b75c', text: 'МС' },
  met: { bg: '#64748b', text: 'МЭТ', small: true },
}

/* Алиасы: разные продукты на базе одного мессенджера */
const ALIASES = {
  waapi: 'whatsapp',
  tgbot: 'telegram',
  maxbot: 'max',
}

export default function ChannelIcon({ id, size = 32, mono = false, className = '' }) {
  const b = BRANDS[ALIASES[id] || id] || { bg: '#94a3b8', text: '?' }
  const bg = mono ? '#e9f0fd' : b.bg
  const fg = mono ? '#7aa5f2' : b.fg || '#ffffff'
  const glyph = b.glyph && (
    <svg
      width={Math.round(size * 0.58)}
      height={Math.round(size * 0.58)}
      viewBox="0 0 24 24"
      style={{ color: fg }}
      aria-hidden="true"
    >
      {GLYPHS[b.glyph]}
    </svg>
  )
  const text = b.text && (
    <span
      style={{
        color: fg,
        fontSize: Math.round(size * (b.small ? 0.3 : 0.4)),
        fontWeight: 800,
        lineHeight: 1,
        letterSpacing: b.small ? '-0.02em' : 0,
      }}
    >
      {b.text}
    </span>
  )
  return (
    <span
      className={`ch-icon ${className}`}
      style={{
        width: size,
        height: size,
        background: bg,
        border: b.border && !mono ? '1px solid var(--border)' : 'none',
        fontSize: size,
      }}
      aria-hidden="true"
    >
      {glyph || text}
    </span>
  )
}

/* Стопка мелких иконок — карточка «Другое» */
export function ChannelIconStack({ ids = [], size = 24 }) {
  return (
    <span className="ch-stack" style={{ height: size }}>
      {ids.map((id) => (
        <ChannelIcon key={id} id={id} size={size} />
      ))}
    </span>
  )
}
