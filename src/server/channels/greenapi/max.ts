// MAX-канал через Green API (план C3): тот же флоу «как новое устройство», что
// у WhatsApp (C2), с MAX-спецификой по официальной документации
// green-api.com/v3/docs (сверено 21.11.2026):
//  - состояния инстанса включают pendingPassword (2FA) — sleepMode/yellowCard нет;
//  - QR обновляется каждые 5 с, type ответа qr может быть already_registered;
//  - пароль 2FA — POST sendAuthorizationPassword {password} (ошибки с HTTP 200);
//  - sendMessage: текст до 4000 символов; chatId — числовой id / телефон@c.us,
//    группы с минусом.
// Политика 2FA: Umnico требует отключать 2FA у пользователей; Messengo вместо
// этого поддерживает ввод пароля оператором (PENDING_2FA → ввод кода → ACTIVE).
import { getDb } from "../../db/client";
import { handleInboundEvents } from "../pipeline";
import { publishChannelStatus } from "../../events/channel-events";
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
import type { ChannelConnection } from "../../../generated/prisma/client";

const MAX_TEXT_LENGTH = 4_000; // ограничение sendMessage MAX по документации
const MAX_2FA_PASSWORD_LENGTH = 100;

export const maxAdapter: ChannelAdapter = {
  type: "MAX",

  /** Подключение (план C3 п.1): Developer-креды из params либо партнёрский createInstance. */
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
      const created = await createGreenApiInstance(partner, greenApiInstanceSettings("Messengo MAX"));
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
        type: "MAX",
        externalId: config.instanceId,
        displayName: "MAX (Green API)",
        status: "PENDING",
      },
    });
    await db.channelConnection.update({
      where: { id: connection.id },
      data: { config: await sealGreenApiConfig(connection.id, config) },
    });
    void reapplySettings(config).catch(() => {});
    const qr = await freshQrDataUrl(config);
    return {
      status: "PENDING" as const,
      connectionId: connection.id,
      ...(qr ? { qr } : {}),
      expiresAt: new Date(Date.parse(config.qrRequestedAt!) + QR_EXPIRY_MS).toISOString(),
    };
  },

  async completeConnect() {
    // Завершение — по опросу статуса, вебхуку stateInstanceChanged и 2FA-эндпоинту.
    throw new ChannelError("GREENAPI_WEBHOOK_FLOW", 400);
  },

  async resolveConnection({ headers, body }) {
    const instanceId = bodyInstanceId(body);
    if (!instanceId) return null;
    const connection = await findGreenApiConnectionByIdInstance(instanceId);
    if (!connection) return null;
    verifyWebhookToken(headers, openGreenApiConfig(connection));
    return connection;
  },

  async parseWebhook(connection, headers, body) {
    const webhook = validateGreenApiWebhook(connection, headers, body);
    if (webhook.typeWebhook !== "incomingMessageReceived") return [];
    return greenApiInboundEvents(webhook);
  },

  /** Полный цикл вебхука: authorized → ACTIVE, pendingPassword → трекинг, broken → ERROR. */
  async handleWebhook(connection, request, body) {
    const config = openGreenApiConfig(connection);
    const webhook = validateGreenApiWebhook(connection, request.headers, body);
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
            await markConnectionError(connection, updated, webhook.stateInstance);
            return Response.json({ ok: true, stage: "error" });
          }
          // pendingPassword (2FA ждёт пароля) и starting — только трекинг
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
  },

  /** Отправка: sendMessage по chatId (лимит MAX — 4000 символов); сеть/таймаут → UNKNOWN. */
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

/**
 * Статус подключения для UI (план C3 п.2): инстанс в pendingPassword →
 * состояние PENDING_2FA (twoFaRequired) — оператор вводит пароль через
 * POST /api/channels/max/[id]/twofa.
 */
export async function maxConnectStatus(connection: ChannelConnection) {
  const config = openGreenApiConfig(connection);
  const stateInstance = await pollInstanceState(config);
  await trackInstanceState(connection, config, stateInstance);

  if (stateInstance === "authorized") {
    if (connection.status !== "ACTIVE") {
      await getDb().channelConnection.update({
        where: { id: connection.id },
        data: { status: "ACTIVE", externalId: config.instanceId },
      });
      await publishChannelStatus({ ...connection, status: "ACTIVE" });
      void reapplySettings(config).catch(() => {});
    }
    return { id: connection.id, status: "ACTIVE", stateInstance };
  }

  if (connection.status === "ACTIVE") {
    if (BROKEN_INSTANCE_STATES.has(stateInstance)) {
      await markConnectionError(connection, config, stateInstance);
      return { id: connection.id, status: "ERROR", stateInstance, reason: "INSTANCE_BROKEN" };
    }
    return { id: connection.id, status: "ACTIVE", stateInstance };
  }

  // PENDING: 2FA-шаг не ограничиваем 10-минутным окном QR — у MAX есть свой
  // лимит ввода пароля (time_limit_expired_logout → состояние вернётся в
  // notAuthorized, после чего сработает правило «отвалившийся QR»).
  if (stateInstance === "pendingPassword") {
    return { id: connection.id, status: "PENDING", stateInstance, twoFaRequired: true };
  }
  const qrAge = config.qrRequestedAt ? Date.now() - Date.parse(config.qrRequestedAt) : QR_EXPIRY_MS;
  if (qrAge > QR_EXPIRY_MS && (stateInstance === "notAuthorized" || BROKEN_INSTANCE_STATES.has(stateInstance))) {
    await markConnectionError(connection, config, stateInstance);
    return { id: connection.id, status: "ERROR", stateInstance, reason: "QR_EXPIRED" };
  }
  const qr = await freshQrDataUrl(config);
  return { id: connection.id, status: "PENDING", stateInstance, ...(qr ? { qr } : {}) };
}

/**
 * Ввод пароля 2FA (план C3 п.2, КП: PENDING_2FA → ввод кода → ACTIVE).
 * Результат sendAuthorizationPassword пробрасывается оператору:
 * success → следующий опрос статуса увидит authorized; fail → reason.
 */
export async function submitMaxTwoFaPassword(connection: ChannelConnection, password: string) {
  if (typeof password !== "string" || !password.trim() || password.length > MAX_2FA_PASSWORD_LENGTH) {
    throw new ChannelError("GREENAPI_INVALID_2FA", 400);
  }
  const config = openGreenApiConfig(connection);
  try {
    const response = await clientOfConfig(config).sendAuthorizationPassword(password.trim());
    if (response.status === true && response.data?.status === "success") {
      return { success: true as const };
    }
    return { success: false as const, reason: response.data?.reason ?? "fail" };
  } catch (error) {
    if (error instanceof ChannelError) throw error;
    throw new ChannelError("GREENAPI_TRANSPORT", 503);
  }
}

async function reapplySettings(config: GreenApiConnectionConfig): Promise<void> {
  await reapplyInstanceSettings(config, `Messengo MAX ${config.instanceId}`);
}
