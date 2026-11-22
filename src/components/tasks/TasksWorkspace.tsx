"use client";

// Экран «Задачи» (план D5 п.1): календарь задач на моках прототипа
// (design/prototype/src/pages/CalendarPage.jsx). Точки «сегодня» и сетка
// месяца считаются от текущего времени только после гидрации —
// useSyncExternalStore с пустым серверным снимком (Next 16 не пререндерит
// маршрут с new Date() в рендере — next-prerender-current-time-client; тот же
// приём, что в PaymentsWorkspace).
import { useMemo, useState, useSyncExternalStore } from "react";
import Icon from "../icons/Icon";
import { Button, FilterChip } from "../ui";
import { TASKS, TASK_STATUS, type TaskItem } from "../../app/(app)/tasks/mocks";
import "./tasks.css";

const WEEKDAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const VIEWS = [
  { id: "day", label: "День" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
];

const MONTHS_NOM = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

// В прототипе вид «День/Неделя» переключает только активную кнопку —
// сетка всегда месячная. TODO: другие представления — вне фазы D5.
const subscribeNever = () => () => {};

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function TasksWorkspace() {
  const [view, setView] = useState("month");
  // Сдвиг от текущего месяца (навигация ◀ ▶), считаем после гидрации.
  const [monthOffset, setMonthOffset] = useState(0);
  const todayKey = useSyncExternalStore(
    subscribeNever,
    () => dateKey(new Date()),
    () => "",
  );

  const tasksByKey = useMemo(() => {
    const map: Record<string, TaskItem[]> = {};
    for (const t of TASKS) {
      const k = dateKey(t.date);
      (map[k] = map[k] || []).push(t);
    }
    return map;
  }, []);

  const stats = useMemo(
    () => ({
      total: TASKS.length,
      active: TASKS.filter((t) => t.status === "active").length,
      done: TASKS.filter((t) => t.status === "done").length,
      overdue: TASKS.filter((t) => t.status === "overdue").length,
    }),
    [],
  );

  // Сегодня и «курсор» месяца — только после гидрации (серверный снимок пуст).
  const [today, cursor] = useMemo(() => {
    if (!todayKey) return [null, null];
    const [y, m, d] = todayKey.split("-").map(Number) as [number, number, number];
    const now = new Date(y, m, d);
    return [now, new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)];
  }, [todayKey, monthOffset]);

  /* Сетка месяца: 6 недель, неделя начинается с воскресенья */
  const cells = useMemo(() => {
    if (!cursor) return [];
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const inMonth = (d: Date) => cursor && d.getMonth() === cursor.getMonth();

  return (
    <div className="cal">
      <div className="cal__toolbar">
        <button className="cal__funnel" title="Фильтры" type="button">
          <Icon name="filter" size={16} />
        </button>
        <div className="cal__chips">
          {["Ответственный", "Автор", "Источники", "Тип задачи"].map((f) => (
            <FilterChip key={f} label={f} />
          ))}
        </div>
        <div className="cal__views">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`cal__view ${view === v.id ? "is-active" : ""}`}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="cal__month">
          <span className="cal__month-name">
            {cursor ? `${MONTHS_NOM[cursor.getMonth()]} ${cursor.getFullYear()}` : "…"}
          </span>
          <button className="cal__nav" onClick={() => setMonthOffset((prev) => prev - 1)} title="Предыдущий месяц" type="button">
            <Icon name="chevronLeft" size={15} />
          </button>
          <button className="cal__nav" onClick={() => setMonthOffset((prev) => prev + 1)} title="Следующий месяц" type="button">
            <Icon name="chevronRight" size={15} />
          </button>
          <Button variant="outline" size="sm" onClick={() => setMonthOffset(0)}>
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
          const dayTasks = tasksByKey[dateKey(d)] || [];
          const isToday = today && dateKey(d) === todayKey;
          return (
            <div
              key={i}
              className={`cal-cell ${inMonth(d) ? "" : "is-out"} ${isToday ? "is-today" : ""} ${
                d.getDay() === 0 || d.getDay() === 6 ? "is-weekend" : ""
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
          );
        })}
      </div>
    </div>
  );
}
