// Integration-тест WhatsApp через Green API (план C2 п.6): создание → QR →
// authorized → входящее → ответ → SENT. Green API подменяется глобальным fetch
// (фикстуры по URL); спецификации вебхуков — по официальной документации.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { POST as registerRoute } from "../../src/app/api/auth/register/route";
import { POST as login } from "../../src/app/api/auth/login/route";
import { POST as connectWhatsapp } from "../../src/app/api/channels/whatsapp/connect/route";
import { GET as whatsappStatus } from "../../src/app/api/channels/whatsapp/[id]/status/route";
import { POST as webhook } from "../../src/app/api/webhooks/[channel]/route";
import { registerChannelSendJobs } from "../../src/worker/channel-jobs";
import { processNextDueJob } from "../../src/worker/loop";
import { checkGreenApiInstances } from "../../src/server/channels/greenapi/status-sync";
import { openConfig, sealConfig } from "../../src/server/secrets/store";
import { call, db, resetDb, sessionCookieOf } from "./helpers";

const realFetch = globalThis.fetch;
const WEBHOOK_TOKEN = "test-webhook-token";
const GREEN_API_BASE = "http://api.greenapi.test";
const DEVELOPER_INSTANCE = "1101728000";

const fake = {
  state: "notAuthorized",
  qr: { type: "qrCode", message: "ZmFrZS1xcg==" },
  nextSendMessageId: "FAKE_MSG_1",
  setSettingsCalls: 0,
};

function fakeGreenApi(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    if (url.includes("/partner/createInstance/")) {
      return json({
        apiTokenInstance: "partner-created-token",
        apiUrl: GREEN_API_BASE,
        idInstance: 1109999000,
        mediaUrl: GREEN_API_BASE,
        typeInstance: "whatsapp",
      });
    }
    if (url.includes("/getStateInstance/")) return json({ stateInstance: fake.state });
    if (url.includes("/qr/")) return json(fake.qr);
    if (url.includes("/sendMessage/")) return json({ idMessage: fake.nextSendMessageId });
    if (url.includes("/setSettings/")) {
      fake.setSettingsCalls++;
      return json({ saveSettings: true });
    }
    throw new Error(`фикстура Green API не знает URL ${url}`);
  }) as unknown as typeof fetch;
}

function greenApiWebhook(body: unknown, authorization = WEBHOOK_TOKEN): Request {
  return new Request(`http://localhost:3000/api/webhooks/greenapi`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization },
    body: JSON.stringify(body),
  });
}

const INSTANCE_DATA = {
  idInstance: Number(DEVELOPER_INSTANCE),
  wid: "79001112233@c.us",
  typeInstance: "whatsapp",
};

const INBOUND = {
  typeWebhook: "incomingMessageReceived",
  instanceData: INSTANCE_DATA,
  timestamp: 1763640000,
  idMessage: "IN_MSG_1",
  senderData: {
    chatId: "79001234567@c.us",
    sender: "79001234567@c.us",
    chatName: "Иван",
    senderName: "Иван Царевич",
    senderContactName: "Иван",
  },
  messageData: { typeMessage: "textMessage", textMessageData: { textMessage: "Привет, это WhatsApp" } },
};

let cookie = "";
let connectionId = "";

beforeAll(async () => {
  await resetDb();
  process.env.GREEN_API_BASE_URL = GREEN_API_BASE;
  process.env.GREEN_API_PARTNER_API_URL = GREEN_API_BASE;
  process.env.GREEN_API_WEBHOOK_TOKEN = WEBHOOK_TOKEN;
  delete process.env.GREEN_API_PARTNER_TOKEN;
  delete process.env.GREEN_API_WEBHOOK_URL;
  globalThis.fetch = fakeGreenApi();
  registerChannelSendJobs();
  await registerRoute(
    call("/api/auth/register", { body: { email: "wa-op@example.com", password: "parol-wa-2026", name: "Оператор WA" } }),
  );
  const loginResponse = await login(call("/api/auth/login", { body: { email: "wa-op@example.com", password: "parol-wa-2026" } }));
  cookie = sessionCookieOf(loginResponse);
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await db.$disconnect();
});

describe("Подключение (Developer-режим, креды из params)", () => {
  test("connect: инстанс из личного кабинета → PENDING + QR", async () => {
    const response = await connectWhatsapp(
      call("/api/channels/whatsapp/connect", {
        body: { idInstance: DEVELOPER_INSTANCE, apiTokenInstance: "dev-instance-token" },
        cookie,
      }),
    );
    expect(response.status).toBe(201);
    const data = (await response.json()) as { connectionId: string; qr: string; expiresAt: string };
    expect(data.qr).toBe("data:image/png;base64,ZmFrZS1xcg==");
    expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now());
    connectionId = data.connectionId;

    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection.type).toBe("WHATSAPP");
    expect(connection.status).toBe("PENDING");
    expect(connection.externalId).toBe(DEVELOPER_INSTANCE);
    const config = openConfig(connection);
    expect(config.instanceId).toBe(DEVELOPER_INSTANCE);
    expect(config.webhookToken).toBe(WEBHOOK_TOKEN);
  });

  test("connect: кривые креды → 400", async () => {
    const response = await connectWhatsapp(
      call("/api/channels/whatsapp/connect", { body: { idInstance: "abc", apiTokenInstance: "x" }, cookie }),
    );
    expect(response.status).toBe(400);
  });

  test("status: PENDING, состояние инстанса и свежий QR в ответе", async () => {
    const response = await whatsappStatus(call(`/api/channels/whatsapp/${connectionId}/status`, { cookie }), {
      params: Promise.resolve({ id: connectionId }),
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { status: string; stateInstance: string; qr?: string };
    expect(data.status).toBe("PENDING");
    expect(data.stateInstance).toBe("notAuthorized");
    expect(data.qr).toBe("data:image/png;base64,ZmFrZS1xcg==");
  });

  test("status: authorized → ACTIVE (план C2 п.1), настройки вебхуков применены", async () => {
    fake.state = "authorized";
    const response = await whatsappStatus(call(`/api/channels/whatsapp/${connectionId}/status`, { cookie }), {
      params: Promise.resolve({ id: connectionId }),
    });
    const data = (await response.json()) as { status: string; stateInstance: string };
    expect(data.status).toBe("ACTIVE");
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection.status).toBe("ACTIVE");
    expect(fake.setSettingsCalls).toBeGreaterThanOrEqual(1);
  });
});

describe("Вебхук Green API: входящие сообщения", () => {
  test("incomingMessageReceived → Contact/Conversation/Message через общий пайплайн", async () => {
    const response = await webhook(greenApiWebhook(INBOUND), { params: Promise.resolve({ channel: "greenapi" }) });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { processed: number; duplicates: number };
    expect(data).toEqual({ processed: 1, duplicates: 0 });

    const message = await db.message.findFirstOrThrow({ where: { externalId: `greenapi:${DEVELOPER_INSTANCE}:IN_MSG_1` } });
    expect(message.direction).toBe("IN");
    expect(message.status).toBe("RECEIVED");
    expect(message.text).toBe("Привет, это WhatsApp");
    const conversation = await db.conversation.findUniqueOrThrow({ where: { id: message.conversationId } });
    expect(conversation.externalKey).toBe("79001234567@c.us");
    const contact = await db.contact.findUniqueOrThrow({ where: { id: conversation.contactId } });
    expect(contact.externalId).toBe("79001234567@c.us");
    expect(contact.name).toBe("Иван Царевич");
  });

  test("повтор вебхука → дедупликация, дубля нет", async () => {
    const response = await webhook(greenApiWebhook(INBOUND), { params: Promise.resolve({ channel: "greenapi" }) });
    const data = (await response.json()) as { processed: number; duplicates: number };
    expect(data).toEqual({ processed: 0, duplicates: 1 });
  });

  test("неверный webhookUrlToken → 403", async () => {
    const response = await webhook(greenApiWebhook(INBOUND, "wrong-token"), {
      params: Promise.resolve({ channel: "greenapi" }),
    });
    expect(response.status).toBe(403);
  });
});

describe("Отправка и reconcile статусов", () => {
  test("ответ оператора: OutboxJob → SENT, externalId сообщения записан (план C2 п.3)", async () => {
    const conversation = await db.conversation.findFirstOrThrow({ where: { externalKey: "79001234567@c.us" } });
    const message = await db.message.create({
      data: { organizationId: conversation.organizationId, conversationId: conversation.id, direction: "OUT", text: "Здравствуйте!" },
    });
    await db.outboxJob.create({
      data: { organizationId: conversation.organizationId, messageId: message.id, type: "WHATSAPP" },
    });
    expect(await processNextDueJob()).toBe(true);
    const sent = await db.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(sent.status).toBe("SENT");
    expect(sent.externalId).toBe("FAKE_MSG_1");
    const job = await db.outboxJob.findFirstOrThrow({ where: { messageId: message.id } });
    expect(job.status).toBe("SENT");
  });

  test("outgoingMessageStatus failed → UNKNOWN-задание закрывается в FAILED (план C2 п.3)", async () => {
    const conversation = await db.conversation.findFirstOrThrow({ where: { externalKey: "79001234567@c.us" } });
    const message = await db.message.create({
      data: {
        organizationId: conversation.organizationId,
        conversationId: conversation.id,
        direction: "OUT",
        text: "Исчезнет при отправке",
        status: "UNKNOWN",
        externalId: "FAKE_MSG_2",
      },
    });
    const job = await db.outboxJob.create({
      data: { organizationId: conversation.organizationId, messageId: message.id, type: "WHATSAPP", status: "PROCESSING" },
    });
    const response = await webhook(
      greenApiWebhook({
        typeWebhook: "outgoingMessageStatus",
        instanceData: INSTANCE_DATA,
        timestamp: 1763640100,
        chatId: "79001234567@c.us",
        idMessage: "FAKE_MSG_2",
        status: "failed",
        description: "Error: forbidden",
        sendByApi: true,
      }),
      { params: Promise.resolve({ channel: "greenapi" }) },
    );
    expect(response.status).toBe(200);
    const updated = await db.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(updated.status).toBe("FAILED");
    const closedJob = await db.outboxJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(closedJob.status).toBe("FAILED");
    expect(closedJob.lastError).toBe("Error: forbidden");
  });

  test("outgoingMessageStatus delivered для SENT-сообщения — без понижения статуса", async () => {
    const response = await webhook(
      greenApiWebhook({
        typeWebhook: "outgoingMessageStatus",
        instanceData: INSTANCE_DATA,
        timestamp: 1763640200,
        chatId: "79001234567@c.us",
        idMessage: "FAKE_MSG_1",
        status: "delivered",
        sendByApi: true,
      }),
      { params: Promise.resolve({ channel: "greenapi" }) },
    );
    expect(response.status).toBe(200);
    const message = await db.message.findFirstOrThrow({ where: { externalId: "FAKE_MSG_1" } });
    expect(message.status).toBe("SENT");
  });
});

describe("Отвалившийся QR и проверка инстансов воркером", () => {
  test("КП C2: PENDING + notAuthorized дольше 10 мин → ERROR (QR_EXPIRED)", async () => {
    fake.state = "notAuthorized";
    const stale = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    const config = openConfig(stale);
    await db.channelConnection.update({
      where: { id: connectionId },
      data: {
        status: "PENDING",
        config: sealConfig(
          { ...config, qrRequestedAt: new Date(Date.now() - 11 * 60_000).toISOString() },
          connectionId,
        ) as unknown as object,
      },
    });
    const response = await whatsappStatus(call(`/api/channels/whatsapp/${connectionId}/status`, { cookie }), {
      params: Promise.resolve({ id: connectionId }),
    });
    const data = (await response.json()) as { status: string; reason?: string };
    expect(data.status).toBe("ERROR");
    expect(data.reason).toBe("QR_EXPIRED");
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection.status).toBe("ERROR");
  });

  test("воркер раз в 5 мин: ACTIVE + notAuthorized → ERROR (план C2 п.5)", async () => {
    const organization = await db.organization.create({ data: { name: "WA Check Org" } });
    const watched = await db.channelConnection.create({
      data: { organizationId: organization.id, type: "WHATSAPP", externalId: "1101728002", status: "ACTIVE" },
    });
    await db.channelConnection.update({
      where: { id: watched.id },
      data: {
        config: sealConfig(
          { instanceId: "1101728002", apiTokenInstance: "watch-token", webhookToken: WEBHOOK_TOKEN },
          watched.id,
        ) as unknown as object,
      },
    });
    const summary = await checkGreenApiInstances();
    expect(summary.errored).toBeGreaterThanOrEqual(1);
    const checked = await db.channelConnection.findUniqueOrThrow({ where: { id: watched.id } });
    expect(checked.status).toBe("ERROR");
  });
});

describe("Подключение (партнёрский режим)", () => {
  test("connect без кредов: инстанс создаётся через партнёрский createInstance", async () => {
    process.env.GREEN_API_PARTNER_TOKEN = "partner-secret";
    try {
      const response = await connectWhatsapp(call("/api/channels/whatsapp/connect", { body: {}, cookie }));
      expect(response.status).toBe(201);
      const data = (await response.json()) as { connectionId: string; qr: string };
      expect(data.qr).toBe("data:image/png;base64,ZmFrZS1xcg==");
      const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: data.connectionId } });
      expect(connection.externalId).toBe("1109999000");
      const config = openConfig(connection);
      expect(config.typeInstance).toBe("whatsapp");
      expect(config.apiTokenInstance).toBe("partner-created-token");
    } finally {
      delete process.env.GREEN_API_PARTNER_TOKEN;
    }
  });

  test("connect без кредов и без партнёрского ключа → 503", async () => {
    const response = await connectWhatsapp(call("/api/channels/whatsapp/connect", { body: {}, cookie }));
    expect(response.status).toBe(503);
  });
});
