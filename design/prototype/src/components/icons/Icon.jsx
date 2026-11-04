/* Набор UI-иконок (24×24, stroke = currentColor) */
const P = {
  chat: (
    <path d="M12 3.4c5 0 9 3.3 9 7.4s-4 7.4-9 7.4c-1 0-1.9-.1-2.8-.3L5 20.3l1-3.1c-2-1.4-3.2-3.7-3.2-6.4 0-4.1 4.2-7.4 9.2-7.4Z" />
  ),
  kanban: (
    <g>
      <rect x="3.8" y="4" width="4.6" height="16" rx="1.4" />
      <rect x="9.7" y="4" width="4.6" height="11" rx="1.4" />
      <rect x="15.6" y="4" width="4.6" height="14" rx="1.4" />
    </g>
  ),
  tasks: (
    <g>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4M9.3 14.6l1.9 1.9 3.6-3.6" />
    </g>
  ),
  users: (
    <g>
      <circle cx="9" cy="8.2" r="3.2" />
      <path d="M3.4 19.2c.6-3 2.9-4.9 5.6-4.9s5 1.9 5.6 4.9" />
      <path d="M15.4 5.4a3.2 3.2 0 0 1 0 5.6M17.7 14.6c1.7.7 2.9 2.3 3.3 4.6" />
    </g>
  ),
  chart: (
    <g>
      <path d="M4 4v15.2c0 .4.4.8.8.8H20" />
      <path d="m7.5 13.5 3.4-4 3.2 2.6 4.6-5.6" />
    </g>
  ),
  tools: (
    <g>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 12.4h17" />
    </g>
  ),
  wallet: (
    <g>
      <path d="M4 7.8A2.8 2.8 0 0 1 6.8 5h9.4A2.8 2.8 0 0 1 19 7.8V8h1a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7.8Z" />
      <path d="M15 14.5h2.5" />
    </g>
  ),
  gear: (
    <g>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8" />
    </g>
  ),
  help: (
    <g>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M9.6 9.3c.3-1.3 1.3-2.1 2.6-2.1 1.4 0 2.5.9 2.5 2.2 0 1.8-2.4 1.9-2.4 3.5" />
      <path d="M12.2 16.4h.01" strokeWidth="2.4" />
    </g>
  ),
  bell: (
    <g>
      <path d="M18.2 16.2H5.8c1.2-1.2 1.9-2.3 1.9-4.7V9.6a4.3 4.3 0 0 1 8.6 0v1.9c0 2.4.7 3.5 1.9 4.7Z" />
      <path d="M10 19.2a2.1 2.1 0 0 0 4 0" />
    </g>
  ),
  search: (
    <g>
      <circle cx="11" cy="11" r="6.4" />
      <path d="m15.8 15.8 4.4 4.4" />
    </g>
  ),
  filter: <path d="M4 5h16l-6.2 7.2v5.2L10.2 19v-6.8L4 5Z" />,
  chevronDown: <path d="m6.5 9.3 5.5 5.4 5.5-5.4" />,
  chevronLeft: <path d="M14.5 6.5 9 12l5.5 5.5" />,
  chevronRight: <path d="m9.5 6.5 5.5 5.5-5.5 5.5" />,
  collapse: (
    <g>
      <path d="M5 5v14M20 12H9.5M9.5 12l3.2-3.2M9.5 12l3.2 3.2" />
    </g>
  ),
  pencil: <path d="M12.5 20.2H21M16.6 3.6a2.1 2.1 0 0 1 3 3L7.3 18.9l-4.1 1.1 1.1-4.1L16.6 3.6Z" />,
  dots: (
    <g fill="currentColor" stroke="none">
      <circle cx="5.5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18.5" cy="12" r="1.7" />
    </g>
  ),
  info: (
    <g>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11v5M12 7.8h.01" strokeWidth="2.2" />
    </g>
  ),
  checks: (
    <g>
      <path d="m2.8 12.6 3.4 3.4 6.8-7" />
      <path d="m10.4 14.6 2.6 2.6L21.6 8.6" />
    </g>
  ),
  bolt: <path d="M13.2 2.4 5 13.4h4.9l-1.1 8.2 8.4-11.2h-5l1-8Z" fill="currentColor" stroke="none" />,
  envelope: (
    <g>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4.5 7.5 7.5 5.6 7.5-5.6" />
    </g>
  ),
  phone: (
    <path d="M6.8 10.9c1.3 2.6 3.7 5 6.3 6.3l2.1-2.1c.3-.3.7-.4 1-.3 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1v3.3c0 .6-.4 1-1 1-8.8 0-16.4-7.6-16.4-16.4 0-.6.4-1 1-1h3.3c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.3 0 .7-.3 1l-2.1 2.1Z" />
  ),
  lock: (
    <g>
      <rect x="5.5" y="10.5" width="13" height="9" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </g>
  ),
  globe: (
    <g>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 3.4c2.6 2.5 2.6 14.7 0 17.2M12 3.4c-2.6 2.5-2.6 14.7 0 17.2M3.4 12h17.2" />
    </g>
  ),
  home: (
    <g>
      <path d="m4 10.8 8-7 8 7" />
      <path d="M6.3 9v10.2c0 .4.4.8.8.8h9.8c.4 0 .8-.4.8-.8V9" />
    </g>
  ),
  logout: (
    <g>
      <path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" />
      <path d="M9.5 12h11M17.5 9l3 3-3 3" />
    </g>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  user: (
    <g>
      <circle cx="12" cy="8.2" r="3.5" />
      <path d="M4.8 20c.8-3.6 3.7-5.6 7.2-5.6s6.4 2 7.2 5.6" />
    </g>
  ),
  folder: (
    <path
      d="M3.5 7A2.5 2.5 0 0 1 6 4.5h3.2c.7 0 1.4.3 1.9.9l1 1.1H18A2.5 2.5 0 0 1 20.5 9v8a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17V7Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  send: <path d="M3 20.2 21.5 12 3 3.8v6.3L15 12 3 13.9v6.3Z" fill="currentColor" stroke="none" />,
  paperclip: <path d="m8.4 12.4 6.8-6.8a3.2 3.2 0 0 1 4.5 4.5l-8 8a5 5 0 0 1-7.1-7.1l7.8-7.8" />,
  eye: (
    <g>
      <path d="M2.6 12S6.1 5.6 12 5.6 21.4 12 21.4 12 17.9 18.4 12 18.4 2.6 12 2.6 12Z" />
      <circle cx="12" cy="12" r="2.9" />
    </g>
  ),
  eyeOff: (
    <g>
      <path d="M2.6 12S6.1 5.6 12 5.6c1.6 0 3 .4 4.3 1M21.4 12s-3.5 6.4-9.4 6.4c-1.6 0-3-.4-4.3-1" />
      <circle cx="12" cy="12" r="2.9" />
      <path d="M4 20 20 4" />
    </g>
  ),
  download: (
    <g>
      <path d="M12 4v10.5M7.5 10.5l4.5 4.5 4.5-4.5" />
      <path d="M5 19.5h14" />
    </g>
  ),
  trash: (
    <g>
      <path d="M4.5 7h15M9.5 7V5.6A1.6 1.6 0 0 1 11.1 4h1.8a1.6 1.6 0 0 1 1.6 1.6V7" />
      <path d="M6.5 7l.8 11.9a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9L17.5 7" />
    </g>
  ),
  percent: (
    <g>
      <path d="M5.5 18.5 18.5 5.5" />
      <circle cx="7.7" cy="7.7" r="2.4" />
      <circle cx="16.3" cy="16.3" r="2.4" />
    </g>
  ),
  headset: (
    <g>
      <path d="M4 13.5v-2a8 8 0 0 1 16 0v2" />
      <rect x="3.6" y="13.2" width="4" height="6" rx="1.4" />
      <rect x="16.4" y="13.2" width="4" height="6" rx="1.4" />
    </g>
  ),
  table: (
    <g>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M9.5 9.5v10M15.5 9.5v10" />
    </g>
  ),
  arrowLeft: <path d="M20 12H4.5M10.5 6 4.5 12l6 6" />,
  spark: (
    <path d="M12 3.5 13.8 9 19.5 11 13.8 13 12 18.5 10.2 13 4.5 11 10.2 9 12 3.5Z" fill="currentColor" stroke="none" />
  ),
  key: (
    <g>
      <circle cx="8" cy="15.5" r="4" />
      <path d="m11 12.5 8-8M16 7.5l2.5 2.5M13.5 10l2 2" />
    </g>
  ),
}

export default function Icon({ name, size = 20, className = '', style }) {
  return (
    <svg
      className={`icon ${className}`}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {P[name] || P.dots}
    </svg>
  )
}
