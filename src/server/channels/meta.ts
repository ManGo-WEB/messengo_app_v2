// Meta: Facebook Messenger + Instagram Direct (план B4; механика из V1
// channels/meta, channels/facebook, channels/instagram — упрощена до базового
// флоу). Graph API v25. OAuth Facebook Login → выбор Page (FB) или связанного
// профессионального аккаунта Instagram → подписка вебхуков страницы → Page
// Access Token зашифрован. Подпись вебхука X-Hub-Signature-256 (HMAC-SHA256
// по сырому телу, app secret). 24-часовое окно: отправка блокируется, если
// последний входящий старше 24 часов (HUMAN_AGENT-тег — в конфиге, по
// умолчанию выключен).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getDb } from "../db/client";
import { openConfig, sealConfig } from "../secrets/store";
import { ChannelError, type ChannelAdapter, type InboundNormalized, type ResolveConnectionInput } from "./adapter";
import { handleInboundEvents } from "./pipeline";
import type { ChannelConnection, ChannelType } from "../../generated/prisma/client";

const API_VERSION = "25.0";
const WINDOW_MS = 24 * 60 * 60 * 1000;

export type MetaPlatform = "facebook" | "instagram";

export type MetaConfig = {
  platform: MetaPlatform;
  pageId: string;
  pageToken: string; // Page Access Token
  igAccountId?: string; // связанный профессиональный аккаунт IG
  humanAgent?: boolean; // расширение окна Human Agent (по умолчанию выключено)
};

export function metaEnv(): { appId: string; appSecret: string; verifyToken: string; redirectUrl: string } {
  const appId = process.env.META_APP_ID ?? "";
  const appSecret = process.env.META_APP_SECRET ?? "";
  const verifyToken = process.env.META_VERIFY_TOKEN ?? "";
  const redirectUrl = process.env.META_REDIRECT_URL ?? "";
  if (!appId || !appSecret || !verifyToken || !redirectUrl) {
    throw new ChannelError("META_NOT_CONFIGURED", 503);
  }
  return { appId, appSecret, verifyToken, redirectUrl };
}

export function buildMetaAuthorizeUrl(platform: MetaPlatform, state: string): string {
  const { appId, redirectUrl } = metaEnv();
  const scope =
    platform === "facebook"
      ? "pages_show_list,pages_messaging,pages_manage_metadata"
      : "pages_show_list,instagram_basic,instagram_manage_messages,pages_manage_metadata";
  return `https://www.facebook.com/v${API_VERSION}/dialog/oauth?${new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUrl,
    state,
    response_type: "code",
    scope,
  })}`;
}

export function metaState(): string {
  return randomBytes(32).toString("base64url");
}

/** Подпись Meta для полезной нагрузки (используется и проверкой, и тестами). */
export function signMetaPayload(rawBody: string): string {
  const { appSecret } = metaEnv();
  return `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
}

async function graphGet<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams({ ...params, access_token: token });
  const response = await fetch(`https://graph.facebook.com/v${API_VERSION}/${path}?${query}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const result = (await response.json()) as { error?: unknown; data?: unknown } & Record<string, unknown>;
  if (result.error) throw new ChannelError("META_API_ERROR", 502);
  return result as T;
}

async function graphPost<T>(path: string, token: string, params: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`https://graph.facebook.com/v${API_VERSION}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...params, access_token: token }),
    signal: AbortSignal.timeout(10_000),
  });
  const result = (await response.json()) as { error?: unknown } & Record<string, unknown>;
  if (result.error) throw new ChannelError("META_API_ERROR", 502);
  return result as T;
}

export type MetaAccount = {
  pageId: string;
  name: string;
  pageToken: string;
  igAccountId: string | null;
  igUsername: string | null;
};

/** Страницы пользователя с токенами и связанными IG-аккаунтами (me/accounts). */
export async function listMetaAccounts(userToken: string): Promise<MetaAccount[]> {
  const result = await graphGet<{ data?: unknown }>("me/accounts", userToken, {
    fields: "name,access_token,instagram_business_account{id,username}",
    limit: "50",
  });
  if (!Array.isArray(result.data)) throw new ChannelError("META_INVALID_RESPONSE", 502);
  return (result.data as Record<string, unknown>[]).map((page) => {
    const ig = page.instagram_business_account as Record<string, unknown> | undefined;
    return {
      pageId: String(page.id ?? ""),
      name: typeof page.name === "string" ? page.name : "",
      pageToken: typeof page.access_token === "string" ? page.access_token : "",
      igAccountId: ig && typeof ig.id === "string" ? ig.id : null,
      igUsername: ig && typeof ig.username === "string" ? ig.username : null,
    };
  }).filter((page) => page.pageId && page.name && page.pageToken);
}

/** Обмен кода OAuth на user-token. */
export async function exchangeMetaCode(code: string): Promise<string> {
  const { appId, appSecret, redirectUrl } = metaEnv();
  const query = new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUrl, code });
  const response = await fetch(`https://graph.facebook.com/v${API_VERSION}/oauth/access_token?${query}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const result = (await response.json()) as { access_token?: unknown; error?: unknown };
  if (result.error || typeof result.access_token !== "string" || !result.access_token) {
    throw new ChannelError("META_AUTH_FAILED", 403);
  }
  return result.access_token;
}

/** Финализация: подписка вебхуков страницы (subscribed_apps) и сохранение. */
export async function selectMetaAccount(
  connection: ChannelConnection,
  account: MetaAccount,
): Promise<ChannelConnection> {
  const config = openConfig(connection) as { platform?: MetaPlatform; userToken?: string };
  if (typeof config.platform !== "string") throw new ChannelError("META_INVALID_STATE", 403);
  await graphPost(`${account.pageId}/subscribed_apps`, account.pageToken, {
    subscribed_fields: "messages,messaging_postbacks",
  });
  const metaConfig: MetaConfig = {
    platform: config.platform,
    pageId: account.pageId,
    pageToken: account.pageToken,
    ...(account.igAccountId ? { igAccountId: account.igAccountId } : {}),
  };
  if (config.platform === "instagram" && !account.igAccountId) {
    throw new ChannelError("META_IG_ACCOUNT_REQUIRED", 400);
  }
  return getDb().channelConnection.update({
    where: { id: connection.id },
    data: {
      externalId: config.platform === "instagram" ? account.igAccountId! : account.pageId,
      displayName: config.platform === "instagram" ? `@${account.igUsername ?? account.igAccountId}` : account.name,
      status: "ACTIVE",
      config: sealConfig(metaConfig as unknown as Record<string, unknown>, connection.id) as unknown as object,
    },
  });
}

function metaConfig(connection: ChannelConnection): MetaConfig {
  const config = openConfig(connection);
  if (
    (config.platform !== "facebook" && config.platform !== "instagram") ||
    typeof config.pageId !== "string" ||
    typeof config.pageToken !== "string"
  ) {
    throw new ChannelError("META_INVALID_CREDENTIALS", 500);
  }
  return config as unknown as MetaConfig;
}

function verifySignature(headers: Headers, rawBody: string): void {
  const supplied = Buffer.from((headers.get("x-hub-signature-256") ?? "").replace(/^sha256=/, ""), "hex");
  const expected = Buffer.from(signMetaPayload(rawBody).replace(/^sha256=/, ""), "hex");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new ChannelError("INVALID_SOURCE", 403);
  }
}

type MetaWebhookPayload = {
  object?: unknown;
  entry?: unknown;
};

/** Нормализация событий FB/IG: entry[].messaging[].message → входящие. */
function normalizeMetaUpdate(body: unknown): { platform: MetaPlatform; senderId: string; recipient: string; event: InboundNormalized }[] {
  const payload = (body ?? {}) as MetaWebhookPayload;
  const object = payload.object === "instagram" ? "instagram" : payload.object === "page" ? "page" : null;
  if (!object || !Array.isArray(payload.entry)) throw new ChannelError("INVALID_EVENT");
  const result: { platform: MetaPlatform; senderId: string; recipient: string; event: InboundNormalized }[] = [];
  for (const entry of payload.entry as Record<string, unknown>[]) {
    const messaging = entry.messaging;
    if (!Array.isArray(messaging)) continue;
    for (const item of messaging as Record<string, unknown>[]) {
      const message = item.message as Record<string, unknown> | undefined;
      const sender = item.sender as Record<string, unknown> | undefined;
      if (!message || !sender || typeof sender.id !== "string") continue;
      if (typeof message.text !== "string" || !message.text) continue;
      const timestamp = Number(item.timestamp);
      if (!Number.isSafeInteger(timestamp) || timestamp < 1) continue;
      result.push({
        platform: object === "instagram" ? "instagram" : "facebook",
        senderId: sender.id,
        recipient: String(entry.id ?? ""),
        event: {
          externalEventId: String(message.mid ?? `meta:${timestamp}:${sender.id}`),
          contact: { externalId: sender.id, name: null },
          conversationKey: `psid:${sender.id}`,
          threadTitle: null,
          text: message.text.slice(0, 16384),
          occurredAt: new Date(timestamp),
        },
      });
    }
  }
  return result;
}

export const metaAdapter: ChannelAdapter = {
  type: "FACEBOOK", // регистрируется и под aliases: META, INSTAGRAM

  async initiateConnect(organizationId, params) {
    const platform = params.platform === "instagram" ? "instagram" : "facebook";
    const connection = await getDb().channelConnection.create({
      data: {
        organizationId,
        type: platform === "instagram" ? "INSTAGRAM" : "FACEBOOK",
        externalId: "pending",
        status: "PENDING",
      },
    });
    return { status: "PENDING", connectionId: connection.id, platform };
  },

  async completeConnect() {
    throw new ChannelError("META_OAUTH_REQUIRED", 400);
  },

  async resolveConnection({ body }: ResolveConnectionInput): Promise<ChannelConnection | null> {
    const events = normalizeMetaUpdate(body);
    if (events.length === 0) return null;
    const externalId = events[0].recipient;
    return getDb().channelConnection.findFirst({
      where: { externalId, status: "ACTIVE", type: { in: ["FACEBOOK", "INSTAGRAM"] } },
    });
  },

  async parseWebhook(connection, _headers, body) {
    const config = metaConfig(connection);
    return normalizeMetaUpdate(body)
      .filter((item) => item.platform === config.platform && item.recipient === externalIdOf(config))
      .map((item) => item.event);
  },

  async handleWebhookGet(request) {
    // верификация вебхука Meta: hub.mode/hub.verify_token/hub.challenge
    const query = new URL(request.url).searchParams;
    if (query.get("hub.mode") !== "subscribe") return new Response("Forbidden", { status: 403 });
    if (query.get("hub.verify_token") !== metaEnv().verifyToken) return new Response("Forbidden", { status: 403 });
    return new Response(query.get("hub.challenge") ?? "", { status: 200 });
  },

  async handleWebhook(connection, request, body, rawBody) {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    verifySignature(request.headers, rawBody);
    const events = await metaAdapter.parseWebhook(connection, request.headers, body);
    const result = await handleInboundEvents(connection, events);
    return Response.json(result, { status: 200 });
  },

  async sendMessage(connection, text, context) {
    const config = metaConfig(connection);
    // 24-часовое окно: блокируем отправку, если последний входящий старше 24ч
    // (HUMAN_AGENT-тег — по конфигу, по умолчанию выключен)
    if (context.lastInboundAt) {
      const age = Date.now() - context.lastInboundAt.getTime();
      if (age > WINDOW_MS && !config.humanAgent) {
        return { status: "FAILED", error: "META_WINDOW_EXPIRED" };
      }
    }
    if (!text.trim() || text.length > 4096) return { status: "FAILED", error: "META_INVALID_REQUEST" };
    const recipient = context.conversationKey.slice("psid:".length);
    if (!recipient) return { status: "FAILED", error: "META_INVALID_REQUEST" };
    try {
      const endpoint = config.platform === "instagram" ? `${config.igAccountId}/messages` : `${config.pageId}/messages`;
      const result = await graphPost<{ message_id?: unknown; recipient_id?: unknown }>(endpoint, config.pageToken, {
        recipient: { id: recipient },
        message: { text },
        messaging_type: "RESPONSE",
        ...(config.humanAgent ? { tag: "HUMAN_AGENT" } : {}),
      });
      const externalId = typeof result.message_id === "string" ? result.message_id : `meta:${Date.now()}`;
      return { status: "SENT", externalId };
    } catch (error) {
      if (error instanceof ChannelError && error.code === "META_API_ERROR") {
        return { status: "FAILED", error: "META_SEND_REJECTED" };
      }
      return { status: "UNKNOWN" };
    }
  },
};

function externalIdOf(config: MetaConfig): string {
  return config.platform === "instagram" ? config.igAccountId ?? "" : config.pageId;
}

/** Клон адаптера под конкретный тип канала (реестр хранит по типу подключения). */
export function metaAdapterFor(type: ChannelType): ChannelAdapter {
  return { ...metaAdapter, type };
}
