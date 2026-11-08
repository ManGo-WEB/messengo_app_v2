import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { POST as testingInbound } from "../../src/app/api/testing/inbound/route";
import { POST as webhook } from "../../src/app/api/webhooks/[channel]/route";
import { testingAdapter } from "../../src/server/channels/testing";
import { handleInboundEvents, onMessageReceived } from "../../src/server/channels/pipeline";
import { openConfig, sealConfig } from "../../src/server/secrets/store";
import { ChannelError } from "../../src/server/channels/adapter";
import { getDb } from "../../src/server/db/client";
import { call, db, resetDb } from "./helpers";

const db0 = getDb();
let organizationId = "";
let connectionId = "";

const event = (externalEventId: string, extra: Record<string, unknown> = {}) => ({
  externalEventId,
  contactExternalId: "client-1",
  contactName: "Тестовый клиент",
  conversationKey: "chat-1",
  text: `Сообщение ${externalEventId}`,
  occurredAt: "2026-11-08T06:00:00.000Z",
  ...extra,
});

beforeAll(async () => {
  await resetDb();
  const organization = await db.organization.create({ data: { name: "B0-тест" } });
  organizationId = organization.id;
  const connected = await testingAdapter.initiateConnect(organizationId, {});
  if (connected.status !== "ACTIVE") throw new Error("TESTING-подключение не создано");
  connectionId = connected.connection.id;
});

afterAll(async () => {
  await db.$disconnect();
  await db0.$disconnect();
});

describe("пайплайн приёма", () => {
  test("событие создаёт Contact + Conversation + Message(IN, RECEIVED)", async () => {
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    const events = await testingAdapter.parseWebhook(connection, new Headers(), { events: [event("evt-1")] });
    const result = await handleInboundEvents(connection, events);
    expect(result.processed).toBe(1);
    expect(result.duplicates).toBe(0);

    const contact = await db.contact.findUniqueOrThrow({
      where: { connectionId_externalId: { connectionId, externalId: "client-1" } },
    });
    expect(contact.name).toBe("Тестовый клиент");
    const conversation = await db.conversation.findUniqueOrThrow({
      where: { connectionId_externalKey: { connectionId, externalKey: "chat-1" } },
    });
    expect(conversation.contactId).toBe(contact.id);
    expect(conversation.lastMessageAt?.toISOString()).toBe("2026-11-08T06:00:00.000Z");
    const messages = await db.message.findMany({ where: { conversationId: conversation.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].direction).toBe("IN");
    expect(messages[0].status).toBe("RECEIVED");
    expect(messages[0].externalId).toBe("evt-1");
    expect(await db.inboundEvent.count({ where: { connectionId } })).toBe(1);
  });

  test("дубликат события не создаёт второе сообщение", async () => {
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    const events = await testingAdapter.parseWebhook(connection, new Headers(), { events: [event("evt-1")] });
    const result = await handleInboundEvents(connection, events);
    expect(result.duplicates).toBe(1);
    expect(result.processed).toBe(0);
    expect(await db.message.count({ where: { conversation: { connectionId } } })).toBe(1);
    expect(await db.inboundEvent.count({ where: { connectionId } })).toBe(1);
  });

  test("события одного чата ложатся в один диалог; threadTitle обновляется", async () => {
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    const events = await testingAdapter.parseWebhook(
      connection,
      new Headers(),
      {
        events: [
          event("evt-2", { threadTitle: "Ветка про доставку", occurredAt: "2026-11-08T06:05:00.000Z" }),
          event("evt-3", { threadTitle: "Ветка про доставку", occurredAt: "2026-11-08T06:10:00.000Z" }),
        ],
      },
    );
    const result = await handleInboundEvents(connection, events);
    expect(result.processed).toBe(2);
    expect(await db.conversation.count({ where: { connectionId } })).toBe(1);
    expect(await db.message.count({ where: { conversation: { connectionId } } })).toBe(3);
    const conversation = await db.conversation.findUniqueOrThrow({
      where: { connectionId_externalKey: { connectionId, externalKey: "chat-1" } },
    });
    expect(conversation.threadTitle).toBe("Ветка про доставку");
    expect(conversation.lastMessageAt?.toISOString()).toBe("2026-11-08T06:10:00.000Z");
  });

  test("хук onMessageReceived вызывается на каждое новое сообщение", async () => {
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    const seen: string[] = [];
    onMessageReceived((message) => {
      seen.push(message.externalEventId);
    });
    const events = await testingAdapter.parseWebhook(connection, new Headers(), { events: [event("evt-4")] });
    await handleInboundEvents(connection, events);
    expect(seen).toEqual(["evt-4"]);
  });
});

describe("вебхук-роут /api/webhooks/[channel]", () => {
  test("TESTING-канал: 200, событие обработано; неизвестный канал → 404", async () => {
    const response = await webhook(call("/api/webhooks/testing", { body: { connectionId, events: [event("evt-5")] } }), {
      params: Promise.resolve({ channel: "testing" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: 1, duplicates: 0 });

    const unknown = await webhook(call("/api/webhooks/nosuch", { body: {} }), {
      params: Promise.resolve({ channel: "nosuch" }),
    });
    expect(unknown.status).toBe(404);
  });
});

describe("КП: testing-канал создаёт диалог без реального мессенджера", () => {
  test("POST /api/testing/inbound без подключения создаёт организацию, подключение и диалог", async () => {
    const response = await testingInbound(
      call("/api/testing/inbound", { body: { events: [event("auto-1", { conversationKey: "fresh-chat" })] } }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(1);
    expect(body.connectionId).toBeDefined();

    // повтор тем же externalEventId — идемпотентно
    const repeat = await testingInbound(
      call("/api/testing/inbound", { body: { connectionId: body.connectionId, events: [event("auto-1", { conversationKey: "fresh-chat" })] } }),
    );
    expect((await repeat.json()).duplicates).toBe(1);
    expect(await db.message.count({ where: { externalId: "auto-1" } })).toBe(1);
  });

  test("битое событие → 400 INVALID_EVENT", async () => {
    const response = await testingInbound(
      call("/api/testing/inbound", { body: { connectionId, events: [{ text: 123 }] } }),
    );
    expect(response.status).toBe(400);
  });
});

describe("шифрование секретов подключений", () => {
  test("roundtrip: запечатанный config не содержит открытых секретов", () => {
    const sealed = sealConfig({ accessToken: "very-secret-token" }, connectionId);
    expect(sealed).not.toContain("very-secret-token");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(openConfig({ id: connectionId, config: sealed })).toEqual({ accessToken: "very-secret-token" });
    // подделка — ошибка SECRET_UNAVAILABLE
    expect(() => openConfig({ id: connectionId, config: sealed.slice(0, -4) + "AAAA" })).toThrow(ChannelError);
  });
});
