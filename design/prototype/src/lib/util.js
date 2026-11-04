export function money(n) {
  return Math.round(n).toLocaleString('ru-RU')
}

export function dateKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

const MONTHS_NOM = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

export function monthNameGen(m) {
  return MONTHS[m]
}

export function monthNameNom(m) {
  return MONTHS_NOM[m]
}

export function formatDate(d) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function addMonths(d, n) {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}
