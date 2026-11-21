// Integration-тест MAX через Green API (план C3 п.3, по аналогии с C2):
// создание → QR → pendingPassword (PENDING_2FA) → ввод кода → authorized →
// ACTIVE → входящее → ответ → SENT. Green API подменяется глобальным fetch.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { POST as registerRoute } from "../../src/app/api/auth/register/route";
import { POST as login } from "../../src/app/api/auth/login/route";
import { POST as connectMax } from "../../src/app/api/channels/max/connect/route";
import { GET as maxStatus } from "../../src/app/api/channels/max/[id]/status/route";
import { POST as maxTwoFa } from "../../src/app/api/channels/max/[id]/twofa/route";
import { POST as webhook } from "../../src/app/api/webhooks/[channel]/route";
import { registerChannelSendJobs } from "../../src/worker/channel-jobs";
import { processNextDueJob } from "../../src/worker/loop";
import { checkGreenApiInstances } from "../../src/server/channels/greenapi/status-sync";
import { openConfig, sealConfig } from "../../src/server/secrets/store";
import { call, db, resetDb, sessionCookieOf } from "./helpers";

const realFetch = globalThis.fetch;
const WEBHOOK_TOKEN = "test-max-webhook-token";
const GREEN_API_BASE = "http://api.max.greenapi.test";
const DEVELOPER_INSTANCE = "3100000000";

const fake = {
  state: "notAuthorized",
  qr: { type: "qrCode", message: "bWF4LXFx" },
  nextSendMessageId: "MAX_MSG_1",
  passwordAttempts: 0,
  setSettingsCalls: 0,
};

function fakeGreenApi(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    if (url.includes("/partner/createInstance/")) {
      return json({
        apiTokenInstance: "max-partner-token",
        apiUrl: GREEN_API_BASE,
        idInstance: 3109999000,
        mediaUrl: GREEN_API_BASE,
        typeInstance: "v3", // MAX — именно v3 по документации
      });
    }
    if (url.includes("/getStateInstance/")) return json({ stateInstance: fake.state });
    if (url.includes("/qr/")) return json(fake.qr);
    if (url.includes("/sendAuthorizationPassword/")) {
      fake.passwordAttempts++;
      const body = init?.body ? (JSON.parse(String(init.body)) as { password?: string }) : {};
      return body.password === "верный-пароль"
        ? json({ status: true, data: { status: "success" } })
        : json({ status: true, data: { status: "fail", reason: "invalid_password" } });
    }
    if (url.includes("/sendMessage/")) return json({ idMessage: fake.nextSendMessageId });
    if (url.includes("/setSettings/")) {
      fake.setSettingsCalls++;
      return json({ saveSettings: true });
    }
    throw new Error(`фикстура Green API MAX не знает URL ${url}`);
  }) as unknown as typeof fetch;
}

function greenApiWebhook(body: unknown, authorization = WEBHOOK_TOKEN): Request {
  return new Request("http://localhost:3000/api/webhooks/greenapi", {
    method: "POST",
    headers: { "content-type": "application/json", authorization },
    body: JSON.stringify(body),
  });
}

const INSTANCE_DATA = {
  idInstance: Number(DEVELOPER_INSTANCE),
  wid: "79991234567@c.us",
  typeInstance: "v3",
};

// chatId в MAX — числовой id пользователя (группы — с минусом)
const INBOUND = {
  typeWebhook: "incomingMessageReceived",
  instanceData: INSTANCE_DATA,
  timestamp: 1763641000,
  idMessage: "MAX_IN_1",
  senderData: {
    chatId: "10000000",
    sender: "10000000",
    chatName: "Ходабрыш Пробешёлов",
    chatType: "user",
    senderName: "Ходабрыш Пробешёлов",
    senderType: "user",
    senderContactName: "Ходабрыш Пробешёлов",
    senderPhoneNumber: 79876543210,
  },
  messageData: { typeMessage: "textMessage", textMessageData: { textMessage: "Привет из MAX" } },
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
    call("/api/auth/register", { body: { email: "max-op@example.com", password: "parol-max-2026", name: "Оператор MAX" } }),
  );
  const loginResponse = await login(call("/api/auth/login", { body: { email: "max-op@example.com", password: "parol-max-2026" } }));
  cookie = sessionCookieOf(loginResponse);
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await db.$disconnect();
});

describe("Подключение и 2FA (КП C3: PENDING_2FA → ввод кода → ACTIVE)", () => {
  test("connect: инстанс Developer из params → PENDING + QR", async () => {
    const response = await connectMax(
      call("/api/channels/max/connect", {
        body: { idInstance: DEVELOPER_INSTANCE, apiTokenInstance: "max-dev-token" },
        cookie,
      }),
    );
    expect(response.status).toBe(201);
    const data = (await response.json()) as { connectionId: string; qr: string; expiresAt: string };
    expect(data.qr).toBe("data:image/png;base64,bWF4LXFx");
    connectionId = data.connectionId;
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection.type).toBe("MAX");
    expect(connection.status).toBe("PENDING");
    expect(connection.externalId).toBe(DEVELOPER_INSTANCE);
  });

  test("status: PENDING (notAuthorized), QR в ответе", async () => {
    const response = await maxStatus(call(`/api/channels/max/${connectionId}/status`, { cookie }), {
      params: Promise.resolve({ id: connectionId }),
    });
    const data = (await response.json()) as { status: string; stateInstance: string; qr?: string };
    expect(data.status).toBe("PENDING");
    expect(data.stateInstance).toBe("notAuthorized");
    expect(data.qr).toBe("data:image/png;base64,bWF4LXFx");
  });

  test("pendingPassword → PENDING_2FA (twoFaRequired), не ERROR (КП C3)", async () => {
    fake.state = "pendingPassword";
    const response = await maxStatus(call(`/api/channels/max/${connectionId}/status`, { cookie }), {
      params: Promise.resolve({ id: connectionId }),
    });
    const data = (await response.json()) as {
      status: string;
      stateInstance: string;
      twoFaRequired?: boolean;
      reason?: string;
    };
    expect(data.status).toBe("PENDING");
    expect(data.stateInstance).toBe("pendingPassword");
    expect(data.twoFaRequired).toBe(true);
    expect(data.reason).toBeUndefined();
  });

  test("2FA: неверный пароль → success:false + reason, статус остаётся PENDING", async () => {
    const response = await maxTwoFa(
      call(`/api/channels/max/${connectionId}/twofa`, { body: { password: "неверный" }, cookie }),
      { params: Promise.resolve({ id: connectionId }) },
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as { success: boolean; reason?: string };
    expect(data.success).toBe(false);
    expect(data.reason).toBe("invalid_password");
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection.status).toBe("PENDING");
  });

  test("2FA: верный пароль → success:true; authorized → ACTIVE", async () => {
    const twofaResponse = await maxTwoFa(
      call(`/api/channels/max/${connectionId}/twofa`, { body: { password: "верный-пароль" }, cookie }),
      { params: Promise.resolve({ id: connectionId }) },
    );
    expect(((await twofaResponse.json()) as { success: boolean }).success).toBe(true);

    fake.state = "authorized";
    const response = await maxStatus(call(`/api/channels/max/${connectionId}/status`, { cookie }), {
      params: Promise.resolve({ id: connectionId }),
    });
    const data = (await response.json()) as { status: string; stateInstance: string };
    expect(data.status).toBe("ACTIVE");
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection.status).toBe("ACTIVE");
    expect(fake.setSettingsCalls).toBeGreaterThanOrEqual(1);
  });

  test("2FA: пустой пароль → 400", async () => {
    const response = await maxTwoFa(
      call(`/api/channels/max/${connectionId}/twofa`, { body: { password: "  " }, cookie }),
      { params: Promise.resolve({ id: connectionId }) },
    );
    expect(response.status).toBe(400);
  });
});

describe("Вебхук Green API: входящие и статусы (MAX chatId — числовой id)", () => {
  test("incomingMessageReceived → Contact/Conversation/Message, conversationKey = chatId", async () => {
    const response = await webhook(greenApiWebhook(INBOUND), { params: Promise.resolve({ channel: "greenapi" }) });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { processed: number; duplicates: number };
    expect(data).toEqual({ processed: 1, duplicates: 0 });

    const message = await db.message.findFirstOrThrow({ where: { externalId: `greenapi:${DEVELOPER_INSTANCE}:MAX_IN_1` } });
    expect(message.direction).toBe("IN");
    expect(message.text).toBe("Привет из MAX");
    const conversation = await db.conversation.findUniqueOrThrow({ where: { id: message.conversationId } });
    expect(conversation.externalKey).toBe("10000000");
    const contact = await db.contact.findUniqueOrThrow({ where: { id: conversation.contactId } });
    expect(contact.externalId).toBe("10000000");
    expect(contact.name).toBe("Ходабрыш Пробешёлов");
  });

  test("повтор вебхука → дедупликация; неверный токен → 403", async () => {
    const dup = (await (
      await webhook(greenApiWebhook(INBOUND), { params: Promise.resolve({ channel: "greenapi" }) })
    ).json()) as { duplicates: number };
    expect(dup.duplicates).toBe(1);
    const forbidden = await webhook(greenApiWebhook(INBOUND, "wrong"), {
      params: Promise.resolve({ channel: "greenapi" }),
    });
    expect(forbidden.status).toBe(403);
  });

  test("ответ оператора: OutboxJob → SENT, externalId записан; failed → FAILED reconcile", async () => {
    const conversation = await db.conversation.findFirstOrThrow({ where: { externalKey: "10000000" } });
    const message = await db.message.create({
      data: { organizationId: conversation.organizationId, conversationId: conversation.id, direction: "OUT", text: "Ответ из Messengo" },
    });
    await db.outboxJob.create({
      data: { organizationId: conversation.organizationId, messageId: message.id, type: "MAX" },
    });
    expect(await processNextDueJob()).toBe(true);
    const sent = await db.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(sent.status).toBe("SENT");
    expect(sent.externalId).toBe("MAX_MSG_1");

    // failed-статус закрывает UNKNOWN-задание
    const unknownMessage = await db.message.create({
      data: {
        organizationId: conversation.organizationId,
        conversationId: conversation.id,
        direction: "OUT",
        text: "Не доставлено",
        status: "UNKNOWN",
        externalId: "MAX_MSG_2",
      },
    });
    const job = await db.outboxJob.create({
      data: {
        organizationId: conversation.organizationId,
        messageId: unknownMessage.id,
        type: "MAX",
        status: "PROCESSING",
      },
    });
    const statusResponse = await webhook(
      greenApiWebhook({
        typeWebhook: "outgoingMessageStatus",
        instanceData: INSTANCE_DATA,
        timestamp: 1763641100,
        chatId: "10000000",
        idMessage: "MAX_MSG_2",
        status: "failed",
        description: "Error: forbidden",
        sendByApi: true,
      }),
      { params: Promise.resolve({ channel: "greenapi" }) },
    );
    expect(statusResponse.status).toBe(200);
    expect((await db.message.findUniqueOrThrow({ where: { id: unknownMessage.id } })).status).toBe("FAILED");
    expect((await db.outboxJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("FAILED");
  });
});

describe("Отвалившийся QR и проверка воркером", () => {
  test("КП C2/C3: PENDING + notAuthorized дольше 10 мин → ERROR (QR_EXPIRED)", async () => {
    fake.state = "notAuthorized";
    const config = openConfig(await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } }));
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
    const response = await maxStatus(call(`/api/channels/max/${connectionId}/status`, { cookie }), {
      params: Promise.resolve({ id: connectionId }),
    });
    const data = (await response.json()) as { status: string; reason?: string };
    expect(data.status).toBe("ERROR");
    expect(data.reason).toBe("QR_EXPIRED");
  });

  test("воркер раз в 5 мин: ACTIVE MAX + blocked → ERROR (план C2 п.5 для обоих типов)", async () => {
    fake.state = "blocked";
    const organization = await db.organization.create({ data: { name: "MAX Check Org" } });
    const watched = await db.channelConnection.create({
      data: { organizationId: organization.id, type: "MAX", externalId: "3100000002", status: "ACTIVE" },
    });
    await db.channelConnection.update({
      where: { id: watched.id },
      data: {
        config: sealConfig(
          { instanceId: "3100000002", apiTokenInstance: "watch-max-token", webhookToken: WEBHOOK_TOKEN },
          watched.id,
        ) as unknown as object,
      },
    });
    const summary = await checkGreenApiInstances();
    expect(summary.errored).toBeGreaterThanOrEqual(1);
    expect((await db.channelConnection.findUniqueOrThrow({ where: { id: watched.id } })).status).toBe("ERROR");
  });
});

describe("Подключение (партнёрский режим, typeInstance v3)", () => {
  test("connect без кредов: инстанс создаётся через партнёрский createInstance", async () => {
    process.env.GREEN_API_PARTNER_TOKEN = "partner-secret";
    try {
      const response = await connectMax(call("/api/channels/max/connect", { body: {}, cookie }));
      expect(response.status).toBe(201);
      const data = (await response.json()) as { connectionId: string; qr: string };
      expect(data.qr).toBe("data:image/png;base64,bWF4LXFx");
      const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: data.connectionId } });
      expect(connection.externalId).toBe("3109999000");
      const config = openConfig(connection);
      expect(config.typeInstance).toBe("v3");
    } finally {
      delete process.env.GREEN_API_PARTNER_TOKEN;
    }
  });
});
