import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { POST as registerRoute } from "../../src/app/api/auth/register/route";
import { POST as login } from "../../src/app/api/auth/login/route";
import { GET as listChannels } from "../../src/app/api/channels/route";
import { DELETE as deleteChannel } from "../../src/app/api/channels/[id]/route";
import { GET as channelStatus } from "../../src/app/api/channels/[id]/status/route";
import { GET as deletionPage } from "../../src/app/api/meta/data-deletion/[code]/route";
import { sealConfig } from "../../src/server/secrets/store";
import { call, db, resetDb } from "./helpers";

const realFetch = globalThis.fetch;
const telegramCalls: string[] = [];

let cookie1 = "";
let cookie2 = "";
let vkId = "";
let telegramBotId = "";
let facebookId = "";
let foreignId = "";

beforeAll(async () => {
  await resetDb();
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("api.telegram.org")) {
      const method = url.split("/").pop()!;
      telegramCalls.push(method);
      return new Response(JSON.stringify({ ok: true, result: true }), { headers: { "content-type": "application/json" } });
    }
    throw new Error(`неожиданный запрос в тесте: ${url}`);
  }) as unknown as typeof fetch;

  await registerRoute(call("/api/auth/register", { body: { email: "b5-op@example.com", password: "parol-b5-2026", name: "Оператор 1" } }));
  const login1 = await login(call("/api/auth/login", { body: { email: "b5-op@example.com", password: "parol-b5-2026" } }));
  cookie1 = login1.headers.getSetCookie().find((c) => /^better-auth\.session_token=/i.test(c))!.split(";")[0];

  await registerRoute(call("/api/auth/register", { body: { email: "b5-other@example.com", password: "parol-b5-other", name: "Оператор 2" } }));
  const login2 = await login(call("/api/auth/login", { body: { email: "b5-other@example.com", password: "parol-b5-other" } }));
  cookie2 = login2.headers.getSetCookie().find((c) => /^better-auth\.session_token=/i.test(c))!.split(";")[0];

  const org1 = (await db.user.findUniqueOrThrow({ where: { email: "b5-op@example.com" } })).organizationId;
  const org2 = (await db.user.findUniqueOrThrow({ where: { email: "b5-other@example.com" } })).organizationId;

  const vk = await db.channelConnection.create({
    data: { organizationId: org1, type: "VK", externalId: "4242", displayName: "Тестовое сообщество", status: "ACTIVE", config: {} },
  });
  vkId = vk.id;
  const telegram = await db.channelConnection.create({
    data: { organizationId: org1, type: "TELEGRAM_BOT", externalId: "111", displayName: "@test_support_bot", status: "ACTIVE" },
  });
  telegramBotId = telegram.id;
  await db.channelConnection.update({
    where: { id: telegram.id },
    data: { config: sealConfig({ mode: "bot", token: "111:AAAAAAAAAAAAAAAAAAAA", botId: "111", webhookSecret: `${telegram.id}.s` }, telegram.id) as unknown as object },
  });
  const facebook = await db.channelConnection.create({
    data: { organizationId: org1, type: "FACEBOOK", externalId: "pg1", displayName: "Страница магазина", status: "ACTIVE" },
  });
  facebookId = facebook.id;
  await db.channelConnection.update({
    where: { id: facebook.id },
    data: { config: sealConfig({ platform: "facebook", pageId: "pg1", pageToken: "page-token" }, facebook.id) as unknown as object },
  });

  const foreign = await db.channelConnection.create({
    data: { organizationId: org2, type: "VK", externalId: "8888", displayName: "Чужое сообщество", status: "ACTIVE" },
  });
  foreignId = foreign.id;

  void vk;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await db.$disconnect();
});

describe("B5: список подключений", () => {
  test("GET /api/channels — только подключения своей организации", async () => {
    const response = await listChannels(new Request("http://localhost:3000/api/channels", { headers: { cookie: cookie1 } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.connections).toHaveLength(3);
    const vk = body.connections.find((c: { id: string }) => c.id === vkId);
    expect(vk).toMatchObject({ type: "VK", status: "ACTIVE", externalName: "Тестовое сообщество" });
    expect(vk.createdAt).toBeDefined();

    const other = await listChannels(new Request("http://localhost:3000/api/channels", { headers: { cookie: cookie2 } }));
    const otherBody = await other.json();
    expect(otherBody.connections).toHaveLength(1);
    expect(otherBody.connections[0].id).toBe(foreignId);
  });

  test("без сессии → 401", async () => {
    const response = await listChannels(new Request("http://localhost:3000/api/channels"));
    expect(response.status).toBe(401);
  });
});

describe("B5: диагностика подключения", () => {
  test("история: последний входящий, последняя попытка отправки, счётчик FAILED", async () => {
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: vkId } });
    const contact = await db.contact.create({
      data: { organizationId: connection.organizationId, connectionId: vkId, externalId: "777" },
    });
    const conversation = await db.conversation.create({
      data: { organizationId: connection.organizationId, connectionId: vkId, contactId: contact.id, externalKey: "4243" },
    });
    const message = await db.message.create({
      data: { organizationId: connection.organizationId, conversationId: conversation.id, direction: "OUT", text: "Исходящее" },
    });
    const job = await db.outboxJob.create({
      data: { organizationId: connection.organizationId, messageId: message.id, type: "VK", status: "FAILED", attempts: 5, lastError: "VK_901" },
    });
    await db.sendAttempt.create({ data: { outboxJobId: job.id, result: "FAILED", detail: "VK_901" } });
    await db.inboundEvent.create({
      data: { organizationId: connection.organizationId, connectionId: vkId, externalEventId: "vk:evt-1", payload: {} },
    });

    const response = await channelStatus(
      new Request(`http://localhost:3000/api/channels/${vkId}/status`, { headers: { cookie: cookie1 } }),
      { params: Promise.resolve({ id: vkId }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      id: vkId,
      type: "VK",
      status: "ACTIVE",
      externalName: "Тестовое сообщество",
      failedJobs: 1,
    });
    expect(body.lastInboundAt).toBeDefined();
    expect(body.lastSend).toMatchObject({ result: "FAILED", detail: "VK_901" });
  });

  test("подключение без истории: нули и null", async () => {
    const response = await channelStatus(
      new Request(`http://localhost:3000/api/channels/${telegramBotId}/status`, { headers: { cookie: cookie1 } }),
      { params: Promise.resolve({ id: telegramBotId }) },
    );
    const body = await response.json();
    expect(body.lastInboundAt).toBeNull();
    expect(body.lastSend).toBeNull();
    expect(body.failedJobs).toBe(0);
  });
});

describe("B5: отключение", () => {
  test("Telegram-бот: deleteWebhook, DISCONNECTED, секреты затёрты", async () => {
    const response = await deleteChannel(
      new Request(`http://localhost:3000/api/channels/${telegramBotId}`, {
        method: "DELETE",
        headers: { cookie: cookie1, origin: "http://localhost:3000" },
      }),
      { params: Promise.resolve({ id: telegramBotId }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "DISCONNECTED" });
    expect(telegramCalls).toContain("deleteWebhook");
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: telegramBotId } });
    expect(connection.status).toBe("DISCONNECTED");
    expect(connection.config).toBeNull();
  });

  test("Meta: секреты затёрты + предлагается флоу удаления данных", async () => {
    const response = await deleteChannel(
      new Request(`http://localhost:3000/api/channels/${facebookId}`, {
        method: "DELETE",
        headers: { cookie: cookie1, origin: "http://localhost:3000" },
      }),
      { params: Promise.resolve({ id: facebookId }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("DISCONNECTED");
    expect(body.dataDeletionUrl).toContain("/api/meta/data-deletion/");
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: facebookId } });
    expect(connection.config).toBeNull();
    expect(String(connection.config)).not.toContain("page-token");

    const code = body.dataDeletionUrl.split("/").pop()!;
    const deletion = await db.metaDeletionRequest.findUniqueOrThrow({ where: { code } });
    expect(deletion.connectionId).toBe(facebookId);
    const page = await deletionPage(
      new Request(body.dataDeletionUrl),
      { params: Promise.resolve({ code }) },
    );
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Подтвердите удаление");
  });

  test("VK: DISCONNECTED, config затёрт; список показывает статус", async () => {
    const response = await deleteChannel(
      new Request(`http://localhost:3000/api/channels/${vkId}`, {
        method: "DELETE",
        headers: { cookie: cookie1, origin: "http://localhost:3000" },
      }),
      { params: Promise.resolve({ id: vkId }) },
    );
    expect(response.status).toBe(200);
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: vkId } });
    expect(connection.status).toBe("DISCONNECTED");
    expect(connection.config).toBeNull();

    const list = await listChannels(new Request("http://localhost:3000/api/channels", { headers: { cookie: cookie1 } }));
    const body = await list.json();
    expect(body.connections.find((c: { id: string }) => c.id === vkId).status).toBe("DISCONNECTED");
  });
});

describe("B5: изоляция тенантов (КП)", () => {
  test("чужое подключение → 404 на status, DELETE и в списке", async () => {
    const status = await channelStatus(
      new Request(`http://localhost:3000/api/channels/${foreignId}/status`, { headers: { cookie: cookie1 } }),
      { params: Promise.resolve({ id: foreignId }) },
    );
    expect(status.status).toBe(404);

    const del = await deleteChannel(
      new Request(`http://localhost:3000/api/channels/${foreignId}`, {
        method: "DELETE",
        headers: { cookie: cookie1, origin: "http://localhost:3000" },
      }),
      { params: Promise.resolve({ id: foreignId }) },
    );
    expect(del.status).toBe(404);
    // чужое подключение не пострадало
    expect((await db.channelConnection.findUniqueOrThrow({ where: { id: foreignId } })).status).toBe("ACTIVE");

    const list = await listChannels(new Request("http://localhost:3000/api/channels", { headers: { cookie: cookie1 } }));
    const body = await list.json();
    expect(body.connections.find((c: { id: string }) => c.id === foreignId)).toBeUndefined();
  });

  test("несуществующий id → 404", async () => {
    const response = await deleteChannel(
      new Request("http://localhost:3000/api/channels/00000000-0000-0000-0000-000000000000", {
        method: "DELETE",
        headers: { cookie: cookie1, origin: "http://localhost:3000" },
      }),
      { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) },
    );
    expect(response.status).toBe(404);
  });
});
