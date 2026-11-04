import { useMemo, useState } from 'react'
import Icon from '../components/icons/Icon.jsx'
import ChannelIcon from '../components/icons/ChannelIcon.jsx'
import { Tabs, Checkbox, SearchInput, FilterChip, Badge } from '../components/ui/ui.jsx'
import { DIALOGS, funnelById } from '../data/mock.js'
import { money } from '../lib/util.js'
import ChatPanel from './ChatPanel.jsx'
import './inbox.css'

const FILTERS = [
  'Каналы',
  'Источники',
  'Статус воронки',
  'Ответственный',
  'Теги',
  'Дата',
  'Тип обращения',
]

export default function InboxPage() {
  const [tab, setTab] = useState('accepted')
  const [search, setSearch] = useState('')
  const [firstContactOnly, setFirstContactOnly] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  const counts = useMemo(
    () =>
      DIALOGS.reduce((acc, d) => {
        acc[d.tab] = (acc[d.tab] || 0) + 1
        return acc
      }, {}),
    [],
  )

  const dialogs = DIALOGS.filter(
    (d) =>
      d.tab === tab &&
      (!firstContactOnly || d.status === 'unaccepted') &&
      d.client.toLowerCase().includes(search.toLowerCase()),
  )

  const selected = DIALOGS.find((d) => d.id === selectedId)

  return (
    <div className="inbox">
      <div className="inbox__list">
        <div className="inbox__toolbar">
          <Tabs
            variant="pills"
            items={[
              { id: 'new', label: 'Новые', count: counts.new || 0 },
              { id: 'accepted', label: 'Принятые', count: counts.accepted || 0 },
              { id: 'archive', label: 'Архив', count: counts.archive || 0 },
            ]}
            active={tab}
            onChange={(id) => {
              setTab(id)
              setSelectedId(null)
            }}
          />
          <span className="inbox__sep" />
          <Checkbox
            checked={firstContactOnly}
            onChange={setFirstContactOnly}
            label="Написать первым"
          />
          <span className="inbox__sep" />
          <button className="inbox__funnel" title="Фильтры">
            <Icon name="filter" size={16} />
          </button>
          <div className="inbox__chips">
            {FILTERS.map((f) => (
              <FilterChip key={f} label={f} />
            ))}
          </div>
          <SearchInput value={search} onChange={setSearch} placeholder="Искать..." />
        </div>

        <div className="inbox__table">
          <div className="inbox__select">
            <Checkbox checked={false} onChange={() => {}} label={`Выбрать всё ${dialogs.length}`} />
          </div>

        <div className="inbox__head">
          <span />
          <span>Клиент</span>
          <span>Статус воронки</span>
          <span>Время ответа</span>
          <span>Цена</span>
          <span>Задачи</span>
          <span>Теги</span>
          <span>Источник</span>
        </div>

        <div className="inbox__rows">
          {dialogs.map((d) => {
            const st = funnelById(d.status)
            return (
              <div
                key={d.id}
                className={`inbox__row ${selectedId === d.id ? 'is-selected' : ''}`}
                onClick={() => setSelectedId(selectedId === d.id ? null : d.id)}
              >
                <span className="inbox__cell-check">
                  <Checkbox
                    checked={false}
                    onChange={() => {}}
                  />
                </span>
                <div className="inbox__client">
                  <div className="inbox__client-top">
                    <span className="inbox__name">{d.client}</span>
                    <Icon name="checks" size={15} className="inbox__checks" />
                    <span className="inbox__date">{d.date}</span>
                  </div>
                  <div className="inbox__client-sub">
                    <ChannelIcon id={d.channel} size={16} />
                    <span>{money(d.price)}</span>
                  </div>
                </div>
                <div>
                  <button className={`inbox__status ${selectedId === d.id ? 'is-open' : ''}`}>
                    <span className="inbox__dot" style={{ background: st?.color }} />
                    {st?.label}
                    <Icon name="chevronDown" size={13} className="inbox__status-chev" />
                  </button>
                </div>
                <div className="inbox__answer">
                  <Icon name="bolt" size={14} />
                  <span>{d.answer}</span>
                </div>
                <div className="dim">{money(d.price)}</div>
                <div>
                  {d.tasks ? (
                    <Icon name="bell" size={16} className="muted" />
                  ) : (
                    <span className="dim">—</span>
                  )}
                </div>
                <div className="inbox__tags">
                  {d.tags.length ? (
                    d.tags.map((t) => (
                      <Badge key={t} tone="gray">
                        {t}
                      </Badge>
                    ))
                  ) : (
                    <span className="dim">—</span>
                  )}
                </div>
                <div className="inbox__source">
                  <ChannelIcon id={d.channel} size={18} />
                  <span>{d.source}</span>
                </div>
              </div>
            )
          })}
          {!dialogs.length && <div className="inbox__empty">Диалогов нет</div>}
          </div>
        </div>
      </div>

      {selected && <ChatPanel dialog={selected} onClose={() => setSelectedId(null)} />}
    </div>
  )
}
