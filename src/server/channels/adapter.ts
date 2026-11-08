// Контракт адаптера канала (план B0). Каждый канал (B1–B4, C1–C2) реализует
// этот интерфейс; worker и вебхуки получают адаптер только через registry.ts.
import type { ChannelConnection, ChannelType } from "../../generated/prisma/client";

export class ChannelError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(code);
  }
}

export type ConnectResult =
  | { status: "PENDING"; connectionId: string; redirectUrl?: string; deeplink?: string; expiresAt?: string }
  | { status: "ACTIVE"; connection: ChannelConnection };

// Нормализованное входящее событие: единый вид для любого канала.
export type InboundNormalized = {
  externalEventId: string;
  contact: { externalId: string; name: string | null };
  conversationKey: string;
  threadTitle: string | null;
  text: string;
  occurredAt: Date;
};

export type SendResult =
  | { status: "SENT"; externalId: string }
  | { status: "FAILED"; error: string }
  | { status: "UNKNOWN"; externalId?: string };

export type ResolveConnectionInput = {
  query: URLSearchParams;
  headers: Headers;
  body: unknown;
};

export interface ChannelAdapter {
  type: ChannelType;
  /** Старт флоу подключения: OAuth-ссылка / создание инстанса (QR и т.п.). */
  initiateConnect(organizationId: string, params: Record<string, unknown>): Promise<ConnectResult>;
  /** Завершение подключения: OAuth-код, QR-скан и т.п. */
  completeConnect(organizationId: string, callbackParams: Record<string, unknown>): Promise<ChannelConnection>;
  /**
   * Привязка вебхука к конкретному подключению (дополнение к плану B0:
   * без этого не собрать ни проверку подписи, ни ключ идемпотентности).
   * VK — по group_id, Telegram — по пути/секрету, Meta — по page id.
   */
  resolveConnection(input: ResolveConnectionInput): Promise<ChannelConnection | null>;
  /** Валидация подписи + разбор события канала в нормализованный вид. */
  parseWebhook(connection: ChannelConnection, headers: Headers, body: unknown): Promise<InboundNormalized[]>;
  /** GET-запрос вебхука (верификация Meta hub.challenge); 405 если каналу не нужен. */
  handleWebhookGet?(request: Request): Promise<Response>;
  /**
   * Полная обработка вебхука каналом (опционально) — для протоколов со special-
   * ответами (VK confirmation-строка, Telegram {ok}, Meta подпись по rawBody).
   * rawBody — сырое тело запроса для проверки HMAC-подписи.
   */
  handleWebhook?(
    connection: ChannelConnection,
    request: Request,
    body: unknown,
    rawBody: string,
  ): Promise<Response>;
  /**
   * Отправка сообщения в диалог канала (conversationKey — внешний ключ чата).
   * lastInboundAt — время последнего входящего (для 24-часового окна Meta).
   */
  sendMessage(
    connection: ChannelConnection,
    text: string,
    context: { conversationKey: string; lastInboundAt?: Date | null },
  ): Promise<SendResult>;
}
