// WhatsApp-канал через Green API (план C2): QR-подключение «как новое устройство».
// Спецификации (qr, getStateInstance, setSettings, sendMessage, вебхуки, заголовок
// Authorization) сверены с официальной документацией green-api.com/docs.
// Локально — фикстуры; приёмка с реальным инстансом — на рабочем сервере (🖥,
// правило плана 0.5). Ограничения схемы WhatsApp: контроль числа подключённых
// устройств и «телефон в сети раз в 14 дней» — docs/runbooks/whatsapp-greenapi.md.
import { getDb } from "../../db/client";
import { handleInboundEvents } from "../pipeline";
import {
  ChannelError,
  type ChannelAdapter,
  type ResolveConnectionInput,
} from "../adapter";
import { GreenApiClient, GreenApiError, createGreenApiInstance } from "./client";
import {
  BROKEN_INSTANCE_STATES,
  QR_EXPIRY_MS,
  clientFor,
  findGreenApiConnectionByIdInstance,
  greenApiBaseUrl,
  greenApiInstanceSettings,
  greenApiPartnerConfig,
  greenApiWebhookToken,
  openGreenApiConfig,
  sealGreenApiConfig,
  verifyWebhookToken,
  type GreenApiConnectionConfig,
} from "./runtime";
import { greenApiInboundEvents, reconcileGreenApiMessageStatus } from "./events";
import type { GreenApiWebhook } from "./types";
import type { ChannelConnection } from "../../../generated/prisma/client";

const MAX_TEXT_LENGTH = 20_000; // ограничение sendMessage по документации

export const whatsappAdapter: ChannelAdapter = {
  type: "WHATSAPP",

  /**
   * Подключение (план C2 п.1): тариф Developer — креды инстанса из личного
   * кабинета в params; при настроенном партнёрском ключе инстанс создаётся
   * через API. Возвращает { connectionId, qr } — QR показывает фронт (фаза D).
   */
  async initiateConnect(organizationId, params) {
    const creds = developerCredentials(params);
    let config: GreenApiConnectionConfig;
    if (creds) {
      config = {
        instanceId: creds.idInstance,
        apiTokenInstance: creds.apiTokenInstance,
        webhookToken: greenApiWebhookToken(),
        qrRequestedAt: new Date().toISOString(),
      };
    } else if (greenApiPartnerConfig()) {
      const partner = greenApiPartnerConfig()!;
      const created = await createGreenApiInstance(partner, greenApiInstanceSettings("Messengo WhatsApp"));
      config = {
        instanceId: String(created.idInstance),
        apiTokenInstance: created.apiTokenInstance,
        apiUrl: created.apiUrl,
        typeInstance: created.typeInstance,
        webhookToken: greenApiWebhookToken(),
        qrRequestedAt: new Date().toISOString(),
      };
    } else {
      throw new ChannelError("GREENAPI_NOT_CONFIGURED", 503);
    }

    const db = getDb();
    const connection = await db.channelConnection.create({
      data: {
        organizationId,
        type: "WHATSAPP",
        externalId: config.instanceId,
        displayName: "WhatsApp (Green API)",
        status: "PENDING",
      },
    });
    await db.channelConnection.update({
      where: { id: connection.id },
      data: { config: await sealGreenApiConfig(connection.id, config) },
    });
    // настройки вебхуков — идемпотентно; при сбое повторяются при переходе в ACTIVE
    void reapplySettings(config).catch(() => {});
    const qr = await freshQr(config);
    return {
      status: "PENDING" as const,
      connectionId: connection.id,
      ...(qr ? { qr } : {}),
      expiresAt: new Date(Date.parse(config.qrRequestedAt!) + QR_EXPIRY_MS).toISOString(),
    };
  },

  async completeConnect() {
    // Завершение — по опросу статуса (GET /api/channels/whatsapp/[id]/status)
    // и вебхуку stateInstanceChanged; прямой callback не предусмотрен.
    throw new ChannelError("GREENAPI_WEBHOOK_FLOW", 400);
  },

  /** Маршрутизация вебхука: instanceData.idInstance → подключение (проверка Authorization). */
  async resolveConnection({ headers, body }: ResolveConnectionInput) {
    const instanceId = bodyInstanceId(body);
    if (!instanceId) return null;
    const connection = await findGreenApiConnectionByIdInstance(instanceId);
    if (!connection) return null;
    verifyWebhookToken(headers, openGreenApiConfig(connection));
    return connection;
  },

  async parseWebhook(connection, headers, body) {
    const webhook = validateWebhook(connection, headers, body);
    if (webhook.typeWebhook !== "incomingMessageReceived") return [];
    return greenApiInboundEvents(webhook);
  },

  /** Полный цикл вебхука: статусы инстанса, входящие, reconcile исходящих. */
  async handleWebhook(connection, request, body) {
    const config = openGreenApiConfig(connection);
    verifyWebhookToken(request.headers, config);
    const webhook = body as GreenApiWebhook;
    const db = getDb();
    try {
      switch (webhook.typeWebhook) {
        case "stateInstanceChanged": {
          const updated: GreenApiConnectionConfig = { ...config, lastState: webhook.stateInstance };
          if (webhook.stateInstance === "authorized") {
            if (connection.status !== "ACTIVE") {
              await db.channelConnection.update({
                where: { id: connection.id },
                data: {
                  status: "ACTIVE",
                  externalId: config.instanceId,
                  config: await sealGreenApiConfig(connection.id, updated),
                },
              });
              void reapplySettings(config).catch(() => {});
            } else {
              await db.channelConnection.update({
                where: { id: connection.id },
                data: { config: await sealGreenApiConfig(connection.id, updated) },
              });
            }
            return Response.json({ ok: true, stage: "authorized" });
          }
          if (BROKEN_INSTANCE_STATES.has(webhook.stateInstance)) {
            // notAuthorized на ACTIVE — устройство отвалилось (разлогин); blocked/suspended — ограничения
            await db.channelConnection.update({
              where: { id: connection.id },
              data: {
                status: "ERROR",
                config: await sealGreenApiConfig(connection.id, updated),
              },
            });
            console.error(
              `greenapi: подключение ${connection.id} (${connection.type}) → ERROR, состояние ${webhook.stateInstance}`,
            );
            return Response.json({ ok: true, stage: "error" });
          }
          // транзиентные состояния (starting, sleepMode) — только фиксация
          await db.channelConnection.update({
            where: { id: connection.id },
            data: { config: await sealGreenApiConfig(connection.id, updated) },
          });
          return Response.json({ ok: true, stage: "state_tracked" });
        }

        case "incomingMessageReceived": {
          if (connection.status !== "ACTIVE") return Response.json({ ok: true, stage: "ignored" });
          const events = greenApiInboundEvents(webhook);
          const result = events.length > 0 ? await handleInboundEvents(connection, events) : { processed: 0, duplicates: 0 };
          return Response.json(result, { headers: { "Cache-Control": "no-store" } });
        }

        case "outgoingMessageStatus": {
          const reconciled = await reconcileGreenApiMessageStatus(webhook);
          return Response.json({ ok: true, ...reconciled }, { headers: { "Cache-Control": "no-store" } });
        }

        default:
          return Response.json({ ok: true, stage: "ignored" });
      }
    } catch (error) {
      if (error instanceof ChannelError) {
        return Response.json({ ok: false, code: error.code }, { status: error.status });
      }
      throw error;
    }
  },

  /** Отправка (план C2 п.3): sendMessage по chatId; таймаут/сеть → UNKNOWN (reconcile). */
  async sendMessage(connection, text, context) {
    if (!text.trim()) return { status: "FAILED", error: "GREENAPI_INVALID_REQUEST" };
    if (text.length > MAX_TEXT_LENGTH) return { status: "FAILED", error: "GREENAPI_TEXT_TOO_LONG" };
    if (connection.status !== "ACTIVE") return { status: "FAILED", error: "GREENAPI_NOT_ACTIVE" };
    try {
      const result = await clientFor(connection).sendMessageSafe({
        chatId: context.conversationKey,
        message: text,
      });
      return result.status === "SENT" ? result : { status: "UNKNOWN" };
    } catch (error) {
      if (error instanceof ChannelError) return { status: "FAILED", error: error.code };
      return { status: "FAILED", error: "GREENAPI_SEND_FAILED" };
    }
  },
};

/** Статус подключения для UI (план C2 п.1): опрос состояния и свежего QR. */
export async function whatsappConnectStatus(connection: ChannelConnection) {
  const config = openGreenApiConfig(connection);
  const client = clientFor(connection);
  let stateInstance: string;
  try {
    stateInstance = (await client.getStateInstance()).stateInstance;
  } catch (error) {
    // инстанс ещё создаётся: getStateInstance может отдать пустой ответ (docs)
    if (error instanceof GreenApiError && error.code === "INVALID_RESPONSE") {
      stateInstance = "starting";
    } else {
      throw error;
    }
  }
  await trackState(connection, config, stateInstance);

  if (stateInstance === "authorized") {
    if (connection.status !== "ACTIVE") {
      await getDb().channelConnection.update({
        where: { id: connection.id },
        data: { status: "ACTIVE", externalId: config.instanceId },
      });
      void reapplySettings(config).catch(() => {});
    }
    return { id: connection.id, status: "ACTIVE", stateInstance };
  }

  if (connection.status === "ACTIVE") {
    if (BROKEN_INSTANCE_STATES.has(stateInstance)) {
      await markError(connection, config, stateInstance);
      return { id: connection.id, status: "ERROR", stateInstance, reason: "INSTANCE_BROKEN" };
    }
    return { id: connection.id, status: "ACTIVE", stateInstance };
  }

  // PENDING: окно QR 10 мин (КП C2: неавторизован дольше → ERROR)
  const qrAge = config.qrRequestedAt ? Date.now() - Date.parse(config.qrRequestedAt) : QR_EXPIRY_MS;
  if (qrAge > QR_EXPIRY_MS && (stateInstance === "notAuthorized" || BROKEN_INSTANCE_STATES.has(stateInstance))) {
    await markError(connection, config, stateInstance);
    return { id: connection.id, status: "ERROR", stateInstance, reason: "QR_EXPIRED" };
  }
  const qr = await freshQr(config);
  return { id: connection.id, status: "PENDING", stateInstance, ...(qr ? { qr } : {}) };
}

// ── Вспомогательные ─────────────────────────────────────────────────────────

function developerCredentials(params: Record<string, unknown>): { idInstance: string; apiTokenInstance: string } | null {
  const { idInstance, apiTokenInstance } = params as {
    idInstance?: unknown;
    apiTokenInstance?: unknown;
  };
  const hasAny = idInstance !== undefined || apiTokenInstance !== undefined;
  const valid =
    typeof idInstance === "string" &&
    /^\d{6,16}$/.test(idInstance) &&
    typeof apiTokenInstance === "string" &&
    apiTokenInstance.length >= 8;
  if (hasAny && !valid) throw new ChannelError("GREENAPI_INVALID_CREDENTIALS", 400);
  return valid ? { idInstance, apiTokenInstance } : null;
}

function bodyInstanceId(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const instanceData = (body as { instanceData?: unknown }).instanceData;
  if (!instanceData || typeof instanceData !== "object") return null;
  const idInstance = (instanceData as { idInstance?: unknown }).idInstance;
  if (typeof idInstance === "number" && Number.isSafeInteger(idInstance)) return String(idInstance);
  if (typeof idInstance === "string" && /^\d{1,16}$/.test(idInstance)) return idInstance;
  return null;
}

function validateWebhook(connection: ChannelConnection, headers: Headers, body: unknown) {
  const config = openGreenApiConfig(connection);
  verifyWebhookToken(headers, config);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ChannelError("GREENAPI_INVALID_EVENT");
  }
  return body as GreenApiWebhook;
}

/** Повторная установка настроек вебхуков (идемпотентно, после createInstance и authorized). */
async function reapplySettings(config: GreenApiConnectionConfig): Promise<void> {
  await clientOf(config).setSettings(greenApiInstanceSettings(`Messengo WhatsApp ${config.instanceId}`));
}

async function freshQr(config: GreenApiConnectionConfig): Promise<string | null> {
  try {
    const qr = await clientOf(config).getQr();
    return qr.type === "qrCode" ? `data:image/png;base64,${qr.message}` : null;
  } catch {
    return null;
  }
}

function clientOf(config: GreenApiConnectionConfig): GreenApiClient {
  return new GreenApiClient({
    baseUrl: config.apiUrl ?? greenApiBaseUrl(),
    idInstance: config.instanceId,
    apiTokenInstance: config.apiTokenInstance,
  });
}

async function trackState(
  connection: ChannelConnection,
  config: GreenApiConnectionConfig,
  stateInstance: string,
): Promise<void> {
  if (config.lastState === stateInstance) return;
  await getDb().channelConnection.update({
    where: { id: connection.id },
    data: { config: await sealGreenApiConfig(connection.id, { ...config, lastState: stateInstance }) },
  });
}

async function markError(
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
