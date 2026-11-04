import { useState } from 'react'
import Sidebar from './components/layout/Sidebar.jsx'
import TrialBanner from './components/layout/TrialBanner.jsx'
import Icon from './components/icons/Icon.jsx'
import InboxPage from './pages/InboxPage.jsx'
import ChannelsPage from './pages/ChannelsPage.jsx'
import PaymentsPage from './pages/PaymentsPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import BoardPage from './pages/BoardPage.jsx'
import CalendarPage from './pages/CalendarPage.jsx'

/* Страницы-заглушки для разделов вне скоупа прототипа */
function StubPage({ icon, title }) {
  return (
    <div className="stub">
      <span className="stub__ic">
        <Icon name={icon} size={26} />
      </span>
      <div className="stub__title">{title}</div>
      <p className="stub__text">
        Раздел спроектирован в навигации, но его вёрстка не входит в текущий прототип.
      </p>
    </div>
  )
}

const PAGES = {
  inbox: { comp: InboxPage, wide: true, banner: false },
  channels: { comp: ChannelsPage, wide: false, banner: true },
  board: { comp: BoardPage, wide: true, banner: false },
  calendar: { comp: CalendarPage, wide: true, banner: false },
  payments: { comp: PaymentsPage, wide: false, banner: true },
  settings: { comp: SettingsPage, wide: false, banner: true },
  visitors: {
    comp: (p) => <StubPage icon="users" title="Посетители" />,
    wide: false,
    banner: false,
  },
  analytics: {
    comp: (p) => <StubPage icon="chart" title="Аналитика" />,
    wide: false,
    banner: false,
  },
  tools: {
    comp: (p) => <StubPage icon="tools" title="Инструменты" />,
    wide: false,
    banner: false,
  },
}

export default function App() {
  const [page, setPage] = useState('inbox')
  const { comp: Page, wide, banner } = PAGES[page]

  return (
    <div className="app">
      <Sidebar page={page} onNavigate={setPage} />
      <div className="main">
        {banner && <TrialBanner onPay={() => setPage('payments')} />}
        <div className={`content ${wide ? 'content--wide' : ''}`}>
          <Page navigate={setPage} />
        </div>
      </div>
    </div>
  )
}
