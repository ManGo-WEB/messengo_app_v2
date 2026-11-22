// Мок-данные экрана «Задачи» (план D5 п.1) — перенос из прототипа
// design/prototype/src/data/mock.js (разделы TASKS, TASK_STATUS). Задачи
// генерируются относительно «сегодня», чтобы экран всегда был живой.
// TODO: бэкенд задач (создание, связи с диалогами) — вне фазы D5.

export type TaskStatus = "active" | "done" | "overdue";

export type TaskItem = {
  id: string;
  date: Date;
  time: string;
  title: string;
  status: TaskStatus;
  assignee: string;
};

function mkTask(offsetDays: number, time: string, title: string, status: TaskStatus, assignee: string): TaskItem {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return { id: `t${offsetDays}-${title}`, date: d, time, title, status, assignee };
}

export const TASKS: TaskItem[] = [
  mkTask(-12, "11:00", "Отправить счёт Олегу", "done", "Никита"),
  mkTask(-3, "15:00", "Позвонить в поддержку Avito", "overdue", "Никита"),
  mkTask(-1, "13:30", "Уточнить ТЗ у Анны", "done", "Никита"),
  mkTask(0, "12:00", "Созвон с Никитой Вамиловым", "active", "Никита"),
  mkTask(2, "10:00", "Подготовить КП по лендингу", "active", "Никита"),
  mkTask(5, "17:00", "Согласовать дизайн баннеров", "active", "Никита"),
  mkTask(9, "14:00", "Демо для Максима Орлова", "active", "Никита"),
];

export const TASK_STATUS: Record<TaskStatus, { label: string; color: string }> = {
  active: { label: "В работе", color: "#f2c94c" },
  done: { label: "Выполненные", color: "#27ae60" },
  overdue: { label: "Просроченные", color: "#eb5757" },
};
