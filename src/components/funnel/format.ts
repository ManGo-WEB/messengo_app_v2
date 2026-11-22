// Форматирование для «Воронки» — перенос lib/util.js прототипа (только
// используемые на этом экране функции; остальное — на своих экранах).
export function money(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}
