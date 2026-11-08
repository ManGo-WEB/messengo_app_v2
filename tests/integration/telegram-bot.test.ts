import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { POST as registerRoute } from "../../src/app/api/auth/register/route";
import { POST as login } from "../../src/app/api/auth/login/route";
import { POST as connectBot } from "../../src/app/api/channels/telegram-bot/connect/route";
import { DELETE as disconnectBot } from "../../src/app/api/channels/telegram-bot/[id]/route";
import { POST as webhook } from "../../src/app/api/webhooks/[channel]/route";
import { registerChannelSendJobs } from "../../src/worker/channel-jobs";
import { processNextDueJob } from "../../src/worker/loop";
import { openConfig } from "../../src/server/secrets/store";
import { call, db, resetDb } from "./helpers";

// Фикстуры Bot API: подменяем глобальный fetch.
const realFetch = globalThis.fetch;
const apiCalls: { method: string; body: Record<string, unknown> }[] = [];

function fixture(method: string, params: Record<string, unknown>): unknown {
  switch (method) {
    case "getMe":
      return { id: 111, is_bot: true, username: "test_support_bot", first_name: "ТестБот" };
    case "getChat":
      if (params.chat_id === "@news") {
        return { type: "channel", id: -1001, title: "Новости магазина", linked_chat_id: -1002 };
      }
      return { type: "supergroup", id: -1002, linked_chat_id: -1001, title: "Обсуждение" };
    case "getChatMember":
      return { status: "administrator", can_post_messages: true, user: { id: 111 } };
    case "setWebhook":
    case "deleteWebhook":
      return true;
    case "sendMessage":
      return { message_id: 777, chat: { id: params.chat_id } };
    default:
      throw new Error(`фикстура не знает метод ${method}`);
  }
}

let sessionCookie = "";

beforeAll(async () => {
  await resetDb();
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = url.split("/").pop()!;
    const params = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    apiCalls.push({ method, body: params });
    return new Response(JSON.stringify({ ok: true, result: fixture(method, params) }), {
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  registerChannelSendJobs();
  await registerRoute(
    call("/api/auth/register", { body: { email: "tg-op@example.com", password: "parol-tg-2026", name: "Оператор" } }),
  );
  const loginResponse = await login(call("/api/auth/login", { body: { email: "tg-op@example.com", password: "parol-tg-2026" } }));
  sessionCookie = loginResponse.headers.getSetCookie().find((c) => /^better-auth\.session_token=/i.test(c))!.split(";")[0];
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await db.$disconnect();
});

function dmUpdate(updateId: number, text: string) {
  return {
    update_id: updateId,
    message: { message_id: 500 + updateId, date: 1762579300 + updateId, text, chat: { id: 222, type: "private" }, from: { id: 222, first_name: "Анна", last_name: "Иванова" } },
  };
}

async function post(channel: string, body: unknown, secret: string): Promise<Response> {
  return webhook(
    new Request("http://localhost:3000/api/webhooks/telegram", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret, origin: "http://localhost:3000" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ channel }) },
  );
}

describe("B2: Telegram-бот — личка", () => {
  let connectionId = "";
  let secret = "";

  test("подключение по токену: getMe + setWebhook → ACTIVE, секрет в конфиге", async () => {
    const response = await connectBot(
      call("/api/channels/telegram-bot/connect", { cookie: sessionCookie, body: { token: "111:AAAAAAAAAAAAAAAAAAAA" } }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.connection.status).toBe("ACTIVE");
    expect(body.connection.displayName).toBe("@test_support_bot");
    connectionId = body.connection.id;

    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection.externalId).toBe("111");
    const config = openConfig(connection) as { webhookSecret: string; mode: string };
    expect(config.mode).toBe("bot");
    expect(config.webhookSecret.startsWith(`${connectionId}.`)).toBe(true);
    secret = config.webhookSecret;
    const setWebhookCall = apiCalls.find((c) => c.method === "setWebhook")!;
    expect(setWebhookCall.body.secret_token).toBe(secret);
    expect(String(setWebhookCall.body.url)).toContain("/api/webhooks/telegram");
  });

  test("некорректный токен → 400 TELEGRAM_INVALID_TOKEN", async () => {
    const response = await connectBot(
      call("/api/channels/telegram-bot/connect", { cookie: sessionCookie, body: { token: "not-a-token" } }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "TELEGRAM_INVALID_TOKEN" });
  });

  test("вебхук: личное сообщение → диалог в Inbox; неверный секрет → 403", async () => {
    const ok = await post("telegram", dmUpdate(1, "Здравствуйте!"), secret);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    const conversation = await db.conversation.findUniqueOrThrow({
      where: { connectionId_externalKey: { connectionId, externalKey: "dm:222" } },
    });
    const contact = await db.contact.findUniqueOrThrow({
      where: { connectionId_externalId: { connectionId, externalId: "222" } },
    });
    expect(contact.name).toBe("Анна Иванова");
    const messages = await db.message.findMany({ where: { conversationId: conversation.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ direction: "IN", status: "RECEIVED", externalId: "telegram:1" });

    const forbidden = await post("telegram", dmUpdate(2, "x"), "bogus.secret-value-1234567890");
    expect(forbidden.status).toBe(403);
  });

  test("ответ через Outbox: sendMessage в чат 222 → SENT", async () => {
    const conversation = await db.conversation.findUniqueOrThrow({
      where: { connectionId_externalKey: { connectionId, externalKey: "dm:222" } },
    });
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    const out = await db.message.create({
      data: { organizationId: connection.organizationId, conversationId: conversation.id, direction: "OUT", text: "Ответ бота" },
    });
    await db.outboxJob.create({ data: { organizationId: connection.organizationId, messageId: out.id, type: "TELEGRAM_BOT" } });
    expect(await processNextDueJob()).toBe(true);
    expect(await db.message.findUniqueOrThrow({ where: { id: out.id } }).then((m) => m.status)).toBe("SENT");
    const sendCall = apiCalls.filter((c) => c.method === "sendMessage").at(-1)!;
    expect(sendCall.body.chat_id).toBe(222);
    expect(sendCall.body.reply_parameters).toBeUndefined();
  });

  test("отключение: deleteWebhook, DISCONNECTED, секреты затёрты", async () => {
    const response = await disconnectBot(
      new Request(`http://localhost:3000/api/channels/telegram-bot/${connectionId}`, {
        method: "DELETE",
        headers: { cookie: sessionCookie, origin: "http://localhost:3000" },
      }),
      { params: Promise.resolve({ id: connectionId }) },
    );
    expect(response.status).toBe(200);
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection.status).toBe("DISCONNECTED");
    expect(connection.config).toBeNull();
    expect(apiCalls.some((c) => c.method === "deleteWebhook")).toBe(true);
  });
});

describe("B2: Telegram-бот — канал с комментариями", () => {
  let connectionId = "";
  let secret = "";

  test("подключение с каналом: getChat/linked_chat_id/права админа", async () => {
    const response = await connectBot(
      call("/api/channels/telegram-bot/connect", {
        cookie: sessionCookie,
        body: { token: "111:AAAAAAAAAAAAAAAAAAAA", channelUsername: "@news" },
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.connection.displayName).toBe("Новости магазина");
    connectionId = body.connection.id;
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    const config = openConfig(connection) as { mode: string; channelId: string; discussionId: string; webhookSecret: string };
    expect(config.mode).toBe("channel");
    expect(config.channelId).toBe("-1001");
    expect(config.discussionId).toBe("-1002");
    secret = config.webhookSecret;
  });

  test("пост канала создаёт ветку; комментарий падает в ту же ветку", async () => {
    const postUpdate = {
      update_id: 10,
      channel_post: { message_id: 55, date: 1762579400, text: "Новый пост о распродаже", chat: { id: -1001 }, sender_chat: { id: -1001 } },
    };
    const postResponse = await post("telegram", postUpdate, secret);
    expect(postResponse.status).toBe(200);
    const conversation = await db.conversation.findUniqueOrThrow({
      where: { connectionId_externalKey: { connectionId, externalKey: "post:55" } },
    });
    expect(conversation.threadTitle).toBe("Новый пост о распродаже");

    const commentUpdate = {
      update_id: 11,
      message: {
        message_id: 56,
        date: 1762579500,
        text: "Отличный пост!",
        chat: { id: -1002 },
        from: { id: 333, first_name: "Пётр" },
        is_automatic_forward: true,
        author_signature: "Пётр Смирнов",
        forward_origin: { type: "channel", chat: { id: -1001 }, message_id: 55 },
      },
    };
    const commentResponse = await post("telegram", commentUpdate, secret);
    expect(commentResponse.status).toBe(200);
    const messages = await db.message.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "asc" } });
    expect(messages).toHaveLength(2);
    expect(messages[1].text).toBe("Отличный пост!");
    const contact = await db.contact.findUniqueOrThrow({
      where: { connectionId_externalId: { connectionId, externalId: "chat:-1002" } },
    });
    expect(contact.name).toBe("Пётр Смирнов");
  });

  test("ответ-комментарий: sendMessage с reply_parameters на пост → SENT", async () => {
    const conversation = await db.conversation.findUniqueOrThrow({
      where: { connectionId_externalKey: { connectionId, externalKey: "post:55" } },
    });
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    const out = await db.message.create({
      data: { organizationId: connection.organizationId, conversationId: conversation.id, direction: "OUT", text: "Спасибо за отзыв!" },
    });
    await db.outboxJob.create({ data: { organizationId: connection.organizationId, messageId: out.id, type: "TELEGRAM_BOT" } });
    expect(await processNextDueJob()).toBe(true);
    expect(await db.message.findUniqueOrThrow({ where: { id: out.id } }).then((m) => m.status)).toBe("SENT");
    const sendCall = apiCalls.filter((c) => c.method === "sendMessage").at(-1)!;
    expect(sendCall.body.chat_id).toBe(-1002);
    expect(sendCall.body.reply_parameters).toMatchObject({ message_id: 55 });
  });
});
