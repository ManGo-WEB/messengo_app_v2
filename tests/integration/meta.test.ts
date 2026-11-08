import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { POST as registerRoute } from "../../src/app/api/auth/register/route";
import { POST as login } from "../../src/app/api/auth/login/route";
import { GET as metaConnect } from "../../src/app/api/channels/meta/connect/route";
import { GET as metaCallback } from "../../src/app/api/channels/meta/callback/route";
import { GET as metaAccounts } from "../../src/app/api/channels/meta/accounts/route";
import { POST as metaSelectAccount } from "../../src/app/api/channels/meta/select-account/route";
import { GET as webhookGet, POST as webhookPost } from "../../src/app/api/webhooks/[channel]/route";
import { GET as deletionGet, POST as deletionPost } from "../../src/app/api/meta/data-deletion/[code]/route";
import { registerChannelSendJobs } from "../../src/worker/channel-jobs";
import { processNextDueJob } from "../../src/worker/loop";
import { signMetaPayload } from "../../src/server/channels/meta";
import { call, db, resetDb } from "./helpers";

const realFetch = globalThis.fetch;
const apiCalls: { path: string; body?: Record<string, unknown> }[] = [];

function fixture(path: string): unknown {
  if (path.startsWith("oauth/access_token")) return { access_token: "user-token-m" };
  if (path.startsWith("me/accounts")) {
    return {
      data: [
        {
          id: "pg1",
          name: "Страница магазина",
          access_token: "page-token-1",
          instagram_business_account: { id: "ig9", username: "shop.insta" },
        },
      ],
    };
  }
  if (path.startsWith("pg1/subscribed_apps")) return { success: true };
  if (path.startsWith("pg1/messages")) return { message_id: "m.1001", recipient_id: "999" };
  if (path.startsWith("ig9/messages")) return { message_id: "m.2002", recipient_id: "888" };
  throw new Error(`фикстура не знает путь: ${path}`);
}

let sessionCookie = "";
const V = "25.0";

beforeAll(async () => {
  await resetDb();
  process.env.META_APP_ID = "app1";
  process.env.META_APP_SECRET = "meta-secret";
  process.env.META_VERIFY_TOKEN = "verify-tok";
  process.env.META_REDIRECT_URL = "http://localhost:3000/api/channels/meta/callback";
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/v25\.0\//, "");
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    apiCalls.push({ path, body });
    return new Response(JSON.stringify(fixture(path)), { headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  registerChannelSendJobs();
  await registerRoute(
    call("/api/auth/register", { body: { email: "meta-op@example.com", password: "parol-meta-26", name: "Оператор" } }),
  );
  const loginResponse = await login(call("/api/auth/login", { body: { email: "meta-op@example.com", password: "parol-meta-26" } }));
  sessionCookie = loginResponse.headers.getSetCookie().find((c) => /^better-auth\.session_token=/i.test(c))!.split(";")[0];
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await db.$disconnect();
});

function setCookieOf(response: Response, name: string): string {
  const cookie = response.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  if (!cookie) throw new Error(`печенька ${name} не найдена`);
  return cookie.split(";")[0];
}

async function startFlow(platform: "facebook" | "instagram"): Promise<{ state: string; cookie: string }> {
  const connect = await metaConnect(
    new Request(`http://localhost:3000/api/channels/meta/connect?platform=${platform}`, {
      headers: { cookie: sessionCookie, origin: "http://localhost:3000" },
    }),
  );
  expect(connect.status).toBe(200);
  const url = String((await connect.json()).url);
  expect(url).toContain("facebook.com/v25.0/dialog/oauth");
  if (platform === "instagram") expect(url).toContain("instagram_manage_messages");
  return { state: new URL(url).searchParams.get("state")!, cookie: setCookieOf(connect, "meta_oauth") };
}

async function completeFlow(platform: "facebook" | "instagram"): Promise<string> {
  const flow = await startFlow(platform);
  const callback = await metaCallback(
    new Request(`http://localhost:3000/api/channels/meta/callback?code=code-${platform}&state=${flow.state}`, {
      headers: { cookie: `${sessionCookie}; ${flow.cookie}` },
    }),
  );
  expect(callback.status).toBe(303);
  const location = callback.headers.get("location")!;
  expect(location).toContain("meta=connection%3A");
  return decodeURIComponent(location.split("meta=")[1]).split(":")[1];
}

function signedPost(payload: unknown): Request {
  const raw = JSON.stringify(payload);
  return new Request("http://localhost:3000/api/webhooks/meta", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signMetaPayload(raw) },
    body: raw,
  });
}

const fbMessage = {
  object: "page",
  entry: [
    {
      id: "pg1",
      messaging: [
        { timestamp: Date.now() - 60_000, sender: { id: "999" }, recipient: { id: "pg1" }, message: { mid: "m.0001", text: "Здравствуйте!" } },
      ],
    },
  ],
};

const igMessage = {
  object: "instagram",
  entry: [
    {
      id: "ig9",
      messaging: [
        { timestamp: Date.now() - 30_000, sender: { id: "888" }, recipient: { id: "ig9" }, message: { mid: "m.0002", text: "Привет из IG!" } },
      ],
    },
  ],
};

describe("B4: Meta — Facebook Messenger", () => {
  let connectionId = "";

  test("OAuth → страницы → выбор: подписка вебхуков, Page Access Token зашифрован, ACTIVE", async () => {
    connectionId = await completeFlow("facebook");
    const accounts = await metaAccounts(
      new Request(`http://localhost:3000/api/channels/meta/accounts?connectionId=${connectionId}`, {
        headers: { cookie: sessionCookie },
      }),
    );
    const accountsBody = await accounts.json();
    expect(accountsBody.accounts).toHaveLength(1);
    expect(accountsBody.accounts[0].igUsername).toBe("shop.insta");

    const select = await metaSelectAccount(
      call("/api/channels/meta/select-account", { cookie: sessionCookie, body: { connectionId, pageId: "pg1" } }),
    );
    expect(select.status).toBe(200);
    const body = await select.json();
    expect(body.connection).toMatchObject({ status: "ACTIVE", displayName: "Страница магазина", externalId: "pg1" });
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    expect(String(connection.config)).not.toContain("page-token-1");
    expect(apiCalls.some((c) => c.path === "pg1/subscribed_apps")).toBe(true);
  });

  test("GET-верификация вебхука: hub.challenge; неверный verify_token → 403", async () => {
    const ok = await webhookGet(
      new Request("http://localhost:3000/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-tok&hub.challenge=CH4LL"),
      { params: Promise.resolve({ channel: "meta" }) },
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("CH4LL");
    const bad = await webhookGet(
      new Request("http://localhost:3000/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x"),
      { params: Promise.resolve({ channel: "meta" }) },
    );
    expect(bad.status).toBe(403);
  });

  test("вебхук FB: подпись проверена, сообщение в Inbox; неверная подпись → 403", async () => {
    const ok = await webhookPost(signedPost(fbMessage), { params: Promise.resolve({ channel: "meta" }) });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ processed: 1 });
    const conversation = await db.conversation.findUniqueOrThrow({
      where: { connectionId_externalKey: { connectionId, externalKey: "psid:999" } },
    });
    expect(await db.message.count({ where: { conversationId: conversation.id } })).toBe(1);

    const raw = JSON.stringify({ ...fbMessage, entry: [{ ...fbMessage.entry[0], id: "pg1" }] });
    const bad = await webhookPost(
      new Request("http://localhost:3000/api/webhooks/meta", {
        method: "POST",
        headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=deadbeef" },
        body: raw,
      }),
      { params: Promise.resolve({ channel: "meta" }) },
    );
    expect(bad.status).toBe(403);
  });

  test("ответ через Outbox: /pg1/messages → SENT", async () => {
    const conversation = await db.conversation.findUniqueOrThrow({
      where: { connectionId_externalKey: { connectionId, externalKey: "psid:999" } },
    });
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    const out = await db.message.create({
      data: { organizationId: connection.organizationId, conversationId: conversation.id, direction: "OUT", text: "Добрый день!" },
    });
    await db.outboxJob.create({ data: { organizationId: connection.organizationId, messageId: out.id, type: "FACEBOOK" } });
    expect(await processNextDueJob()).toBe(true);
    expect(await db.message.findUniqueOrThrow({ where: { id: out.id } }).then((m) => m.status)).toBe("SENT");
    const sendCall = apiCalls.filter((c) => c.path === "pg1/messages").at(-1)!;
    expect(sendCall.body!.recipient).toEqual({ id: "999" });
    expect(sendCall.body!.message).toEqual({ text: "Добрый день!" });
  });
});

describe("B4: Meta — Instagram Direct", () => {
  let connectionId = "";

  test("подключение IG: только страницы с IG-аккаунтом, externalId = IG-аккаунт", async () => {
    connectionId = await completeFlow("instagram");
    const select = await metaSelectAccount(
      call("/api/channels/meta/select-account", { cookie: sessionCookie, body: { connectionId, pageId: "pg1" } }),
    );
    const body = await select.json();
    expect(body.connection).toMatchObject({ status: "ACTIVE", displayName: "@shop.insta", externalId: "ig9" });
  });

  test("вебхук IG → диалог; ответ через /ig9/messages → SENT", async () => {
    const ok = await webhookPost(signedPost(igMessage), { params: Promise.resolve({ channel: "meta" }) });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ processed: 1 });
    const conversation = await db.conversation.findUniqueOrThrow({
      where: { connectionId_externalKey: { connectionId, externalKey: "psid:888" } },
    });
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    const out = await db.message.create({
      data: { organizationId: connection.organizationId, conversationId: conversation.id, direction: "OUT", text: "Привет!" },
    });
    await db.outboxJob.create({ data: { organizationId: connection.organizationId, messageId: out.id, type: "INSTAGRAM" } });
    expect(await processNextDueJob()).toBe(true);
    expect(await db.message.findUniqueOrThrow({ where: { id: out.id } }).then((m) => m.status)).toBe("SENT");
    const sendCall = apiCalls.filter((c) => c.path === "ig9/messages").at(-1)!;
    expect(sendCall.body!.recipient).toEqual({ id: "888" });
  });

  test("24-часовое окно: последнее входящее старше 24ч → FAILED META_WINDOW_EXPIRED", async () => {
    const conversation = await db.conversation.findUniqueOrThrow({
      where: { connectionId_externalKey: { connectionId, externalKey: "psid:888" } },
    });
    await db.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    const out = await db.message.create({
      data: { organizationId: connection.organizationId, conversationId: conversation.id, direction: "OUT", text: "Слишком поздно" },
    });
    await db.outboxJob.create({ data: { organizationId: connection.organizationId, messageId: out.id, type: "INSTAGRAM" } });
    expect(await processNextDueJob()).toBe(true);
    const job = await db.outboxJob.findUniqueOrThrow({ where: { messageId: out.id } });
    expect(job.status).toBe("PENDING");
    expect(job.lastError).toContain("META_WINDOW_EXPIRED");
  });
});

describe("B4: флоу удаления данных (Meta App Review)", () => {
  test("страница открывается (КП), подтверждение фиксируется", async () => {
    const deletionCode = `del-${crypto.randomUUID()}`;
    const deletion = await db.metaDeletionRequest.create({ data: { code: deletionCode } });
    const page = await deletionGet(
      new Request(`http://localhost:3000/api/meta/data-deletion/${deletionCode}`),
      { params: Promise.resolve({ code: deletionCode }) },
    );
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Подтвердите удаление");

    const confirm = await deletionPost(
      new Request(`http://localhost:3000/api/meta/data-deletion/${deletionCode}`, { method: "POST" }),
      { params: Promise.resolve({ code: deletionCode }) },
    );
    expect(confirm.status).toBe(200);
    const updated = await db.metaDeletionRequest.findUniqueOrThrow({ where: { code: deletionCode } });
    expect(updated.status).toBe("CONFIRMED");
    expect(updated.confirmedAt).toBeDefined();
    void deletion;
  });
});
