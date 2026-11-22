// Форматирование сумм и дат — перенос из прототипа
// design/prototype/src/lib/util.js (используется экраном «Оплаты»).

export function money(n: number) {
  return Math.round(n).toLocaleString("ru-RU");
}

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

export function formatDate(d: Date) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function addMonths(d: Date, n: number) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}
