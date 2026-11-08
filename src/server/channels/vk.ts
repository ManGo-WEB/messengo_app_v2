// VK-адаптер (план B1; механика перенесена из V1 src/server/channels/vk/):
// OAuth 2.0 через id.vk.ru с PKCE → список сообществ администратора →
// токен сообщества (oauth.vk.com) → регистрация Callback API с секретом.
// Проверка вебхука: payload.secret + group_id (timing-safe, как в V1).
import { randomBytes, randomInt, timingSafeEqual, createHash } from "node:crypto";
import { getDb } from "../db/client";
import { openConfig, sealConfig } from "../secrets/store";
import { ChannelError, type ChannelAdapter, type InboundNormalized } from "./adapter";
import { handleInboundEvents } from "./pipeline";
import type { ChannelConnection } from "../../generated/prisma/client";

export type VkConfig = {
  groupId: number;
  token: string; // токен сообщества (messages.send)
  callbackSecret: string; // секрет Callback API, генерируем мы и отдаём VK
  confirmationCode: string;
  senderName?: string;
};

type Fetcher = typeof fetch;
const API_VERSION = "5.199";

export function vkEnv(): { appId: string; appSecret: string; redirectUrl: string; webhookUrl: string } {
  const appId = process.env.VK_APP_ID ?? "";
  const appSecret = process.env.VK_APP_SECRET ?? "";
  const redirectUrl = process.env.VK_REDIRECT_URL ?? "";
  const webhookUrl = process.env.VK_WEBHOOK_URL ?? `${process.env.AUTH_BASE_URL ?? "http://localhost:3000"}/api/webhooks/vk`;
  if (!appId || !appSecret || !redirectUrl) throw new ChannelError("VK_NOT_CONFIGURED", 503);
  return { appId, appSecret, redirectUrl, webhookUrl };
}

/** PKCE-пара для OAuth (state и verifier — 43 символа base64url, как в V1). */
export function vkPkce(): { state: string; verifier: string } {
  return { state: randomBytes(32).toString("base64url"), verifier: randomBytes(32).toString("base64url") };
}

export function buildUserAuthorizeUrl(input: { state: string; verifier: string }): string {
  const { appId, redirectUrl } = vkEnv();
  return `https://id.vk.ru/authorize?${new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUrl,
    response_type: "code",
    state: input.state,
    code_challenge: createHash("sha256").update(input.verifier).digest("base64url"),
    code_challenge_method: "s256",
    scope: "groups",
  })}`;
}

export function buildCommunityAuthorizeUrl(input: { state: string; groupId: number }): string {
  const { appId, redirectUrl } = vkEnv();
  // scope 266240 = сообщения сообщества (образец V1)
  return `https://oauth.vk.com/authorize?${new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUrl,
    response_type: "code",
    display: "page",
    state: input.state,
    group_ids: String(input.groupId),
    scope: "266240",
    v: API_VERSION,
  })}`;
}

async function vkApi<T = Record<string, unknown>>(
  method: string,
  token: string,
  params: Record<string, string> = {},
  fetcher: Fetcher = fetch,
  timeoutMs = 10_000,
): Promise<T> {
  const body = new URLSearchParams({ ...params, access_token: token, v: API_VERSION });
  const response = await fetcher(`https://api.vk.com/method/${method}`, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new ChannelError("VK_TRANSPORT_FAILED", 502);
  const result = (await response.json()) as Record<string, unknown>;
  if (result.error) {
    const error = result.error as { error_code?: number };
    throw new ChannelError(`VK_${typeof error.error_code === "number" ? error.error_code : 0}`, 502);
  }
  if (!("response" in result)) throw new ChannelError("VK_INVALID_RESPONSE", 502);
  return result.response as T;
}

/** Обмен кода пользователя (id.vk.ru, PKCE) — возвращает user access token. */
export async function exchangeUserCode(
  input: { code: string; state: string; verifier: string; deviceId: string },
  fetcher: Fetcher = fetch,
): Promise<string> {
  const { appId, redirectUrl } = vkEnv();
  const query = new URLSearchParams({
    grant_type: "authorization_code",
    redirect_uri: redirectUrl,
    client_id: appId,
    code_verifier: input.verifier,
    state: input.state,
    device_id: input.deviceId,
  });
  const response = await fetcher(`https://id.vk.ru/oauth2/auth?${query}`, {
    method: "POST",
    body: new URLSearchParams({ code: input.code }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new ChannelError("VK_AUTH_FAILED", 403);
  const tokens = (await response.json()) as { access_token?: unknown };
  if (typeof tokens.access_token !== "string" || !tokens.access_token) throw new ChannelError("VK_AUTH_FAILED", 403);
  return tokens.access_token;
}

/** Обмен кода сообщества (oauth.vk.com, client_secret) — токен сообщества. */
export async function exchangeCommunityCode(code: string, fetcher: Fetcher = fetch): Promise<string> {
  const { appId, appSecret, redirectUrl } = vkEnv();
  const query = new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUrl, code });
  const response = await fetcher(`https://oauth.vk.com/access_token?${query}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new ChannelError("VK_AUTH_FAILED", 403);
  const tokens = (await response.json()) as { access_token?: unknown };
  if (typeof tokens.access_token !== "string" || !tokens.access_token) throw new ChannelError("VK_AUTH_FAILED", 403);
  return tokens.access_token;
}

export type VkCommunity = { id: number; name: string };

/** Сообщества, где пользователь — администратор (groups.get filter=admin, по V1). */
export async function listAdminCommunities(
  userToken: string,
  fetcher: Fetcher = fetch,
  offset = 0,
): Promise<{ items: VkCommunity[]; nextOffset: number | null }> {
  const response = await vkApi<{ count?: unknown; items?: unknown }>(
    "groups.get",
    userToken,
    { filter: "admin", extended: "1", count: "100", offset: String(offset) },
    fetcher,
  );
  if (!Number.isSafeInteger(response.count) || Number(response.count) < 0 || !Array.isArray(response.items)) {
    throw new ChannelError("VK_INVALID_RESPONSE", 502);
  }
  const items = (response.items as Record<string, unknown>[]).map((group) => {
    if (!Number.isSafeInteger(group.id) || Number(group.id) < 1 || typeof group.name !== "string") {
      throw new ChannelError("VK_INVALID_RESPONSE", 502);
    }
    return { id: Number(group.id), name: group.name };
  });
  const next = offset + items.length < Number(response.count) ? offset + items.length : null;
  return { items, nextOffset: next };
}

async function requireAdminCommunity(
  userToken: string,
  groupId: number,
  fetcher: Fetcher = fetch,
): Promise<void> {
  let offset: number | null = 0;
  for (let pages = 0; offset !== null && pages < 1000; pages++) {
    const page = await listAdminCommunities(userToken, fetcher, offset);
    if (page.items.some((group) => group.id === groupId)) return;
    offset = page.nextOffset;
  }
  throw new ChannelError("VK_NOT_ADMIN", 403);
}

/** Финальная настройка: проверка прав токена, код подтверждения, Callback-сервер. */
export async function configureCommunity(
  connectionId: string,
  groupId: number,
  communityToken: string,
  fetcher: Fetcher = fetch,
): Promise<VkConfig> {
  const rights = await vkApi<{ permissions?: unknown }>("groups.getTokenPermissions", communityToken, {}, fetcher);
  const permissions = Array.isArray(rights.permissions)
    ? (rights.permissions as { name?: unknown; setting?: unknown }[])
    : [];
  if (!permissions.some((p) => p.name === "messages" && Number(p.setting) > 0)) {
    throw new ChannelError("VK_ACCESS_DENIED", 403);
  }
  const confirmation = await vkApi<{ code?: unknown }>(
    "groups.getCallbackConfirmationCode",
    communityToken,
    { group_id: String(groupId) },
    fetcher,
  );
  if (typeof confirmation.code !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(confirmation.code)) {
    throw new ChannelError("VK_ACCESS_DENIED", 403);
  }
  const config: VkConfig = {
    groupId,
    token: communityToken,
    callbackSecret: randomBytes(24).toString("hex"),
    confirmationCode: confirmation.code,
  };
  const { webhookUrl } = vkEnv();
  const server = await vkApi<{ server_id?: unknown }>(
    "groups.addCallbackServer",
    communityToken,
    { url: webhookUrl, title: "Messengo", secret_key: config.callbackSecret, group_id: String(groupId) },
    fetcher,
  );
  if (!Number.isSafeInteger(server.server_id) || Number(server.server_id) < 1) {
    throw new ChannelError("VK_CALLBACK_CREATE_FAILED", 502);
  }
  await vkApi("groups.setCallbackSettings", communityToken, {
    server_id: String(server.server_id),
    api_version: API_VERSION,
    message_new: "1",
    group_id: String(groupId),
  }, fetcher);
  return config;
}

function vkConfig(connection: ChannelConnection): VkConfig {
  const config = openConfig(connection);
  if (
    !Number.isSafeInteger(config.groupId) ||
    typeof config.token !== "string" ||
    typeof config.callbackSecret !== "string" ||
    typeof config.confirmationCode !== "string"
  ) {
    throw new ChannelError("VK_INVALID_CREDENTIALS", 500);
  }
  return config as unknown as VkConfig;
}

/** Проверка вебхука VK: payload.secret + group_id (timing-safe, по V1). */
export function verifyVkCallback(payload: Record<string, unknown>, config: VkConfig): Record<string, unknown> {
  const supplied = Buffer.from(typeof payload.secret === "string" ? payload.secret : "");
  const expected = Buffer.from(config.callbackSecret);
  if (
    Number(payload.group_id) !== config.groupId ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    throw new ChannelError("INVALID_SOURCE", 403);
  }
  const sanitized = { ...payload };
  delete sanitized.secret;
  return sanitized;
}

export const vkAdapter: ChannelAdapter = {
  type: "VK",

  async initiateConnect(organizationId, _params) {
    // Реальный флоу — через роут /api/channels/vk/connect (PKCE-печенька);
    // здесь только заглушка контракта для прямых вызовов.
    void _params;
    const connection = await getDb().channelConnection.create({
      data: { organizationId, type: "VK", externalId: "pending", status: "PENDING" },
    });
    return { status: "PENDING", connectionId: connection.id };
  },

  async completeConnect() {
    throw new ChannelError("VK_OAUTH_REQUIRED", 400);
  },

  async resolveConnection({ body }) {
    const groupId = (body as { group_id?: unknown } | null)?.group_id;
    if (!Number.isSafeInteger(groupId) || Number(groupId) < 1) return null;
    return getDb().channelConnection.findFirst({
      where: { type: "VK", externalId: String(groupId), status: "ACTIVE" },
    });
  },

  async parseWebhook(connection, _headers, body) {
    const config = vkConfig(connection);
    const payload = verifyVkCallback(body as Record<string, unknown>, config);
    if (payload.type !== "message_new") return [];
    const message = ((payload.object as Record<string, unknown>) ?? {}).message as Record<string, unknown> | undefined;
    if (
      !message ||
      !Number.isSafeInteger(message.peer_id) ||
      !Number.isSafeInteger(message.from_id) ||
      !Number.isSafeInteger(message.date) ||
      Number(message.date) < 1 ||
      typeof message.text !== "string" ||
      message.text.length > 16384
    ) {
      throw new ChannelError("INVALID_EVENT");
    }
    const event: InboundNormalized = {
      externalEventId: `vk:${payload.event_id}`,
      contact: { externalId: String(message.from_id), name: null },
      conversationKey: String(message.peer_id),
      threadTitle: null,
      text: message.text,
      occurredAt: new Date(Number(message.date) * 1000),
    };
    return [event];
  },

  /** VK требует специальные ответы вебхука (confirmation-строка / «ok»),
   *  поэтому адаптер перехватывает обработку целиком. */
  async handleWebhook(connection, request, body) {
    const text = (value: string, status = 200) =>
      new Response(value, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    if (request.method !== "POST") return text("METHOD_NOT_ALLOWED", 405);
    const config = vkConfig(connection);
    const payload = body as Record<string, unknown>;
    if (payload?.type === "confirmation") {
      await getDb().channelConnection.update({ where: { id: connection.id }, data: { updatedAt: new Date() } });
      return text(config.confirmationCode);
    }
    const events = await vkAdapter.parseWebhook(connection, request.headers, body);
    if (events.length > 0) await handleInboundEvents(connection, events);
    return text("ok");
  },

  async sendMessage(connection, messageText, context) {
    const config = vkConfig(connection);
    if (!messageText.trim() || messageText.length > 4096) {
      return { status: "FAILED", error: "VK_INVALID_REQUEST" };
    }
    const peerId = Number(context.conversationKey);
    if (!Number.isSafeInteger(peerId) || peerId === 0) {
      return { status: "FAILED", error: "VK_INVALID_PEER" };
    }
    try {
      const id = await vkApi<number>(
        "messages.send",
        config.token,
        {
          peer_id: String(peerId),
          group_id: String(config.groupId),
          random_id: String(randomInt(1, 2 ** 31)),
          message: messageText,
          ...(config.senderName ? { sender: config.senderName.slice(0, 100) } : {}),
        },
      );
      if (!Number.isSafeInteger(id) || Number(id) < 1) return { status: "UNKNOWN" };
      return { status: "SENT", externalId: `send:${id}` };
    } catch (error) {
      // Транспортный сбой посреди запроса — доставка неясна (reconcile в B/C).
      if (error instanceof ChannelError && error.code === "VK_TRANSPORT_FAILED") return { status: "UNKNOWN" };
      return { status: "FAILED", error: error instanceof ChannelError ? error.code : "VK_SEND_FAILED" };
    }
  },
};

/** Пересохранение конфига подключения (используется роутами B1). */
export async function saveVkConfig(connection: ChannelConnection, config: Record<string, unknown>): Promise<void> {
  await getDb().channelConnection.update({
    where: { id: connection.id },
    data: { config: sealConfig(config, connection.id) },
  });
}
