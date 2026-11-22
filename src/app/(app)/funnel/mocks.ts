// Мок-данные экрана «Воронка» (план D5 п.1 + дополнение владельца 2026-11-22).
// Этапы (колонки) больше не мок: их настраивает пользователь, конфигурация
// хранится в БД (FunnelStage, API /api/funnel/stages). FUNNEL — дефолтные
// этапы прототипа (SSR-первый кадр и seeding при первом GET), BOARD —
// демо-сделки: раскладываются по позициям этапов на клиенте.
// TODO: бэкенд сделок (реальные сделки, связи с диалогами) — отдельная работа.

/* Этапы воронки (цвет — полоска под заголовком колонки) */
export type FunnelStage = {
  id: string;
  label: string;
  color: string;
};

export const FUNNEL: FunnelStage[] = [
  { id: "unaccepted", label: "Непринятые диалоги", color: "#eb5757" },
  { id: "first", label: "Первичный контакт", color: "#27ae60" },
  { id: "second", label: "Вторичный контакт", color: "#f2994a" },
  { id: "decision", label: "Принимает решение", color: "#bb6bd9" },
  { id: "won", label: "Успешно завершено", color: "#2f80ed" },
  { id: "lost", label: "Не успешно завершено", color: "#eb5757" },
  { id: "spam", label: "Спам", color: "#eb5757" },
];

/* Карточка сделки */
export type DealCard = {
  id: string;
  client: string;
  channel: string;
  price: number;
  assignee: string;
  tag: string;
  date: string;
};

/* Раскладка сделок по этапам (id этапа → карточки) */
export const BOARD: Record<string, DealCard[]> = {
  unaccepted: [
    { id: "c3", client: "Максим Орлов", channel: "telegram", price: 12000, assignee: "Никита", tag: "Редизайн", date: "25 окт." },
    { id: "c4", client: "Елена Ким", channel: "instagram", price: 8000, assignee: "Никита", tag: "Баннеры", date: "24 окт." },
  ],
  first: [
    { id: "c2", client: "Анна Смирнова", channel: "whatsapp", price: 45000, assignee: "Никита", tag: "Разработка сайта", date: "25 окт." },
  ],
  second: [],
  decision: [
    { id: "c1", client: "Никита Вамилов", channel: "vk", price: 100000, assignee: "Никита", tag: "Разработка сайта", date: "04 сент." },
  ],
  won: [
    { id: "c5", client: "Олег Петров", channel: "telegram", price: 60000, assignee: "Никита", tag: "Лендинг", date: "18 сент." },
  ],
  lost: [],
  spam: [],
};
