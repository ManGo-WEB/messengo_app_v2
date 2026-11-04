import { useMemo, useState } from 'react'
import Icon from '../components/icons/Icon.jsx'
import { Button, FilterChip } from '../components/ui/ui.jsx'
import { TASKS, TASK_STATUS } from '../data/mock.js'
import { dateKey, monthNameNom } from '../lib/util.js'
import './calendar.css'

const WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
const VIEWS = [
  { id: 'day', label: 'День' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
]

export default function CalendarPage() {
  const [view, setView] = useState('month')
  const [cursor, setCursor] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const today = new Date()

  const tasksByKey = useMemo(() => {
    const map = {}
    for (const t of TASKS) {
      const k = dateKey(t.date)
      ;(map[k] = map[k] || []).push(t)
    }
    return map
  }, [])

  const stats = useMemo(
    () => ({
      total: TASKS.length,
      active: TASKS.filter((t) => t.status === 'active').length,
      done: TASKS.filter((t) => t.status === 'done').length,
      overdue: TASKS.filter((t) => t.status === 'overdue').length,
    }),
    [],
  )

  /* Сетка месяца: 6 недель, неделя начинается с воскресенья */
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = new Date(first)
    start.setDate(first.getDate() - first.getDay())
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [cursor])

  const shift = (n) =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1))
  const goToday = () => {
    const n = new Date()
    setCursor(new Date(n.getFullYear(), n.getMonth(), 1))
  }

  const sameDay = (a, b) => dateKey(a) === dateKey(b)
  const inMonth = (d) => d.getMonth() === cursor.getMonth()

  return (
    <div className="cal">
      <div className="cal__toolbar">
        <button className="inbox__funnel" title="Фильтры">
          <Icon name="filter" size={16} />
        </button>
        <div className="cal__chips">
          {['Ответственный', 'Автор', 'Источники', 'Тип задачи'].map((f) => (
            <FilterChip key={f} label={f} />
          ))}
        </div>
        <div className="cal__views">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={`cal__view ${view === v.id ? 'is-active' : ''}`}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="cal__month">
          <span className="cal__month-name">
            {monthNameNom(cursor.getMonth())} {cursor.getFullYear()}
          </span>
          <button className="cal__nav" onClick={() => shift(-1)} title="Предыдущий месяц">
            <Icon name="chevronLeft" size={15} />
          </button>
          <button className="cal__nav" onClick={() => shift(1)} title="Следующий месяц">
            <Icon name="chevronRight" size={15} />
          </button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Сегодня
          </Button>
        </div>

        <div className="cal__stats">
          <span className="cal-stat cal-stat--total">Всего {stats.total}</span>
          <span className="cal-stat cal-stat--active">В работе {stats.active}</span>
          <span className="cal-stat cal-stat--done">Выполненные {stats.done}</span>
          <span className="cal-stat cal-stat--overdue">Просроченные {stats.overdue}</span>
        </div>
      </div>

      <div className="cal__weekdays">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      <div className="cal__grid">
        {cells.map((d, i) => {
          const dayTasks = tasksByKey[dateKey(d)] || []
          const isToday = sameDay(d, today)
          return (
            <div
              key={i}
              className={`cal-cell ${inMonth(d) ? '' : 'is-out'} ${isToday ? 'is-today' : ''} ${
                d.getDay() === 0 || d.getDay() === 6 ? 'is-weekend' : ''
              }`}
            >
              <span className="cal-cell__num">{d.getDate()}</span>
              <div className="cal-cell__tasks">
                {dayTasks.map((t) => (
                  <div key={t.id} className="cal-task" title={`${t.title} · ${t.time} · ${t.assignee}`}>
                    <span className="cal-task__dot" style={{ background: TASK_STATUS[t.status].color }} />
                    <span className="cal-task__title">{t.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
