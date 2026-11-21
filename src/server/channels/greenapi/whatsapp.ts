// WhatsApp-канал через Green API (план C2): QR-подключение «как новое устройство».
// Спецификации (qr, getStateInstance, setSettings, sendMessage, вебхуки, заголовок
// Authorization) сверены с официальной документацией green-api.com/docs.
// Локально — фикстуры; приёмка с реальным инстансом — на рабочем сервере (🖥,
// правило плана 0.5). Ограничения схемы WhatsApp: контроль числа подключённых
// устройств и «телефон в сети раз в 14 дней» — docs/runbooks/whatsapp-greenapi.md.
import { getDb } from "../../db/client";
import { handleInboundEvents } from "../pipeline";
import { ChannelError, type ChannelAdapter } from "../adapter";
import { createGreenApiInstance } from "./client";
import {
  BROKEN_INSTANCE_STATES,
  QR_EXPIRY_MS,
  bodyInstanceId,
  clientOfConfig,
  developerCredentials,
  findGreenApiConnectionByIdInstance,
  freshQrDataUrl,
  greenApiInstanceSettings,
  greenApiPartnerConfig,
  greenApiWebhookToken,
  markConnectionError,
  openGreenApiConfig,
  pollInstanceState,
  reapplyInstanceSettings,
  sealGreenApiConfig,
  trackInstanceState,
  validateGreenApiWebhook,
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
    return initiateGreenApiConnect(organizationId, params, {
      type: "WHATSAPP",
      displayName: "WhatsApp (Green API)",
      settingsName: "Messengo WhatsApp",
    });
  },

  async completeConnect() {
    // Завершение — по опросу статуса (GET /api/channels/whatsapp/[id]/status)
    // и вебхуку stateInstanceChanged; прямой callback не предусмотрен.
    throw new ChannelError("GREENAPI_WEBHOOK_FLOW", 400);
  },

  /** Маршрутизация вебхука: instanceData.idInstance → подключение (проверка Authorization). */
  async resolveConnection({ headers, body }) {
    return resolveGreenApiConnection(headers, body);
  },

  async parseWebhook(connection, headers, body) {
    const webhook = validateGreenApiWebhook(connection, headers, body);
    if (webhook.typeWebhook !== "incomingMessageReceived") return [];
    return greenApiInboundEvents(webhook);
  },

  /** Полный цикл вебхука: статусы инстанса, входящие, reconcile исходящих. */
  async handleWebhook(connection, request, body) {
    const config = openGreenApiConfig(connection);
    const webhook = validateGreenApiWebhook(connection, request.headers, body);
    return handleGreenApiWebhook(connection, config, webhook, {
      settingsName: "Messengo WhatsApp",
      // MAX-специфика (pendingPassword → PENDING_2FA) живёт в maxConnectStatus;
      // у WhatsApp pendingPassword не встречается — состояние просто трекается.
    });
  },

  /** Отправка (план C2 п.3): sendMessage по chatId; таймаут/сеть → UNKNOWN (reconcile). */
  async sendMessage(connection, text, context) {
    if (!text.trim()) return { status: "FAILED", error: "GREENAPI_INVALID_REQUEST" };
    if (text.length > MAX_TEXT_LENGTH) return { status: "FAILED", error: "GREENAPI_TEXT_TOO_LONG" };
    if (connection.status !== "ACTIVE") return { status: "FAILED", error: "GREENAPI_NOT_ACTIVE" };
    try {
      const result = await clientOfConfig(openGreenApiConfig(connection)).sendMessageSafe({
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
  const stateInstance = await pollInstanceState(config);
  await trackInstanceState(connection, config, stateInstance);

  if (stateInstance === "authorized") {
    return activateGreenApiConnection(connection, config, {
      settingsName: "Messengo WhatsApp",
    });
  }

  if (connection.status === "ACTIVE") {
    if (BROKEN_INSTANCE_STATES.has(stateInstance)) {
      await markConnectionError(connection, config, stateInstance);
      return { id: connection.id, status: "ERROR", stateInstance, reason: "INSTANCE_BROKEN" };
    }
    return { id: connection.id, status: "ACTIVE", stateInstance };
  }

  // PENDING: окно QR 10 мин (КП C2: неавторизован дольше → ERROR)
  const qrAge = config.qrRequestedAt ? Date.now() - Date.parse(config.qrRequestedAt) : QR_EXPIRY_MS;
  if (qrAge > QR_EXPIRY_MS && (stateInstance === "notAuthorized" || BROKEN_INSTANCE_STATES.has(stateInstance))) {
    await markConnectionError(connection, config, stateInstance);
    return { id: connection.id, status: "ERROR", stateInstance, reason: "QR_EXPIRED" };
  }
  const qr = await freshQrDataUrl(config);
  return { id: connection.id, status: "PENDING", stateInstance, ...(qr ? { qr } : {}) };
}

// ── Общая механика Green API-каналов (C2/C3) — файлы whatsapp.ts / max.ts ────

type GreenApiChannelOptions = {
  type: "WHATSAPP" | "MAX";
  displayName: string;
  settingsName: string;
};

/** initiateConnect: Developer-креды из params либо партнёрский createInstance (C2 п.1, C3 п.1). */
async function initiateGreenApiConnect(
  organizationId: string,
  params: Record<string, unknown>,
  options: GreenApiChannelOptions,
) {
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
    const created = await createGreenApiInstance(partner, greenApiInstanceSettings(options.settingsName));
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
      type: options.type,
      externalId: config.instanceId,
      displayName: options.displayName,
      status: "PENDING",
    },
  });
  await db.channelConnection.update({
    where: { id: connection.id },
    data: { config: await sealGreenApiConfig(connection.id, config) },
  });
  // настройки вебхуков — идемпотентно; при сбое повторяются при переходе в ACTIVE
  void reapplyInstanceSettings(config, `${options.settingsName} ${config.instanceId}`).catch(() => {});
  const qr = await freshQrDataUrl(config);
  return {
    status: "PENDING" as const,
    connectionId: connection.id,
    ...(qr ? { qr } : {}),
    expiresAt: new Date(Date.parse(config.qrRequestedAt!) + QR_EXPIRY_MS).toISOString(),
  };
}

/** resolveConnection вебхука: idInstance из тела → подключение (Authorization проверяется). */
async function resolveGreenApiConnection(headers: Headers, body: unknown) {
  const instanceId = bodyInstanceId(body);
  if (!instanceId) return null;
  const connection = await findGreenApiConnectionByIdInstance(instanceId);
  if (!connection) return null;
  verifyWebhookToken(headers, openGreenApiConfig(connection));
  return connection;
}

/**
 * Полная обработка вебхука (общая для C2/C3): stateInstanceChanged → ACTIVE/ERROR,
 * incomingMessageReceived → пайплайн, outgoingMessageStatus → reconcile.
 */
async function handleGreenApiWebhook(
  connection: ChannelConnection,
  config: GreenApiConnectionConfig,
  webhook: GreenApiWebhook,
  options: { settingsName: string },
): Promise<Response> {
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
            void reapplyInstanceSettings(config, `${options.settingsName} ${config.instanceId}`).catch(() => {});
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
          await markConnectionError(connection, updated, webhook.stateInstance);
          return Response.json({ ok: true, stage: "error" });
        }
        // транзиентные состояния (starting, sleepMode, pendingPassword) — только фиксация
        await db.channelConnection.update({
          where: { id: connection.id },
          data: { config: await sealGreenApiConfig(connection.id, updated) },
        });
        return Response.json({ ok: true, stage: "state_tracked" });
      }

      case "incomingMessageReceived": {
        if (connection.status !== "ACTIVE") return Response.json({ ok: true, stage: "ignored" });
        const events = greenApiInboundEvents(webhook);
        const result =
          events.length > 0 ? await handleInboundEvents(connection, events) : { processed: 0, duplicates: 0 };
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
}

/** Переход authorized → ACTIVE со повторными настройками вебхуков. */
async function activateGreenApiConnection(
  connection: ChannelConnection,
  config: GreenApiConnectionConfig,
  options: { settingsName: string },
) {
  if (connection.status !== "ACTIVE") {
    await getDb().channelConnection.update({
      where: { id: connection.id },
      data: { status: "ACTIVE", externalId: config.instanceId },
    });
    void reapplyInstanceSettings(config, `${options.settingsName} ${config.instanceId}`).catch(() => {});
  }
  return { id: connection.id, status: "ACTIVE", stateInstance: "authorized" };
}
