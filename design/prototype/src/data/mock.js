/* Мок-данные прототипа. В реальном проекте заменяются данными API. */

/* Этапы воронки */
export const FUNNEL = [
  { id: 'unaccepted', label: 'Непринятые диалоги', color: '#eb5757' },
  { id: 'first', label: 'Первичный контакт', color: '#27ae60' },
  { id: 'second', label: 'Вторичный контакт', color: '#f2994a' },
  { id: 'decision', label: 'Принимает решение', color: '#bb6bd9' },
  { id: 'won', label: 'Успешно завершено', color: '#2f80ed' },
  { id: 'lost', label: 'Не успешно завершено', color: '#eb5757' },
  { id: 'spam', label: 'Спам', color: '#eb5757' },
]

export const funnelById = (id) => FUNNEL.find((f) => f.id === id)

/* Диалоги (Inbox) */
export const DIALOGS = [
  {
    id: 1,
    tab: 'accepted',
    client: 'Никита Вамилов',
    channel: 'vk',
    price: 100000,
    status: 'decision',
    answer: '1 минута',
    tasks: true,
    tags: [],
    source: 'Студия дизайна "ManGO-WEB"',
    date: '04 сент.',
    messages: [
      { from: 'them', text: 'Здравствуйте! Хочу обсудить разработку сайта для дизайн-студии.', time: '12:02' },
      { from: 'me', text: 'Добрый день, Никита! Расскажите подробнее о проекте.', time: '12:05' },
      { from: 'them', text: 'Нужен лендинг + каталог работ. Бюджет 100 000 ₽, срок — месяц.', time: '12:07' },
      { from: 'me', text: 'Отлично, подготовлю коммерческое предложение до конца дня.', time: '12:09' },
    ],
  },
  {
    id: 2,
    tab: 'accepted',
    client: 'Анна Смирнова',
    channel: 'whatsapp',
    price: 45000,
    status: 'first',
    answer: '2 минуты',
    tasks: false,
    tags: ['Разработка сайта'],
    source: 'WhatsApp Бизнес',
    date: '25 окт.',
    messages: [
      { from: 'them', text: 'Добрый день! Подскажите, сколько стоит сайт-визитка?', time: '10:15' },
      { from: 'me', text: 'Здравствуйте, Анна! Сайт-визитка — от 35 000 ₽, зависит от наполнения.', time: '10:17' },
      { from: 'them', text: 'А сроки? Нужно к концу ноября.', time: '10:20' },
    ],
  },
  {
    id: 3,
    tab: 'new',
    client: 'Максим Орлов',
    channel: 'telegram',
    price: 12000,
    status: 'unaccepted',
    answer: '—',
    tasks: false,
    tags: [],
    source: 'Telegram Bot',
    date: '25 окт.',
    messages: [
      { from: 'them', text: 'Привет! Видел ваше портфолио, есть задача по редизайну лендинга.', time: '09:40' },
    ],
  },
  {
    id: 4,
    tab: 'new',
    client: 'Елена Ким',
    channel: 'instagram',
    price: 8000,
    status: 'unaccepted',
    answer: '—',
    tasks: true,
    tags: [],
    source: 'Instagram Директ',
    date: '24 окт.',
    messages: [
      { from: 'them', text: 'Здравствуйте! А баннеры для соцсетей делаете?', time: '18:22' },
      { from: 'them', text: 'Нужен комплект из 10 штук.', time: '18:23' },
    ],
  },
  {
    id: 5,
    tab: 'archive',
    client: 'Олег Петров',
    channel: 'telegram',
    price: 60000,
    status: 'won',
    answer: '40 секунд',
    tasks: false,
    tags: ['Лендинг'],
    source: 'Telegram Личный',
    date: '18 сент.',
    messages: [
      { from: 'me', text: 'Олег, проект сдан, финальный счёт отправил на почту.', time: '16:00' },
      { from: 'them', text: 'Спасибо, всё отлично! Оплачу сегодня.', time: '16:12' },
    ],
  },
]

/* Каталог каналов для страницы «Оплаты» (цена — ₽/мес) */
export const CATALOG = [
  { id: 'site', name: 'Чат на сайт', price: 0, icon: 'chatsite' },
  { id: 'email', name: 'Email', price: 0, icon: 'email' },
  { id: 'operator', name: 'Оператор', price: 325, icon: 'operator' },
  { id: 'vk', name: 'ВКонтакте', price: 975, icon: 'vk' },
  { id: 'tgprivate', name: 'Telegram Личный', price: 2275, icon: 'telegram' },
  { id: 'instagram', name: 'Instagram', price: 1950, icon: 'instagram' },
  { id: 'whatsapp', name: 'WhatsApp', price: 2275, icon: 'whatsapp' },
  { id: 'waapi', name: 'WhatsApp Business API', price: 2275, icon: 'whatsapp' },
  { id: 'avito', name: 'Avito', price: 1300, icon: 'avito' },
  { id: 'max', name: 'Max', price: 2275, icon: 'max' },
  { id: 'viberbot', name: 'Viber Bot', price: 650, icon: 'viber' },
  { id: 'fbmessenger', name: 'Facebook Messenger', price: 0, icon: 'messenger' },
  { id: 'fbleads', name: 'Facebook Leads', price: 0, icon: 'facebook' },
  { id: 'fbcomments', name: 'Facebook Комментарии', price: 0, icon: 'facebook' },
  { id: 'ok', name: 'Одноклассники', price: 975, icon: 'ok' },
  { id: 'discord', name: 'Discord', price: 650, icon: 'discord' },
  { id: 'autoru', name: 'Auto.ru', price: 1950, icon: 'autoru' },
  { id: 'logo', name: 'Отключение логотипа', price: 325, icon: 'logo' },
  { id: 'telephony', name: 'Телефония', price: 1300, icon: 'phone', badge: 'Beta' },
  { id: 'tgbot', name: 'Telegram Bot', price: 975, icon: 'telegram' },
  { id: 'maxbot', name: 'Max Bot', price: 975, icon: 'max', badge: 'Beta' },
  { id: 'bitrix', name: 'Битрикс24', price: 0, icon: 'bitrix' },
  { id: 'amo', name: 'amoCRM', price: 0, icon: 'amo' },
  { id: 'ytiger', name: 'yTiger', price: 0, icon: 'ytiger' },
  { id: 'moysklad', name: 'Мой Склад', price: 0, icon: 'moysklad' },
  { id: 'met', name: 'МЭТ', price: 0, icon: 'met' },
]

export const catalogById = (id) => CATALOG.find((c) => c.id === id)

/* Каналы, доступные к подключению (страница «Каналы связи») */
export const CONNECTABLE = [
  { id: 'whatsapp', name: 'WhatsApp' },
  { id: 'waapi', name: 'WhatsApp Business API', plus: true },
  { id: 'telegram', name: 'Telegram' },
  { id: 'tgbot', name: 'Telegram Bot' },
  { id: 'instagram', name: 'Instagram' },
  { id: 'vk', name: 'ВКонтакте' },
  { id: 'avito', name: 'Avito' },
  { id: 'messenger', name: 'Facebook', badge: 'Бесплатно' },
  { id: 'max', name: 'MAX' },
  { id: 'maxbot', name: 'MAX Бот', badge: 'Beta' },
  { id: 'email', name: 'E-mail', badge: 'Бесплатно' },
  { id: 'chatsite', name: 'Чат на сайт', badge: 'Бесплатно' },
]

/* Подключённые каналы */
export const CONNECTED = [
  {
    id: 1,
    channel: 'vk',
    name: 'Студия дизайна "ManGO-WEB"',
    status: 'error',
    statusLabel: 'Не оплачен тариф',
    until: null,
  },
]

/* Воронка (kanban) */
export const BOARD = {
  unaccepted: [
    { id: 'c3', client: 'Максим Орлов', channel: 'telegram', price: 12000, assignee: 'Никита', tag: 'Редизайн', date: '25 окт.' },
    { id: 'c4', client: 'Елена Ким', channel: 'instagram', price: 8000, assignee: 'Никита', tag: 'Баннеры', date: '24 окт.' },
  ],
  first: [
    { id: 'c2', client: 'Анна Смирнова', channel: 'whatsapp', price: 45000, assignee: 'Никита', tag: 'Разработка сайта', date: '25 окт.' },
  ],
  second: [],
  decision: [
    { id: 'c1', client: 'Никита Вамилов', channel: 'vk', price: 100000, assignee: 'Никита', tag: 'Разработка сайта', date: '04 сент.' },
  ],
  won: [
    { id: 'c5', client: 'Олег Петров', channel: 'telegram', price: 60000, assignee: 'Никита', tag: 'Лендинг', date: '18 сент.' },
  ],
  lost: [],
  spam: [],
}

/* Задачи — генерируются относительно «сегодня», чтобы прототип всегда был живой */
function mkTask(offsetDays, time, title, status, assignee) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return { id: `t${offsetDays}-${title}`, date: d, time, title, status, assignee }
}

export const TASKS = [
  mkTask(-12, '11:00', 'Отправить счёт Олегу', 'done', 'Никита'),
  mkTask(-3, '15:00', 'Позвонить в поддержку Avito', 'overdue', 'Никита'),
  mkTask(-1, '13:30', 'Уточнить ТЗ у Анны', 'done', 'Никита'),
  mkTask(0, '12:00', 'Созвон с Никитой Вамиловым', 'active', 'Никита'),
  mkTask(2, '10:00', 'Подготовить КП по лендингу', 'active', 'Никита'),
  mkTask(5, '17:00', 'Согласовать дизайн баннеров', 'active', 'Никита'),
  mkTask(9, '14:00', 'Демо для Максима Орлова', 'active', 'Никита'),
]

export const TASK_STATUS = {
  active: { label: 'В работе', color: '#f2c94c' },
  done: { label: 'Выполненные', color: '#27ae60' },
  overdue: { label: 'Просроченные', color: '#eb5757' },
}
