import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { POST as registerRoute } from "../../src/app/api/auth/register/route";
import { POST as login } from "../../src/app/api/auth/login/route";
import { POST as connectPersonal } from "../../src/app/api/channels/telegram-personal/connect/route";
import { GET as personalStatus } from "../../src/app/api/channels/telegram-personal/[id]/status/route";
import { POST as webhook } from "../../src/app/api/webhooks/[channel]/route";
import { registerChannelSendJobs } from "../../src/worker/channel-jobs";
import { processNextDueJob } from "../../src/worker/loop";
import { openConfig, sealConfig } from "../../src/server/secrets/store";
import { telegramPersonalAdapter } from "../../src/server/channels/telegram-personal";
import { call, db, resetDb } from "./helpers";

const realFetch = globalThis.fetch;
const apiCalls: { method: string; body: Record<string, unknown> }[] = [];
const SERVICE_TOKEN = "999:SECRETARY_TOKEN_AAAAAAAA";

function fixture(method: string): unknown {
  switch (method) {
    case "getMe":
      return { id: 999, is_bot: true, username: "messengo_secretary_bot", first_name: "Messengo Secretary" };
    case "setWebhook":
      return true;
    case "sendMessage":
      return { message_id: 888, chat: { id: 0 } };
    default:
      throw new Error(`фикстура не знает метод ${method}`);
  }
}

let sessionCookie = "";
let connectionId = "";
let deeplink = "";
let webhookSecret = "";
const businessConnectionId = "bc-12345";

beforeAll(async () => {
  await resetDb();
  process.env.TELEGRAM_PERSONAL_BOT_TOKEN = SERVICE_TOKEN;
  delete process.env.TELEGRAM_PERSONAL_WEBHOOK_URL;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = url.split("/").pop()!;
    const params = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    apiCalls.push({ method, body: params });
    return new Response(JSON.stringify({ ok: true, result: fixture(method) }), {
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  registerChannelSendJobs();
  await registerRoute(
    call("/api/auth/register", { body: { email: "sec-op@example.com", password: "parol-sec-2026", name: "Секретарь" } }),
  );
  const loginResponse = await login(call("/api/auth/login", { body: { email: "sec-op@example.com", password: "parol-sec-2026" } }));
  sessionCookie = loginResponse.headers.getSetCookie().find((c) => /^better-auth\.session_token=/i.test(c))!.split(";")[0];
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await db.$disconnect();
});

function postUpdate(body: unknown, secret = webhookSecret): Promise<Response> {
  return webhook(
    new Request("http://localhost:3000/api/webhooks/telegram", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": secret,
        origin: "http://localhost:3000",
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ channel: "telegram" }) },
  );
}

function businessMessage(updateId: number, fromId: number, firstName: string, text: string) {
  return {
    update_id: updateId,
    business_message: {
      message_id: 900 + updateId,
      date: 1762579600 + updateId,
      text,
      business_connection_id: businessConnectionId,
      chat: { id: fromId, type: "private" },
      from: { id: fromId, first_name: firstName, is_bot: false },
    },
  };
}

describe("B3: Telegram личный (Secretary Mode)", () => {
  test("connect: deeplink служебного бота + setWebhook, подключение PENDING", async () => {
    const response = await connectPersonal(
      call("/api/channels/telegram-personal/connect", { cookie: sessionCookie, body: {} }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.deeplink).toMatch(/^https:\/\/t\.me\/messengo_secretary_bot\?start=/);
    expect(body.expiresAt).toBeDefined();
    connectionId = body.connectionId;
    deeplink = body.deeplink;

    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection.status).toBe("PENDING");
    const config = openConfig(connection) as { webhookSecret: string; proofNonce: string };
    expect(config.proofNonce.startsWith(`${connectionId}.`)).toBe(true);
    webhookSecret = config.webhookSecret;
    const setWebhookCall = apiCalls.find((c) => c.method === "setWebhook")!;
    expect(setWebhookCall.body.secret_token).toBe(webhookSecret);
    expect(String(setWebhookCall.body.url)).toContain("/api/webhooks/telegram");
  });

  test("owner-proof: /start <nonce> привязывает владельца; чужой nonce → 403", async () => {
    const nonce = deeplink.split("start=")[1];
    const ok = await postUpdate({
      update_id: 1,
      message: { message_id: 1, date: 1762579500, text: `/start ${nonce}`, chat: { id: 555, type: "private" }, from: { id: 555, first_name: "Владелец" } },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, stage: "owner_linked" });

    const wrong = await postUpdate({
      update_id: 2,
      message: { message_id: 2, date: 1762579501, text: "/start bogus.nonce", chat: { id: 555, type: "private" }, from: { id: 555, first_name: "Владелец" } },
    });
    // чужой nonce не резолвится: диспетчер отдаёт 403 первого резолвера (безопасно)
    expect(wrong.status).toBe(403);
  });

  test("business_connection: владелец совпал → ACTIVE; статус отдаёт ownerLinked/businessLinked", async () => {
    const response = await postUpdate({
      update_id: 3,
      business_connection: { id: businessConnectionId, enabled: true, user: { id: 555, is_bot: false } },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, stage: "business_linked" });

    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection.status).toBe("ACTIVE");
    expect(connection.externalId).toBe("555");

    const status = await personalStatus(
      new Request(`http://localhost:3000/api/channels/telegram-personal/${connectionId}/status`, {
        headers: { cookie: sessionCookie },
      }),
      { params: Promise.resolve({ id: connectionId }) },
    );
    expect(await status.json()).toMatchObject({ status: "ACTIVE", ownerLinked: true, businessLinked: true });

    // business_connection от чужого пользователя → 403
    const foreign = await postUpdate({
      update_id: 4,
      business_connection: { id: "bc-other", enabled: true, user: { id: 777777, is_bot: false } },
    });
    expect(foreign.status).toBe(403);
  });

  test("КП: два разных собеседника → два разных диалога", async () => {
    const first = await postUpdate(businessMessage(10, 111, "Мария", "Добрый день!"));
    const second = await postUpdate(businessMessage(11, 222, "Павел", "Здравствуйте, есть вопрос"));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const maria = await db.conversation.findUniqueOrThrow({
      where: { connectionId_externalKey: { connectionId, externalKey: "peer:111" } },
    });
    const pavel = await db.conversation.findUniqueOrThrow({
      where: { connectionId_externalKey: { connectionId, externalKey: "peer:222" } },
    });
    expect(maria.id).not.toBe(pavel.id);
    const mariaContact = await db.contact.findUniqueOrThrow({
      where: { connectionId_externalId: { connectionId, externalId: "111" } },
    });
    expect(mariaContact.name).toBe("Мария");
    const counts = await Promise.all([
      db.message.count({ where: { conversationId: maria.id } }),
      db.message.count({ where: { conversationId: pavel.id } }),
    ]);
    expect(counts).toEqual([1, 1]);
  });

  test("ответ через Outbox: sendMessage с business_connection_id → SENT", async () => {
    const maria = await db.conversation.findUniqueOrThrow({
      where: { connectionId_externalKey: { connectionId, externalKey: "peer:111" } },
    });
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    const out = await db.message.create({
      data: { organizationId: connection.organizationId, conversationId: maria.id, direction: "OUT", text: "Здравствуйте, Мария!" },
    });
    await db.outboxJob.create({ data: { organizationId: connection.organizationId, messageId: out.id, type: "TELEGRAM_PERSONAL" } });
    expect(await processNextDueJob()).toBe(true);
    expect(await db.message.findUniqueOrThrow({ where: { id: out.id } }).then((m) => m.status)).toBe("SENT");
    const sendCall = apiCalls.filter((c) => c.method === "sendMessage").at(-1)!;
    expect(sendCall.body.business_connection_id).toBe(businessConnectionId);
    expect(sendCall.body.chat_id).toBe(111);
  });

  test("без business-привязки sendMessage → FAILED TELEGRAM_NOT_BOUND", async () => {
    const organization = await db.organization.create({ data: { name: "no-biz" } });
    const created = await db.channelConnection.create({
      data: { organizationId: organization.id, type: "TELEGRAM_PERSONAL", externalId: "pending", status: "ACTIVE" },
    });
    const config = { serviceBotId: "999", webhookSecret: "x", ownerUserId: "1" };
    await db.channelConnection.update({
      where: { id: created.id },
      data: { config: sealConfig(config, created.id) as unknown as object },
    });
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: created.id } });
    const result = await telegramPersonalAdapter.sendMessage(connection, "текст", { conversationKey: "peer:1" });
    expect(result).toEqual({ status: "FAILED", error: "TELEGRAM_NOT_BOUND" });
    await db.organization.delete({ where: { id: organization.id } });
  });
});
