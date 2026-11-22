// Человекочитаемые названия каналов, статусы и расшифровки ошибок API
// (экран «Каналы связи», план D3).
import type { BadgeTone } from "../ui/Badge";

export const CHANNEL_NAMES: Record<string, string> = {
  VK: "ВКонтакте",
  TELEGRAM_BOT: "Telegram-бот",
  TELEGRAM_PERSONAL: "Telegram (личный)",
  WHATSAPP: "WhatsApp",
  MAX: "MAX",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  TESTING: "Тестовый канал",
};

export function channelName(type: string): string {
  return CHANNEL_NAMES[type] ?? type;
}

/** Имя подключения в списке: у testing displayName нет — показываем название канала. */
export function connectionDisplayName(connection: { type: string; externalName: string }): string {
  if (connection.type === "TESTING") return CHANNEL_NAMES.TESTING;
  return connection.externalName || channelName(connection.type);
}

export type StatusView = { label: string; tone: BadgeTone; hint: string };

export const STATUS_VIEWS: Record<string, StatusView> = {
  ACTIVE: { label: "Активен", tone: "green", hint: "Канал подключён и принимает сообщения" },
  PENDING: { label: "Ожидает", tone: "yellow", hint: "Подключение не завершено" },
  ERROR: { label: "Ошибка", tone: "red", hint: "Канал отключился или настроен неверно" },
  DISCONNECTED: { label: "Отключён", tone: "gray", hint: "Канал отключён оператором" },
};

export function statusView(status: string): StatusView {
  return STATUS_VIEWS[status] ?? { label: status, tone: "gray", hint: "" };
}

// Коды ошибок API подключений (B1–B5, C1–C3) → понятные сообщения
const ERROR_TEXTS: Record<string, string> = {
  // VK (B1)
  VK_INVALID_STATE: "Сессия авторизации VK истекла. Начните подключение заново.",
  VK_CANCELLED: "Вход через VK отменён.",
  VK_AUTH_FAILED: "VK не выдал доступ. Проверьте, что приложение Messengo имеет доступ к сообществам.",
  VK_INVALID_REQUEST: "Некорректный запрос к VK.",
  VK_NOT_ADMIN: "Нужны права администратора сообщества.",
  VK_OPERATION_FAILED: "Не удалось завершить настройку сообщества VK.",
  VK_NOT_CONFIGURED: "OAuth VK не настроен на сервере (VK_CLIENT_SECRET).",
  // Telegram (B2/B3)
  TELEGRAM_INVALID_TOKEN: "Неверный токен бота. Проверьте его в @BotFather.",
  TELEGRAM_INVALID_CREDENTIALS: "Неверный токен бота. Проверьте его в @BotFather.",
  TELEGRAM_INVALID_CHANNEL: "Канал не найден. Укажите публичный @username канала.",
  TELEGRAM_NOT_CHANNEL: "Это не канал. Укажите @username канала.",
  TELEGRAM_ACCESS_DENIED: "Нужно добавить бота администратором канала.",
  TELEGRAM_DISCUSSION_REQUIRED: "Для комментариев нужно включить обсуждения в канале.",
  TELEGRAM_DISCUSSION_MISMATCH: "Группа обсуждений не связана с указанным каналом.",
  TELEGRAM_RATE_LIMIT: "Telegram просит не отправлять запросы так часто. Попробуйте через минуту.",
  TELEGRAM_TRANSPORT: "Telegram недоступен. Проверьте сеть и попробуйте ещё раз.",
  TELEGRAM_CONNECT_FAILED: "Не удалось подключить бота. Попробуйте ещё раз.",
  TELEGRAM_PERSONAL_NOT_CONFIGURED: "Служебный бот для личного Telegram не настроен на сервере.",
  TELEGRAM_PERSONAL_SETUP_FAILED: "Не удалось начать привязку личного Telegram.",
  // Meta (B4)
  META_INVALID_STATE: "Сессия авторизации Facebook истекла. Начните подключение заново.",
  META_CANCELLED: "Вход через Facebook отменён.",
  META_AUTH_FAILED: "Facebook не выдал доступ. Проверьте настройки приложения Messengo.",
  META_PAGE_NOT_FOUND: "Страница Facebook не найдена среди доступных.",
  META_IG_ACCOUNT_REQUIRED: "У выбранной страницы нет подключённого аккаунта Instagram.",
  META_NOT_CONFIGURED: "OAuth Meta не настроен на сервере (META_APP_SECRET).",
  META_OAUTH_REQUIRED: "Требуется повторная авторизация через Facebook.",
  META_INVALID_CREDENTIALS: "Ключи доступа Meta недействительны.",
  META_API_ERROR: "Ошибка API Meta. Попробуйте ещё раз позже.",
  META_OPERATION_FAILED: "Не удалось завершить подключение Meta.",
  // Green API (C1–C3)
  GREENAPI_NOT_CONFIGURED: "Green API не настроен на сервере (GREEN_API_PARTNER_TOKEN).",
  GREENAPI_INVALID_CREDENTIALS: "Некорректные данные инстанса: idInstance — число, apiTokenInstance — не короче 8 символов.",
  GREENAPI_SETUP_FAILED: "Не удалось создать инстанс Green API.",
  GREENAPI_TRANSPORT: "Green API недоступен. Проверьте сеть и попробуйте ещё раз.",
  GREENAPI_INVALID_2FA: "Введите пароль 2FA.",
};

export function apiErrorText(code: string): string {
  return ERROR_TEXTS[code] ?? code;
}
