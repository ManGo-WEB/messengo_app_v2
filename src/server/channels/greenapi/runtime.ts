// Общая обвязка Green API (план C1/C2): окружение, конфиг подключения, клиенты,
// проверка вебхука. Спецификации — по официальной документации green-api.com/docs:
// webhookUrlToken передаётся Green API в заголовке Authorization (Webhook Endpoint).
import { createHash } from "node:crypto";
import { ChannelError } from "../adapter";
import { getDb } from "../../db/client";
import { openConfig, sealConfig } from "../../secrets/store";
import { GreenApiClient, GreenApiError } from "./client";
import type { ChannelConnection } from "../../../generated/prisma/client";
import type { GreenApiWebhook } from "./types";

/** Окно жизни QR-сессии: инстанс не авторизован 10 мин → подключение ERROR (КП C2). */
export const QR_EXPIRY_MS = 10 * 60_000;

/** Состояния инстанса, означающие реальную проблему (не транзиентные). */
export const BROKEN_INSTANCE_STATES = new Set(["notAuthorized", "blocked", "suspended"]);

/** Секреты подключения Green API — хранятся только зашифрованными (CHANNEL_SECRET_KEY). */
export type GreenApiConnectionConfig = {
  instanceId: string;
  apiTokenInstance: string;
  /** Хост API инстанса из ответа createInstance (иначе GREEN_API_BASE_URL). */
  apiUrl?: string;
  /** whatsapp | telegram | v3 (MAX) — поле ответа createInstance. */
  typeInstance?: string;
  /** webhookUrlToken — Green API шлёт его в заголовке Authorization вебхука. */
  webhookToken: string;
  /** ISO-момент выдачи QR (окно 10 мин на сканирование). */
  qrRequestedAt?: string;
  /** Последнее известное состояние инстанса (stateInstanceChanged / поллинг). */
  lastState?: string;
};

export function greenApiBaseUrl(): string {
  const base = process.env.GREEN_API_BASE_URL ?? "";
  if (!/^https?:\/\//.test(base)) throw new ChannelError("GREENAPI_NOT_CONFIGURED", 503);
  return base.replace(/\/+$/, "");
}

/** Партнёрские креды из окружения; null — работает тариф Developer. */
export function greenApiPartnerConfig(): { partnerApiUrl: string; partnerToken: string } | null {
  const partnerToken = process.env.GREEN_API_PARTNER_TOKEN ?? "";
  if (!partnerToken) return null;
  const partnerApiUrl = (process.env.GREEN_API_PARTNER_API_URL ?? "https://api.green-api.com").replace(/\/+$/, "");
  return { partnerApiUrl, partnerToken };
}

export function greenApiWebhookUrl(): string {
  return (
    process.env.GREEN_API_WEBHOOK_URL ??
    `${process.env.AUTH_BASE_URL ?? "http://localhost:3000"}/api/webhooks/greenapi`
  );
}

/** webhookUrlToken: из окружения либо производный от AUTH_SECRET (как секрет вебхука в B3). */
export function greenApiWebhookToken(): string {
  const fromEnv = process.env.GREEN_API_WEBHOOK_TOKEN ?? "";
  if (fromEnv) return fromEnv;
  return createHash("sha256")
    .update(`greenapi:${process.env.AUTH_SECRET ?? ""}`)
    .digest("base64url")
    .slice(0, 64);
}

/** Настройки вебхуков инстанса — единые для WhatsApp (C2) и MAX (C3). */
export function greenApiInstanceSettings(name: string): {
  name: string;
  webhookUrl: string;
  webhookUrlToken: string;
  incomingWebhook: "yes" | "no";
  outgoingWebhook: "yes" | "no";
  outgoingAPIMessageWebhook: "yes" | "no";
  outgoingMessageWebhook: "yes" | "no";
  stateWebhook: "yes" | "no";
  markIncomingMessagesReaded: "yes" | "no";
  delaySendMessagesMilliseconds: number;
} {
  return {
    name,
    webhookUrl: greenApiWebhookUrl(),
    webhookUrlToken: greenApiWebhookToken(),
    incomingWebhook: "yes",
    outgoingWebhook: "yes",
    outgoingAPIMessageWebhook: "yes",
    outgoingMessageWebhook: "yes",
    stateWebhook: "yes",
    // прочитанность входящих решает оператор в окне чатов (фаза D) — не авто
    markIncomingMessagesReaded: "no",
    delaySendMessagesMilliseconds: 1000,
  };
}

export function openGreenApiConfig(connection: ChannelConnection): GreenApiConnectionConfig {
  const config = openConfig(connection);
  if (typeof config.instanceId !== "string" || typeof config.apiTokenInstance !== "string") {
    throw new ChannelError("GREENAPI_INVALID_CREDENTIALS", 500);
  }
  return config as unknown as GreenApiConnectionConfig;
}

export async function sealGreenApiConfig(
  connectionId: string,
  config: GreenApiConnectionConfig,
): Promise<object> {
  return sealConfig(config as unknown as Record<string, unknown>, connectionId) as unknown as object;
}

export function clientFor(connection: ChannelConnection): GreenApiClient {
  const config = openGreenApiConfig(connection);
  return new GreenApiClient({
    baseUrl: config.apiUrl ?? greenApiBaseUrl(),
    idInstance: config.instanceId,
    apiTokenInstance: config.apiTokenInstance,
  });
}

/**
 * Проверка подлинности вебхука: Green API дублирует webhookUrlToken подключения
 * в заголовке Authorization (docs: Technology Webhook Endpoint).
 */
export function verifyWebhookToken(headers: Headers, config: GreenApiConnectionConfig): void {
  const supplied = headers.get("authorization") ?? "";
  if (supplied.length !== config.webhookToken.length) throw new ChannelError("INVALID_SOURCE", 403);
  if (supplied !== config.webhookToken) throw new ChannelError("INVALID_SOURCE", 403);
}

/**
 * Поиск подключения по instanceData.idInstance вебхука среди WHATSAPP/MAX
 * (конфиг зашифрован — кандидаты открываются и проверяются по секрету).
 */
export async function findGreenApiConnectionByIdInstance(instanceId: string): Promise<ChannelConnection | null> {
  const candidates = await getDb().channelConnection.findMany({
    where: { type: { in: ["WHATSAPP", "MAX"] }, status: { in: ["PENDING", "ACTIVE"] } },
  });
  for (const connection of candidates) {
    const config = safeOpen(connection);
    if (config?.instanceId === instanceId) return connection;
  }
  return null;
}

function safeOpen(connection: ChannelConnection): GreenApiConnectionConfig | null {
  try {
    return openGreenApiConfig(connection);
  } catch {
    return null;
  }
}

// ── Общие механики адаптеров каналов Green API (C2 WhatsApp, C3 MAX) ────────

export function clientOfConfig(config: GreenApiConnectionConfig): GreenApiClient {
  return new GreenApiClient({
    baseUrl: config.apiUrl ?? greenApiBaseUrl(),
    idInstance: config.instanceId,
    apiTokenInstance: config.apiTokenInstance,
  });
}

/** Повторная установка настроек вебхуков (идемпотентно, после createInstance и authorized). */
export async function reapplyInstanceSettings(config: GreenApiConnectionConfig, name: string): Promise<void> {
  await clientOfConfig(config).setSettings(greenApiInstanceSettings(name));
}

/** Свежий QR-код (data URL) либо null (timeout/error/уже авторизован). */
export async function freshQrDataUrl(config: GreenApiConnectionConfig): Promise<string | null> {
  try {
    const qr = await clientOfConfig(config).getQr();
    return qr.type === "qrCode" ? `data:image/png;base64,${qr.message}` : null;
  } catch {
    return null;
  }
}

/** Фиксация последнего состояния инстанса в конфиге подключения. */
export async function trackInstanceState(
  connection: ChannelConnection,
  config: GreenApiConnectionConfig,
  stateInstance: string,
): Promise<void> {
  if (config.lastState === stateInstance) return;
  await getDb().channelConnection.update({
    where: { id: connection.id },
    data: {
      config: await sealGreenApiConfig(connection.id, { ...config, lastState: stateInstance }),
    },
  });
}

/** Перевод подключения в ERROR (реальная проблема инстанса; уведомление — лог до фазы D). */
export async function markConnectionError(
  connection: ChannelConnection,
  config: GreenApiConnectionConfig,
  stateInstance: string,
): Promise<void> {
  await getDb().channelConnection.update({
    where: { id: connection.id },
    data: {
      status: "ERROR",
      config: await sealGreenApiConfig(connection.id, { ...config, lastState: stateInstance }),
    },
  });
  console.error(
    `greenapi: подключение ${connection.id} (${connection.type}) → ERROR, состояние ${stateInstance}`,
  );
}

/** Креды инстанса из params (тариф Developer); частичные/кривые → 400. */
export function developerCredentials(params: Record<string, unknown>): {
  idInstance: string;
  apiTokenInstance: string;
} | null {
  const { idInstance, apiTokenInstance } = params as { idInstance?: unknown; apiTokenInstance?: unknown };
  const hasAny = idInstance !== undefined || apiTokenInstance !== undefined;
  const valid =
    typeof idInstance === "string" &&
    /^\d{6,16}$/.test(idInstance) &&
    typeof apiTokenInstance === "string" &&
    apiTokenInstance.length >= 8;
  if (hasAny && !valid) throw new ChannelError("GREENAPI_INVALID_CREDENTIALS", 400);
  return valid ? { idInstance, apiTokenInstance } : null;
}

/** idInstance из тела вебхука (number|string). */
export function bodyInstanceId(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const instanceData = (body as { instanceData?: unknown }).instanceData;
  if (!instanceData || typeof instanceData !== "object") return null;
  const idInstance = (instanceData as { idInstance?: unknown }).idInstance;
  if (typeof idInstance === "number" && Number.isSafeInteger(idInstance)) return String(idInstance);
  if (typeof idInstance === "string" && /^\d{1,16}$/.test(idInstance)) return idInstance;
  return null;
}

/** Проверка Authorization-заголовка и формы вебхука; возвращает типизированное тело. */
export function validateGreenApiWebhook(connection: ChannelConnection, headers: Headers, body: unknown): GreenApiWebhook {
  const config = openGreenApiConfig(connection);
  verifyWebhookToken(headers, config);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ChannelError("GREENAPI_INVALID_EVENT");
  }
  return body as GreenApiWebhook;
}

/** Статус-эндпоинт: инстанс ещё создаётся (пустой ответ getStateInstance) → starting. */
export async function pollInstanceState(config: GreenApiConnectionConfig): Promise<string> {
  try {
    return (await clientOfConfig(config).getStateInstance()).stateInstance;
  } catch (error) {
    if (error instanceof GreenApiError && error.code === "INVALID_RESPONSE") return "starting";
    throw error;
  }
}
