// Telegram личный, Secretary Mode (план B3; механика V1 channels/telegram/personal,
// упрощена до базового флоу): владелец привязывает личный аккаунт к СЛУЖЕБНОМУ
// боту приложения через deeplink /start=<nonce> (owner-proof) и Telegram Business
// (business_connection). Входящие личные сообщения приходят апдейтом
// business_message на вебхук служебного бота и маршрутизируются в подключение
// владельца (связка telegram-user-id → подключение — в config подключения).
// sendMessage — sendMessage с business_connection_id (от имени владельца).
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getDb } from "../db/client";
import { openConfig, sealConfig } from "../secrets/store";
import { ChannelError, type ChannelAdapter, type InboundNormalized, type ResolveConnectionInput } from "./adapter";
import { handleInboundEvents } from "./pipeline";
import { telegramCall } from "./telegram-bot";
import type { ChannelConnection } from "../../generated/prisma/client";

export type TelegramPersonalConfig = {
  serviceBotId: string;
  serviceBotUsername?: string;
  webhookSecret: string; // секрет ВЕБХУКА служебного бота (уровень приложения)
  proofNonce?: string; // /start-nonce owner-proof (TTL 15 мин, по V1)
  ownerUserId?: string; // telegram-user-id владельца (связка из плана B3)
  ownerName?: string;
  businessConnectionId?: string; // привязка Telegram Business
};

const PROOF_TTL_MS = 15 * 60_000;

export function personalEnv(): { token: string } {
  const token = process.env.TELEGRAM_PERSONAL_BOT_TOKEN ?? "";
  if (!token || !/^\d{1,16}:[A-Za-z0-9_-]{8,256}$/.test(token)) {
    throw new ChannelError("TELEGRAM_PERSONAL_NOT_CONFIGURED", 503);
  }
  return { token };
}

/** Секрет вебхука служебного бота — производный, один на приложение. */
export function personalWebhookSecret(): string {
  const { token } = personalEnv();
  return createHash("sha256")
    .update(`${token}:${process.env.AUTH_SECRET ?? ""}`)
    .digest("base64url")
    .slice(0, 64);
}

export function personalWebhookUrl(): string {
  return (
    process.env.TELEGRAM_PERSONAL_WEBHOOK_URL ??
    `${process.env.AUTH_BASE_URL ?? "http://localhost:3000"}/api/webhooks/telegram`
  );
}

function personalConfig(connection: ChannelConnection): TelegramPersonalConfig {
  const config = openConfig(connection);
  if (
    typeof config.serviceBotId !== "string" ||
    typeof config.webhookSecret !== "string"
  ) {
    throw new ChannelError("TELEGRAM_INVALID_CREDENTIALS", 500);
  }
  return config as unknown as TelegramPersonalConfig;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ChannelError("TELEGRAM_INVALID_EVENT");
  return value as Record<string, unknown>;
}

/** Все ACTIVE/PENDING личные подключения (для маршрутизации по владельцу). */
async function personalConnections(): Promise<ChannelConnection[]> {
  return getDb().channelConnection.findMany({
    where: { type: "TELEGRAM_PERSONAL", status: { in: ["PENDING", "ACTIVE"] } },
  });
}

async function findOwnedByOwner(ownerUserId: string): Promise<ChannelConnection | null> {
  for (const connection of await personalConnections()) {
    const config = safeOpen(connection);
    if (config?.ownerUserId === ownerUserId) return connection;
  }
  return null;
}

async function findOwnedByBusiness(businessConnectionId: string): Promise<ChannelConnection | null> {
  for (const connection of await personalConnections()) {
    const config = safeOpen(connection);
    if (config?.businessConnectionId === businessConnectionId) return connection;
  }
  return null;
}

function safeOpen(connection: ChannelConnection): TelegramPersonalConfig | null {
  try {
    return personalConfig(connection);
  } catch {
    return null;
  }
}

export const telegramPersonalAdapter: ChannelAdapter = {
  type: "TELEGRAM_PERSONAL",

  async initiateConnect(organizationId) {
    const { token } = personalEnv();
    const me = await telegramCall<Record<string, unknown>>(token, "getMe");
    if (me.is_bot !== true || !Number.isSafeInteger(me.id)) throw new ChannelError("TELEGRAM_PERSONAL_NOT_CONFIGURED", 503);
    const username = typeof me.username === "string" ? me.username : "";

    const connection = await getDb().channelConnection.create({
      data: {
        organizationId,
        type: "TELEGRAM_PERSONAL",
        externalId: "pending",
        displayName: username ? `Личный Telegram (@${username})` : "Личный Telegram",
        status: "PENDING",
      },
    });
    const proofNonce = `${connection.id}.${randomBytes(12).toString("base64url")}`;
    const config: TelegramPersonalConfig = {
      serviceBotId: String(me.id),
      serviceBotUsername: username || undefined,
      webhookSecret: personalWebhookSecret(),
      proofNonce,
    };
    await getDb().channelConnection.update({
      where: { id: connection.id },
      data: { config: sealConfig(config as unknown as Record<string, unknown>, connection.id) as unknown as object },
    });
    // вебхук служебного бота один на приложение — обновляем идемпотентно
    await telegramCall(token, "setWebhook", {
      url: personalWebhookUrl(),
      secret_token: config.webhookSecret,
      allowed_updates: ["message", "business_connection", "business_message"],
      drop_pending_updates: false,
    });
    return {
      status: "PENDING",
      connectionId: connection.id,
      deeplink: `https://t.me/${username}?start=${proofNonce}`,
      expiresAt: new Date(Date.now() + PROOF_TTL_MS).toISOString(),
    };
  },

  async completeConnect() {
    throw new ChannelError("TELEGRAM_PERSONAL_WEBHOOK_FLOW", 400);
  },

  /** Маршрутизация апдейтов служебного бота к подключению владельца. */
  async resolveConnection({ body }: ResolveConnectionInput): Promise<ChannelConnection | null> {
    const update = object(body);
    // owner-proof: /start <nonce> из лички служебного бота
    const message = update.message as Record<string, unknown> | undefined;
    if (message && typeof message.text === "string" && message.text.startsWith("/start ")) {
      const nonce = message.text.slice("/start ".length).trim();
      const connectionId = nonce.split(".")[0];
      if (/^[0-9a-f-]{36}$/.test(connectionId)) {
        const connection = await getDb().channelConnection.findUnique({ where: { id: connectionId } });
        if (connection && connection.type === "TELEGRAM_PERSONAL") {
          const config = safeOpen(connection);
          if (config?.proofNonce === nonce) return connection;
        }
      }
      return null;
    }
    // business_connection: привязка по владельцу
    const business = update.business_connection as Record<string, unknown> | undefined;
    if (business) {
      const user = object(business.user);
      if (Number.isSafeInteger(user.id)) {
        const owned = await findOwnedByOwner(String(user.id));
        if (owned) return owned;
      }
      return null;
    }
    // business_message: личное сообщение — по business_connection_id
    const personalMessage = update.business_message as Record<string, unknown> | undefined;
    if (personalMessage && typeof personalMessage.business_connection_id === "string") {
      return findOwnedByBusiness(personalMessage.business_connection_id);
    }
    return null;
  },

  async parseWebhook(connection, headers, body) {
    const config = personalConfig(connection);
    const supplied = Buffer.from(headers.get("x-telegram-bot-api-secret-token") ?? "");
    const expected = Buffer.from(config.webhookSecret);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new ChannelError("INVALID_SOURCE", 403);
    }
    const update = object(body);
    if (!Number.isSafeInteger(update.update_id) || Number(update.update_id) < 0) {
      throw new ChannelError("TELEGRAM_INVALID_EVENT");
    }
    const message = update.business_message as Record<string, unknown> | undefined;
    if (!message) return [];
    const from = object(message.from);
    const chat = object(message.chat);
    if (!Number.isSafeInteger(from.id) || !Number.isSafeInteger(chat.id) || Number(chat.id) <= 0) {
      throw new ChannelError("TELEGRAM_INVALID_EVENT");
    }
    const date = message.date;
    if (!Number.isSafeInteger(date) || Number(date) < 1) throw new ChannelError("TELEGRAM_INVALID_EVENT");
    if (typeof message.text !== "string" || !message.text) return [];
    const name = [from.first_name, from.last_name].filter((v): v is string => typeof v === "string").join(" ").trim();
    const event: InboundNormalized = {
      externalEventId: `telegram-personal:${update.update_id}`,
      contact: { externalId: String(from.id), name: name || (typeof from.username === "string" ? `@${from.username}` : null) },
      conversationKey: `peer:${from.id}`,
      threadTitle: null,
      text: message.text.slice(0, 16384),
      occurredAt: new Date(Number(date) * 1000),
    };
    return [event];
  },

  /** Полный цикл вебхука служебного бота: owner-proof, привязка business, сообщения. */
  async handleWebhook(connection, request, body, _rawBody) {
    if (request.method !== "POST") return Response.json({ ok: false }, { status: 405 });
    try {
      const config = personalConfig(connection);
      const supplied = Buffer.from(request.headers.get("x-telegram-bot-api-secret-token") ?? "");
      const expected = Buffer.from(config.webhookSecret);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        throw new ChannelError("INVALID_SOURCE", 403);
      }
      const update = object(body);
      const db = getDb();

      // owner-proof: /start <nonce> (по V1 — nonce связан с подключением, TTL)
      const message = update.message as Record<string, unknown> | undefined;
      if (message && typeof message.text === "string" && message.text.startsWith("/start ")) {
        if (connection.status !== "PENDING" || config.proofNonce !== message.text.slice("/start ".length).trim()) {
          throw new ChannelError("INVALID_SOURCE", 403);
        }
        const from = object(message.from);
        if (!Number.isSafeInteger(from.id) || Number(from.id) < 1) throw new ChannelError("TELEGRAM_INVALID_EVENT");
        const name = [from.first_name, from.last_name].filter((v): v is string => typeof v === "string").join(" ").trim();
        const updated: TelegramPersonalConfig = { ...config, ownerUserId: String(from.id), ownerName: name || undefined, proofNonce: undefined };
        await db.channelConnection.update({
          where: { id: connection.id },
          data: { config: sealConfig(updated as unknown as Record<string, unknown>, connection.id) as unknown as object },
        });
        return Response.json({ ok: true, stage: "owner_linked" });
      }

      // привязка Telegram Business
      const business = update.business_connection as Record<string, unknown> | undefined;
      if (business) {
        const user = object(business.user);
        if (String(user.id) !== config.ownerUserId || business.user_is_bot === true) {
          throw new ChannelError("INVALID_SOURCE", 403);
        }
        if (business.enabled !== true || typeof business.id !== "string" || !business.id) {
          return Response.json({ ok: true, stage: "ignored" });
        }
        const updated: TelegramPersonalConfig = { ...config, businessConnectionId: business.id };
        await db.channelConnection.update({
          where: { id: connection.id },
          data: {
            status: "ACTIVE",
            externalId: config.ownerUserId!,
            config: sealConfig(updated as unknown as Record<string, unknown>, connection.id) as unknown as object,
          },
        });
        return Response.json({ ok: true, stage: "business_linked" });
      }

      // личное сообщение собеседника — только активное подключение
      if (connection.status !== "ACTIVE" || !config.businessConnectionId) {
        return Response.json({ ok: true, stage: "ignored" });
      }
      const events = await telegramPersonalAdapter.parseWebhook(connection, request.headers, body);
      if (events.length > 0) await handleInboundEvents(connection, events);
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (error instanceof ChannelError) {
        return Response.json({ ok: false, code: error.code }, { status: error.status });
      }
      throw error;
    }
  },

  async sendMessage(connection, text, context) {
    const config = personalConfig(connection);
    if (!config.businessConnectionId) return { status: "FAILED", error: "TELEGRAM_NOT_BOUND" };
    if (!text.trim() || text.length > 4096) return { status: "FAILED", error: "TELEGRAM_INVALID_REQUEST" };
    const chatId = Number(context.conversationKey.slice("peer:".length));
    if (!Number.isSafeInteger(chatId) || chatId <= 0) return { status: "FAILED", error: "TELEGRAM_INVALID_REQUEST" };
    try {
      const { token } = personalEnv();
      const result = await telegramCall<Record<string, unknown>>(token, "sendMessage", {
        business_connection_id: config.businessConnectionId,
        chat_id: chatId,
        text,
      });
      const id = result.message_id;
      if (!Number.isSafeInteger(id) || Number(id) < 1) return { status: "UNKNOWN" };
      return { status: "SENT", externalId: `tgp:${id}` };
    } catch (error) {
      if (error instanceof ChannelError && (error.code === "TELEGRAM_TRANSPORT" || error.code === "TELEGRAM_INVALID_EVENT")) {
        return { status: "UNKNOWN" };
      }
      return { status: "FAILED", error: error instanceof ChannelError ? error.code : "TELEGRAM_SEND_FAILED" };
    }
  },
};

/** Статус подключения для UI (B3). */
export async function personalConnectStatus(connection: ChannelConnection) {
  const config = safeOpen(connection);
  return {
    id: connection.id,
    status: connection.status,
    ownerLinked: Boolean(config?.ownerUserId),
    businessLinked: Boolean(config?.businessConnectionId),
  };
}
