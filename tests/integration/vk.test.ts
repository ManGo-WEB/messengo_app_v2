import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { POST as register } from "../../src/app/api/auth/register/route";
import { POST as login } from "../../src/app/api/auth/login/route";
import { GET as vkConnect } from "../../src/app/api/channels/vk/connect/route";
import { GET as vkCallback } from "../../src/app/api/channels/vk/callback/route";
import { GET as vkCommunities } from "../../src/app/api/channels/vk/communities/route";
import { POST as vkSelectCommunity } from "../../src/app/api/channels/vk/select-community/route";
import { POST as webhook } from "../../src/app/api/webhooks/[channel]/route";
import { registerChannelSendJobs } from "../../src/worker/channel-jobs";
import { processNextDueJob } from "../../src/worker/loop";
import { openConfig } from "../../src/server/secrets/store";
import { call, db, resetDb } from "./helpers";

// Фикстуры VK API: подменяем глобальный fetch маршрутизатором ответов.
const realFetch = globalThis.fetch;
const calls: string[] = [];
let callbackSecretValue = "";

function setCookieOf(response: Response, name: string): string {
  const cookie = response.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  if (!cookie) throw new Error(`печенька ${name} не найдена`);
  return cookie.split(";")[0];
}

function vkFixtureRouter(url: string, init?: RequestInit): Response {
  const bodyText = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : "";
  calls.push(url + (bodyText ? `?${bodyText}` : ""));
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  if (url.startsWith("https://id.vk.ru/oauth2/auth")) return json({ access_token: "user-token-1" });
  if (url.startsWith("https://oauth.vk.com/access_token")) return json({ access_token: "community-token-1" });
  // специфические методы — раньше общих (groups.get ловит и groups.getCallback…)
  if (url.includes("/method/groups.getTokenPermissions")) {
    return json({ response: { permissions: [{ name: "messages", setting: 1 }] } });
  }
  if (url.includes("/method/groups.getCallbackConfirmationCode")) {
    return json({ response: { code: "conf42" } });
  }
  if (url.includes("/method/groups.addCallbackServer")) {
    return json({ response: { server_id: 7 } });
  }
  if (url.includes("/method/groups.setCallbackSettings")) {
    return json({ response: { ok: 1 } });
  }
  if (url.includes("/method/messages.send")) {
    return json({ response: 555 });
  }
  if (url.includes("/method/groups.get")) {
    return json({ response: { count: 1, items: [{ id: 4242, name: "Тестовое сообщество" }] } });
  }
  throw new Error(`фикстура не знает адрес: ${url}`);
}

let sessionCookie = "";

beforeAll(async () => {
  await resetDb();
  process.env.VK_APP_ID = "12345";
  process.env.VK_APP_SECRET = "app-secret";
  process.env.VK_REDIRECT_URL = "http://localhost:3000/api/channels/vk/callback";
  process.env.VK_WEBHOOK_URL = "http://localhost:3000/api/webhooks/vk";
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    vkFixtureRouter(String(input), init)) as unknown as typeof fetch;
  registerChannelSendJobs();
  await register(
    call("/api/auth/register", { body: { email: "vk-op@example.com", password: "parol-vk-2026", name: "Оператор" } }),
  );
  const loginResponse = await login(call("/api/auth/login", { body: { email: "vk-op@example.com", password: "parol-vk-2026" } }));
  sessionCookie = loginResponse.headers.getSetCookie().find((c) => /^better-auth\.session_token=/i.test(c))!.split(";")[0];
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await db.$disconnect();
});

describe("B1: полный цикл ВКонтакте на фикстурах", () => {
  let connectionId = "";
  let oauthCookie = "";

  test("connect → ссылка id.vk.ru/authorize с PKCE", async () => {
    const response = await vkConnect(call("/api/channels/vk/connect", { cookie: sessionCookie }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(String(body.url)).toMatch(/^https:\/\/id\.vk\.ru\/authorize\?/);
    expect(String(body.url)).toContain("code_challenge_method=s256");
    oauthCookie = setCookieOf(response, "vk_oauth");
  });

  test("callback (user) → PENDING-подключение с зашифрованным user-token", async () => {
    const cookieValue = JSON.parse(Buffer.from(oauthCookie.slice("vk_oauth=".length), "base64url").toString()) as { state: string };
    const response = await vkCallback(
      new Request("http://localhost:3000/api/channels/vk/callback?code=user-code&state=" + cookieValue.state + "&device_id=device-1", {
        headers: { cookie: `${sessionCookie}; ${oauthCookie}` },
      }),
    );
    expect(response.status).toBe(303);
    const location = response.headers.get("location")!;
    expect(location).toContain("vk=connection%3A");
    connectionId = decodeURIComponent(location.split("vk=")[1]).split(":")[1];
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection.status).toBe("PENDING");
    expect(String(connection.config)).not.toContain("user-token-1");
  });

  test("communities → список сообществ администратора", async () => {
    const response = await vkCommunities(
      new Request(`http://localhost:3000/api/channels/vk/communities?connectionId=${connectionId}`, {
        headers: { cookie: sessionCookie },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [{ id: 4242, name: "Тестовое сообщество" }],
      nextOffset: null,
    });
  });

  test("select-community → ссылка oauth.vk.com; callback (community) → ACTIVE с зашифрованным конфигом", async () => {
    const select = await vkSelectCommunity(
      call("/api/channels/vk/select-community", {
        cookie: sessionCookie,
        body: { connectionId, groupId: 4242, senderName: "Оператор Мессенджо" },
      }),
    );
    expect(select.status).toBe(200);
    const body = await select.json();
    expect(String(body.url)).toMatch(/^https:\/\/oauth\.vk\.com\/authorize\?/);
    expect(String(body.url)).toContain("group_ids=4242");
    oauthCookie = setCookieOf(select, "vk_oauth");
    const cookieValue = JSON.parse(Buffer.from(oauthCookie.slice("vk_oauth=".length), "base64url").toString()) as { state: string };

    const callback = await vkCallback(
      new Request("http://localhost:3000/api/channels/vk/callback?code=community-code&state=" + cookieValue.state, {
        headers: { cookie: `${sessionCookie}; ${oauthCookie}` },
      }),
    );
    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toContain("vk=connected");

    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(connection.status).toBe("ACTIVE");
    expect(connection.externalId).toBe("4242");
    expect(connection.displayName).toBe("Тестовое сообщество");
    const config = String(connection.config);
    expect(config).not.toContain("community-token-1");
    expect(config.startsWith("v1.")).toBe(true);
    const opened = openConfig(connection) as { callbackSecret: string; confirmationCode: string; senderName?: string };
    expect(opened.confirmationCode).toBe("conf42");
    expect(opened.senderName).toBe("Оператор Мессенджо");
    callbackSecretValue = opened.callbackSecret;
    expect(calls.some((c) => c.includes("groups.addCallbackServer") && c.includes("secret_key="))).toBe(true);
  });

  test("вебхук confirmation отвечает строкой подтверждения", async () => {
    const response = await webhook(
      call("/api/webhooks/vk", { body: { type: "confirmation", group_id: 4242 } }),
      { params: Promise.resolve({ channel: "vk" }) },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("conf42");
  });

  test("вебхук message_new → контакт, диалог, сообщение в Inbox", async () => {
    const response = await webhook(
      call("/api/webhooks/vk", {
        body: {
          type: "message_new",
          group_id: 4242,
          event_id: "evt-vk-1",
          secret: callbackSecretValue,
          object: { message: { peer_id: 4243, from_id: 777, date: 1762579200, text: "Здравствуйте!", conversation_message_id: 11 } },
        },
      }),
      { params: Promise.resolve({ channel: "vk" }) },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    const conversation = await db.conversation.findUniqueOrThrow({
      where: { connectionId_externalKey: { connectionId, externalKey: "4243" } },
    });
    expect(conversation.threadTitle).toBeNull();
    const contact = await db.contact.findUniqueOrThrow({
      where: { connectionId_externalId: { connectionId, externalId: "777" } },
    });
    expect(conversation.contactId).toBe(contact.id);
    const messages = await db.message.findMany({ where: { conversationId: conversation.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ direction: "IN", status: "RECEIVED", text: "Здравствуйте!", externalId: "vk:evt-vk-1" });
  });

  test("вебхук с неверным секретом → 403", async () => {
    const response = await webhook(
      call("/api/webhooks/vk", {
        body: { type: "message_new", group_id: 4242, event_id: "evt-vk-2", secret: "wrong-secret", object: { message: { peer_id: 4243, from_id: 777, date: 1762579200, text: "x", conversation_message_id: 12 } } },
      }),
      { params: Promise.resolve({ channel: "vk" }) },
    );
    expect(response.status).toBe(403);
    expect(await db.message.count({ where: { conversation: { connectionId } } })).toBe(1);
  });

  test("ответ через Outbox: воркер берёт VK-адаптер из реестра → SENT", async () => {
    const conversation = await db.conversation.findUniqueOrThrow({
      where: { connectionId_externalKey: { connectionId, externalKey: "4243" } },
    });
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    const outMessage = await db.message.create({
      data: { organizationId: connection.organizationId, conversationId: conversation.id, direction: "OUT", text: "Ответ оператора" },
    });
    await db.outboxJob.create({ data: { organizationId: connection.organizationId, messageId: outMessage.id, type: "VK" } });

    expect(await processNextDueJob()).toBe(true);
    expect(await db.message.findUniqueOrThrow({ where: { id: outMessage.id } }).then((m) => m.status)).toBe("SENT");
    const attempts = await db.sendAttempt.findMany({ where: { outboxJob: { messageId: outMessage.id } } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].result).toBe("SENT");
    expect(attempts[0].detail).toContain("send:555");
    const sendCall = calls.filter((c) => c.includes("messages.send")).at(-1)!;
    expect(sendCall).toContain("peer_id=4243");
    expect(sendCall).toContain("sender=");
  });
});
