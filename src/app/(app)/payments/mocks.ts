// Мок-данные экрана «Оплаты» (план D4) — перенос из прототипа
// design/prototype/src/data/mock.js (раздел CATALOG). В реальном проекте
// заменяются данными API.
// TODO: прейскурант не утверждён (PRD §10).

/* Каталог каналов для тарифной сетки (цена — ₽/мес; icon — бренд для ChannelIcon) */
export type CatalogItem = {
  id: string;
  name: string;
  price: number;
  icon: string;
  badge?: string;
};

export const CATALOG: CatalogItem[] = [
  { id: "site", name: "Чат на сайт", price: 0, icon: "chatsite" },
  { id: "email", name: "Email", price: 0, icon: "email" },
  { id: "operator", name: "Оператор", price: 325, icon: "operator" },
  { id: "vk", name: "ВКонтакте", price: 975, icon: "vk" },
  { id: "tgprivate", name: "Telegram Личный", price: 2275, icon: "telegram" },
  { id: "instagram", name: "Instagram", price: 1950, icon: "instagram" },
  { id: "whatsapp", name: "WhatsApp", price: 2275, icon: "whatsapp" },
  { id: "waapi", name: "WhatsApp Business API", price: 2275, icon: "waapi" },
  { id: "avito", name: "Avito", price: 1300, icon: "avito" },
  { id: "max", name: "Max", price: 2275, icon: "max" },
  { id: "viberbot", name: "Viber Bot", price: 650, icon: "viber" },
  { id: "fbmessenger", name: "Facebook Messenger", price: 0, icon: "fbmessenger" },
  { id: "fbleads", name: "Facebook Leads", price: 0, icon: "fbleads" },
  { id: "fbcomments", name: "Facebook Комментарии", price: 0, icon: "fbcomments" },
  { id: "ok", name: "Одноклассники", price: 975, icon: "ok" },
  { id: "discord", name: "Discord", price: 650, icon: "discord" },
  { id: "autoru", name: "Auto.ru", price: 1950, icon: "autoru" },
  { id: "logo", name: "Отключение логотипа", price: 325, icon: "logo" },
  { id: "telephony", name: "Телефония", price: 1300, icon: "phone", badge: "Beta" },
  { id: "tgbot", name: "Telegram Bot", price: 975, icon: "tgbot" },
  { id: "maxbot", name: "Max Bot", price: 975, icon: "maxbot", badge: "Beta" },
  { id: "bitrix", name: "Битрикс24", price: 0, icon: "bitrix" },
  { id: "amo", name: "amoCRM", price: 0, icon: "amo" },
  { id: "ytiger", name: "yTiger", price: 0, icon: "ytiger" },
  { id: "moysklad", name: "Мой Склад", price: 0, icon: "moysklad" },
  { id: "met", name: "МЭТ", price: 0, icon: "met" },
];

export const catalogById = (id: string) => CATALOG.find((c) => c.id === id);

/* Периоды тарифа и скидки за длительность (моки прототипа) */
export type Period = { id: string; label: string; months: number; discount: number };

export const PERIODS: Period[] = [
  { id: "m1", label: "Месяц", months: 1, discount: 0 },
  { id: "m6", label: "Полгода", months: 6, discount: 10 },
  { id: "m12", label: "Год", months: 12, discount: 35 },
  { id: "m24", label: "2 года", months: 24, discount: 50 },
];

export const PERIOD_LABEL: Record<string, string> = Object.fromEntries(
  PERIODS.map((p) => [p.id, p.label]),
);

/* Стартовый состав тарифа из прототипа */
export type TariffLine = { id: string; qty: number };

export const DEFAULT_TARIFF_LINES: TariffLine[] = [
  { id: "site", qty: 1 },
  { id: "logo", qty: 1 },
  { id: "vk", qty: 1 },
];

/*
 * Red alert «не оплачен тариф» (план D4). Мок: состояние оплаты появится
 * вместе с платёжным провайдером — вне плана (PRD, открытый вопрос №6).
 */
export const TARIFF_UNPAID = true;
