// Общая обработка событий вебхуков Green API — едина для WhatsApp (C2) и MAX (C3):
// формат уведомлений у Green API унифицирован (docs: Интеграция через Green-Api.md,
// сверено с green-api.com/docs).
import { getDb } from "../../db/client";
import { publishBusEvent } from "../../events/bus";
import type { InboundNormalized } from "../adapter";
import type { GreenApiIncomingMessageReceived, GreenApiOutgoingMessageStatus } from "./types";

/**
 * Нормализация входящего текстового сообщения (план C2 п.2):
 * chatId → Contact, conversationKey = chatId.
 */
export function greenApiInboundEvents(webhook: GreenApiIncomingMessageReceived): InboundNormalized[] {
  const text = webhook.messageData.textMessageData?.textMessage;
  if (webhook.messageData.typeMessage !== "textMessage" || !text) return [];
  const name =
    webhook.senderData.senderName || webhook.senderData.senderContactName || webhook.senderData.chatName || null;
  return [
    {
      externalEventId: `greenapi:${webhook.instanceData.idInstance}:${webhook.idMessage}`,
      contact: { externalId: webhook.senderData.sender, name: name ? name.slice(0, 200) : null },
      conversationKey: webhook.senderData.chatId.slice(0, 200),
      threadTitle: webhook.senderData.chatName ?? null,
      text: text.slice(0, 16384),
      occurredAt: new Date(webhook.timestamp * 1000),
    },
  ];
}

/**
 * Reconcile статуса исходящего сообщения по уведомлению outgoingMessageStatus
 * (план C2 п.3): UNKNOWN-исходы отправки закрываются фактом доставки.
 * sent/delivered/read → SENT; failed/noAccount/notInGroup → FAILED.
 */
export async function reconcileGreenApiMessageStatus(
  webhook: GreenApiOutgoingMessageStatus,
): Promise<{ updated: boolean; status?: "SENT" | "FAILED" }> {
  const target =
    webhook.status === "sent" || webhook.status === "delivered" || webhook.status === "read"
      ? ("SENT" as const)
      : webhook.status === "failed" || webhook.status === "noAccount" || webhook.status === "notInGroup"
        ? ("FAILED" as const)
        : null;
  if (!target) return { updated: false };
  const db = getDb();
  const message = await db.message.findFirst({
    where: { externalId: webhook.idMessage, direction: "OUT", status: { in: ["PENDING", "UNKNOWN"] } },
  });
  if (!message) return { updated: false };
  const job = await db.outboxJob.findUnique({ where: { messageId: message.id } });
  await db.$transaction([
    db.message.update({ where: { id: message.id }, data: { status: target } }),
    ...(job && (job.status === "PROCESSING" || job.status === "PENDING")
      ? [
          db.outboxJob.update({
            where: { id: job.id },
            data: { status: target, lastError: target === "FAILED" ? (webhook.description ?? webhook.status) : null },
          }),
        ]
      : []),
  ]);
  // Реалтайм (D2 п.3): reconcile-статус — в шину (SSE).
  await publishBusEvent({
    type: "message.status",
    orgId: message.organizationId,
    conversationId: message.conversationId,
    messageId: message.id,
    direction: "OUT",
    status: target,
  });
  return { updated: true, status: target };
}
