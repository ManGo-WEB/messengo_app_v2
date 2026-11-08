// Общий пайплайн приёма (один для всех каналов, план B0 п.3):
// дедупликация → upsert Contact/Conversation → Message(IN, RECEIVED) → хуки.
// Блокировка подключения (SELECT … FOR UPDATE, по образцу V1) сериализует
// создание диалогов при одновременных вебхуках.
import { getDb } from "../db/client";
import { isUniqueViolation } from "../auth/validate";
import { ChannelError, type InboundNormalized } from "./adapter";
import type { ChannelConnection } from "../../generated/prisma/client";

export type MessageReceived = {
  organizationId: string;
  connectionId: string;
  conversationId: string;
  messageId: string;
  externalEventId: string;
  text: string;
};

const receivedHooks: Array<(message: MessageReceived) => Promise<void> | void> = [];

/** Хук на входящее сообщение — база знаний/AI займёт его в фазе E. */
export function onMessageReceived(hook: (message: MessageReceived) => Promise<void> | void): void {
  receivedHooks.push(hook);
}

export async function handleInboundEvents(
  connection: ChannelConnection,
  events: InboundNormalized[],
): Promise<{ processed: number; duplicates: number }> {
  let processed = 0;
  let duplicates = 0;
  for (const event of events) {
    validate(event);
    // Идемпотентность: уникальность (connectionId, externalEventId) в InboundEvent.
    try {
      await getDb().inboundEvent.create({
        data: {
          organizationId: connection.organizationId,
          connectionId: connection.id,
          externalEventId: event.externalEventId,
          payload: event as unknown as object,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        duplicates++;
        continue;
      }
      throw error;
    }
    const created = await applyEvent(connection, event);
    processed++;
    for (const hook of receivedHooks) await hook(created);
  }
  return { processed, duplicates };
}

function validate(event: InboundNormalized): void {
  if (
    !event.externalEventId ||
    event.externalEventId.length > 300 ||
    !event.contact?.externalId ||
    event.contact.externalId.length > 200 ||
    !event.conversationKey ||
    event.conversationKey.length > 200 ||
    typeof event.text !== "string" ||
    event.text.length > 16384 ||
    !(event.occurredAt instanceof Date) ||
    Number.isNaN(event.occurredAt.getTime())
  ) {
    throw new ChannelError("INVALID_EVENT");
  }
}

async function applyEvent(connection: ChannelConnection, event: InboundNormalized): Promise<MessageReceived> {
  const db = getDb();
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ChannelConnection" WHERE id = ${connection.id} FOR UPDATE`;
    const contact = await tx.contact.upsert({
      where: { connectionId_externalId: { connectionId: connection.id, externalId: event.contact.externalId } },
      create: {
        organizationId: connection.organizationId,
        connectionId: connection.id,
        externalId: event.contact.externalId,
        name: event.contact.name,
      },
      update: event.contact.name ? { name: event.contact.name } : {},
    });
    const conversation = await tx.conversation.upsert({
      where: {
        connectionId_externalKey: { connectionId: connection.id, externalKey: event.conversationKey },
      },
      create: {
        organizationId: connection.organizationId,
        connectionId: connection.id,
        contactId: contact.id,
        externalKey: event.conversationKey,
        threadTitle: event.threadTitle,
        lastMessageAt: event.occurredAt,
      },
      update: {
        contactId: contact.id,
        threadTitle: event.threadTitle ?? undefined,
        lastMessageAt: event.occurredAt,
      },
    });
    const message = await tx.message.create({
      data: {
        organizationId: connection.organizationId,
        conversationId: conversation.id,
        direction: "IN",
        text: event.text,
        status: "RECEIVED",
        externalId: event.externalEventId,
        createdAt: event.occurredAt,
      },
    });
    return {
      organizationId: connection.organizationId,
      connectionId: connection.id,
      conversationId: conversation.id,
      messageId: message.id,
      externalEventId: event.externalEventId,
      text: event.text,
    };
  });
}
