// TESTING-канал (dev-only, план B0 п.6; образец — V1 testing-adapter.ts):
// позволяет вручную создать диалог без реального мессенджера.
// События принимаются через POST /api/testing/inbound (или /api/webhooks/testing).
import { getDb } from "../db/client";
import { ChannelError, type ChannelAdapter, type InboundNormalized } from "./adapter";
import type { ChannelConnection } from "../../generated/prisma/client";

type TestingEvent = {
  externalEventId?: unknown;
  contactExternalId?: unknown;
  contactName?: unknown;
  conversationKey?: unknown;
  threadTitle?: unknown;
  text?: unknown;
  occurredAt?: unknown;
};

export const testingAdapter: ChannelAdapter = {
  type: "TESTING",

  async initiateConnect(organizationId) {
    const connection = await getDb().channelConnection.create({
      data: {
        organizationId,
        type: "TESTING",
        externalId: `testing-${crypto.randomUUID()}`,
        status: "ACTIVE",
      },
    });
    return { status: "ACTIVE", connection };
  },

  async completeConnect(_organizationId, callbackParams) {
    // У TESTING-канала нет OAuth-фазы: подключение создаётся сразу в initiateConnect.
    const id = (callbackParams as { connectionId?: unknown }).connectionId;
    if (typeof id !== "string") throw new ChannelError("INVALID_CALLBACK");
    const connection = await getDb().channelConnection.findUnique({ where: { id } });
    if (!connection || connection.type !== "TESTING") throw new ChannelError("CONNECTION_NOT_FOUND", 404);
    return connection;
  },

  async resolveConnection({ body }): Promise<ChannelConnection | null> {
    const db = getDb();
    const connectionId = (body as { connectionId?: unknown } | null)?.connectionId;
    if (typeof connectionId === "string" && connectionId) {
      return db.channelConnection.findUnique({ where: { id: connectionId } });
    }
    return db.channelConnection.findFirst({ where: { type: "TESTING", status: "ACTIVE" } });
  },

  async parseWebhook(_connection, _headers, body): Promise<InboundNormalized[]> {
    const events = (body as { events?: unknown } | null)?.events;
    if (!Array.isArray(events) || events.length === 0 || events.length > 100) {
      throw new ChannelError("INVALID_EVENT");
    }
    return events.map((raw: TestingEvent) => {
      const occurredAt =
        typeof raw.occurredAt === "string" && Number.isFinite(Date.parse(raw.occurredAt))
          ? new Date(raw.occurredAt)
          : new Date();
      const normalized: InboundNormalized = {
        externalEventId: requireString(raw.externalEventId, "externalEventId"),
        contact: {
          externalId: optionalString(raw.contactExternalId) ?? "test-contact",
          name: optionalString(raw.contactName),
        },
        conversationKey: optionalString(raw.conversationKey) ?? "test-chat",
        threadTitle: optionalString(raw.threadTitle),
        text: requireString(raw.text, "text"),
        occurredAt,
      };
      return normalized;
    });
  },

  async sendMessage(_connection, _text, _context) {
    return { status: "SENT", externalId: `test:${crypto.randomUUID()}` };
  },
};

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 16384) {
    throw new ChannelError("INVALID_EVENT");
  }
  return value;
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.slice(0, 200);
}
