// Telegram-бот (план B2; механика из V1 src/server/channels/telegram/):
// личка бота + комментарии в связанной группе обсуждения канала.
// Тонкий клиент на fetch (без telegram-библиотек). Безопасность вебхука —
// X-Telegram-Bot-Api-Secret-Token (timing-safe, по V1); секрет вида
// "<connectionId>.<random>" — O(1)-резолв подключения без расшифровки всех.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { getDb } from "../db/client";
import { openConfig, sealConfig } from "../secrets/store";
import { ChannelError, type ChannelAdapter, type InboundNormalized } from "./adapter";
import { handleInboundEvents } from "./pipeline";
import type { ChannelConnection } from "../../generated/prisma/client";
import { Prisma } from "../../generated/prisma/client";

export type TelegramBotConfig = {
  mode: "bot" | "channel";
  token: string;
  botId: string;
  botUsername?: string;
  webhookSecret: string;
  channelId?: string; // режим channel: канал с комментариями
  discussionId?: string;
};

export function telegramWebhookUrl(): string {
  return `${process.env.TELEGRAM_WEBHOOK_URL ?? process.env.AUTH_BASE_URL ?? "http://localhost:3000"}/api/webhooks/telegram`;
}

export function telegramToken(value: unknown): string {
  if (typeof value !== "string" || !/^\d{1,16}:[A-Za-z0-9_-]{8,256}$/.test(value)) {
    throw new ChannelError("TELEGRAM_INVALID_TOKEN", 400);
  }
  return value;
}

/** Тонкий клиент Bot API (по V1 — только fetch). */
export async function telegramCall<T = Record<string, unknown>>(
  token: string,
  method: string,
  params: Record<string, unknown> = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok && response.status !== 400 && response.status !== 401 && response.status !== 403 && response.status !== 429) {
    throw new ChannelError("TELEGRAM_TRANSPORT", 502);
  }
  const result = (await response.json()) as { ok?: unknown; result?: unknown; description?: unknown; parameters?: { retry_after?: unknown } };
  if (result.ok !== true) {
    if (response.status === 401) throw new ChannelError("TELEGRAM_INVALID_TOKEN", 400);
    if (response.status === 429) throw new ChannelError("TELEGRAM_RATE_LIMIT", 429);
    throw new ChannelError(`TELEGRAM_${response.status}`, 400);
  }
  void result.parameters;
  return result.result as T;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ChannelError("TELEGRAM_INVALID_EVENT");
  return value as Record<string, unknown>;
}

function chatIdOf(value: unknown): number {
  const id = (object(value) as { id?: unknown }).id;
  if (!Number.isSafeInteger(id) || Number(id) === 0) throw new ChannelError("TELEGRAM_INVALID_EVENT");
  return Number(id);
}

function messageIdOf(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new ChannelError("TELEGRAM_INVALID_EVENT");
  return Number(value);
}

export function makeWebhookSecret(connectionId: string): string {
  // uuid + "." + base64url — допустимые для Telegram символы (A-Za-z0-9_-)
  return `${connectionId}.${randomBytes(24).toString("base64url")}`;
}

function botConfig(connection: ChannelConnection): TelegramBotConfig {
  const config = openConfig(connection);
  if (
    (config.mode !== "bot" && config.mode !== "channel") ||
    typeof config.token !== "string" ||
    typeof config.botId !== "string" ||
    typeof config.webhookSecret !== "string"
  ) {
    throw new ChannelError("TELEGRAM_INVALID_CREDENTIALS", 500);
  }
  return config as unknown as TelegramBotConfig;
}

/** Проверка токена: getMe (is_bot, id совпадает с префиксом токена — по V1). */
export async function inspectBotToken(token: string, fetcher: typeof fetch = fetch): Promise<{ botId: string; username: string; firstName: string }> {
  const me = await telegramCall<Record<string, unknown>>(token, "getMe", {}, fetcher);
  if (me.is_bot !== true || !Number.isSafeInteger(me.id) || String(me.id) !== token.split(":")[0]) {
    throw new ChannelError("TELEGRAM_INVALID_TOKEN", 400);
  }
  const username = typeof me.username === "string" ? me.username : "";
  const firstName = typeof me.first_name === "string" ? me.first_name : "";
  if (!username && !firstName) throw new ChannelError("TELEGRAM_INVALID_TOKEN", 400);
  return { botId: String(me.id), username, firstName };
}

/** Канал + связанная группа обсуждения (getChat/linked_chat_id/getChatMember — по V1). */
export async function inspectChannel(
  token: string,
  botId: string,
  channelUsername: string,
  fetcher: typeof fetch = fetch,
): Promise<{ channelId: string; discussionId: string; channelTitle: string }> {
  if (!/^@[A-Za-z][A-Za-z0-9_]{3,31}$/.test(channelUsername) && !/^-[1-9]\d{1,15}$/.test(channelUsername)) {
    throw new ChannelError("TELEGRAM_INVALID_CHANNEL", 400);
  }
  const source = await telegramCall<Record<string, unknown>>(token, "getChat", { chat_id: channelUsername }, fetcher);
  if (source.type !== "channel") throw new ChannelError("TELEGRAM_NOT_CHANNEL", 400);
  const channelId = chatIdOf(source);
  if (channelId >= 0 || typeof source.title !== "string") throw new ChannelError("TELEGRAM_INVALID_CHANNEL", 400);
  if (!Number.isSafeInteger(source.linked_chat_id)) throw new ChannelError("TELEGRAM_DISCUSSION_REQUIRED", 400);
  const discussionId = chatIdOf({ id: source.linked_chat_id });
  const group = await telegramCall<Record<string, unknown>>(token, "getChat", { chat_id: discussionId }, fetcher);
  if (group.type !== "supergroup" || chatIdOf(group) !== discussionId) throw new ChannelError("TELEGRAM_DISCUSSION_MISMATCH", 400);
  for (const chat of [channelId, discussionId]) {
    const rights = await telegramCall<Record<string, unknown>>(
      token,
      "getChatMember",
      { chat_id: chat, user_id: Number(botId) },
      fetcher,
    );
    const need = rights.status === "administrator" && (chat !== channelId || rights.can_post_messages === true);
    if (!need) throw new ChannelError("TELEGRAM_ACCESS_DENIED", 403);
  }
  return { channelId: String(channelId), discussionId: String(discussionId), channelTitle: String(source.title).slice(0, 200) };
}

export const telegramBotAdapter: ChannelAdapter = {
  type: "TELEGRAM_BOT",

  async initiateConnect(organizationId, params) {
    const token = telegramToken(params.token);
    const me = await inspectBotToken(token);
    const connection = await getDb().channelConnection.create({
      data: {
        organizationId,
        type: "TELEGRAM_BOT",
        externalId: me.botId,
        displayName: me.username ? `@${me.username}` : me.firstName,
        status: "PENDING",
      },
    });
    const config: TelegramBotConfig = {
      mode: typeof params.channelUsername === "string" && params.channelUsername ? "channel" : "bot",
      token,
      botId: me.botId,
      botUsername: me.username || undefined,
      webhookSecret: makeWebhookSecret(connection.id),
    };
    await getDb().channelConnection.update({
      where: { id: connection.id },
      data: { config: sealConfig(config as unknown as Record<string, unknown>, connection.id) as unknown as object },
    });
    return { status: "PENDING", connectionId: connection.id };
  },

  async completeConnect(organizationId, callbackParams) {
    // Оркестрация в роуте: сюда приходит { connectionId, channelUsername? }
    const db = getDb();
    const connectionId = (callbackParams as { connectionId?: unknown }).connectionId;
    if (typeof connectionId !== "string") throw new ChannelError("INVALID_REQUEST", 400);
    const connection = await db.channelConnection.findUnique({ where: { id: connectionId } });
    if (!connection || connection.type !== "TELEGRAM_BOT" || connection.organizationId !== organizationId) {
      throw new ChannelError("NOT_FOUND", 404);
    }
    const config = botConfig(connection);
    const channelUsername = (callbackParams as { channelUsername?: unknown }).channelUsername;
    let displayName = connection.displayName;
    if (typeof channelUsername === "string" && channelUsername) {
      const channel = await inspectChannel(config.token, config.botId, channelUsername);
      config.mode = "channel";
      Object.assign(config, { channelId: channel.channelId, discussionId: channel.discussionId });
      displayName = channel.channelTitle;
    }
    // setWebhook с секретом (по V1): secret_token + allowed_updates
    await telegramCall(config.token, "setWebhook", {
      url: telegramWebhookUrl(),
      secret_token: config.webhookSecret,
      allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post", "my_chat_member"],
      drop_pending_updates: false,
    });
    const updated = await db.channelConnection.update({
      where: { id: connection.id },
      data: {
        status: "ACTIVE",
        displayName,
        config: sealConfig(config as unknown as Record<string, unknown>, connection.id) as unknown as object,
      },
    });
    return updated;
  },

  async resolveConnection({ headers }) {
    // Секрет вида "<connectionId>.<random>": подключение без расшифровки, затем полная проверка
    const supplied = headers.get("x-telegram-bot-api-secret-token");
    if (!supplied) return null;
    if (!/^[A-Za-z0-9_.-]{10,300}$/.test(supplied)) throw new ChannelError("INVALID_SOURCE", 403);
    const connectionId = supplied.split(".")[0];
    if (!/^[0-9a-f-]{36}$/.test(connectionId)) throw new ChannelError("INVALID_SOURCE", 403);
    const connection = await getDb().channelConnection.findUnique({ where: { id: connectionId } });
    if (!connection || connection.type !== "TELEGRAM_BOT") throw new ChannelError("INVALID_SOURCE", 403);
    return connection;
  },

  async parseWebhook(connection, headers, body) {
    const config = botConfig(connection);
    verifySecret(headers, config.webhookSecret, connection.externalId, config.botId);
    const update = object(body);
    if (!Number.isSafeInteger(update.update_id) || Number(update.update_id) < 0) {
      throw new ChannelError("TELEGRAM_INVALID_EVENT");
    }
    const event = normalizeUpdate(update, config);
    return event ? [event] : [];
  },

  async handleWebhook(connection, request, body) {
    if (request.method !== "POST") return Response.json({ ok: false }, { status: 405 });
    try {
      const events = await telegramBotAdapter.parseWebhook(connection, request.headers, body);
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
    const config = botConfig(connection);
    if (!text.trim() || text.length > 4096) return { status: "FAILED", error: "TELEGRAM_INVALID_REQUEST" };
    try {
      const chatId = resolveTargetChat(config, context.conversationKey);
      const replyTo = context.conversationKey.startsWith("post:")
        ? { message_id: Number(context.conversationKey.slice("post:".length)), allow_sending_without_reply: false }
        : undefined;
      const result = await telegramCall<Record<string, unknown>>(config.token, "sendMessage", {
        chat_id: chatId,
        text,
        ...(replyTo ? { reply_parameters: replyTo } : {}),
      });
      const id = messageIdOf(result.message_id);
      return { status: "SENT", externalId: `tg:${id}` };
    } catch (error) {
      if (error instanceof ChannelError && (error.code === "TELEGRAM_TRANSPORT" || error.code === "TELEGRAM_INVALID_EVENT")) {
        return { status: "UNKNOWN" };
      }
      return { status: "FAILED", error: error instanceof ChannelError ? error.code : "TELEGRAM_SEND_FAILED" };
    }
  },
};

function resolveTargetChat(config: TelegramBotConfig, conversationKey: string): number {
  if (conversationKey.startsWith("dm:")) {
    const chat = Number(conversationKey.slice(3));
    if (!Number.isSafeInteger(chat) || chat <= 0) throw new ChannelError("TELEGRAM_INVALID_REQUEST");
    return chat;
  }
  if (conversationKey.startsWith("post:")) {
    if (config.mode !== "channel" || !config.discussionId) {
      throw new ChannelError("TELEGRAM_INVALID_REQUEST");
    }
    return Number(config.discussionId);
  }
  throw new ChannelError("TELEGRAM_INVALID_REQUEST");
}

export function verifySecret(headers: Headers, webhookSecret: string, externalId: string, botId: string): void {
  const supplied = Buffer.from(headers.get("x-telegram-bot-api-secret-token") ?? "");
  const expected = Buffer.from(webhookSecret);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected) ||
    botId !== externalId
  ) {
    throw new ChannelError("INVALID_SOURCE", 403);
  }
}

/** Нормализация апдейта: личка (dm:<chatId>), пост канала и комментарии (post:<postId>). */
function normalizeUpdate(update: Record<string, unknown>, config: TelegramBotConfig): InboundNormalized | null {
  const message = (update.message ?? update.channel_post) as Record<string, unknown> | undefined;
  if (!message) return null; // edited_*/my_chat_member/callback_query — вне B2-пайплайна
  const chat = object(message.chat);
  const chatId = chatIdOf(chat);
  const date = message.date;
  if (!Number.isSafeInteger(date) || Number(date) < 1) throw new ChannelError("TELEGRAM_INVALID_EVENT");
  const from = object(message.from ?? chat);
  const fromId = chatIdOf(from);
  const occurredAt = new Date(Number(date) * 1000);
  const eventId = `telegram:${update.update_id}`;

  if (chatId > 0 && chat.type === "private") {
    // личное сообщение боту
    if (typeof message.text !== "string" || !message.text) return null;
    const name = [from.first_name, from.last_name].filter((v): v is string => typeof v === "string").join(" ").trim();
    return {
      externalEventId: eventId,
      contact: { externalId: String(fromId), name: name || (typeof from.username === "string" ? `@${from.username}` : null) },
      conversationKey: `dm:${chatId}`,
      threadTitle: null,
      text: message.text.slice(0, 16384),
      occurredAt,
    };
  }

  // комментарии: сообщение в группе обсуждения с автопереносом поста канала (по V1)
  if (config.mode === "channel" && config.discussionId && String(chatId) === config.discussionId && message.is_automatic_forward === true) {
    const origin = object(message.forward_origin);
    if (origin.type === "channel" && String(chatIdOf(origin.chat)) === config.channelId) {
      const postId = messageIdOf(origin.message_id);
      const signature = typeof message.author_signature === "string" ? message.author_signature : null;
      return {
        externalEventId: eventId,
        contact: { externalId: `chat:${chatId}`, name: signature },
        conversationKey: `post:${postId}`,
        threadTitle: null,
        text: typeof message.text === "string" && message.text ? message.text.slice(0, 16384) : "[комментарий с вложением]",
        occurredAt,
      };
    }
  }

  // корневой пост канала — создаёт диалог-ветку (threadTitle = начало текста поста)
  if (config.mode === "channel" && config.channelId && String(chatId) === config.channelId) {
    const postId = messageIdOf(message.message_id);
    const text = typeof message.text === "string" && message.text ? message.text : "Публикация с вложением";
    return {
      externalEventId: eventId,
      contact: { externalId: `channel:${config.channelId}`, name: config.botUsername ? `@${config.botUsername}` : "Канал" },
      conversationKey: `post:${postId}`,
      threadTitle: text.slice(0, 80),
      text: text.slice(0, 16384),
      occurredAt,
    };
  }

  return null;
}

/** Отключение бота (план B2): deleteWebhook + DISCONNECTED + затирание секретов. */
export async function disconnectTelegramBot(connection: ChannelConnection): Promise<void> {
  const config = botConfig(connection);
  await telegramCall(config.token, "deleteWebhook", { drop_updates: false }).catch(() => null);
  await getDb().channelConnection.update({
    where: { id: connection.id },
    data: { status: "DISCONNECTED", config: Prisma.JsonNull },
  });
}
