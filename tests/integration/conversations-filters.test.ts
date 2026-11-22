// Список диалогов (план D2 п.4): фильтры по каналу/статусу, поиск по имени
// контакта, пагинация, превью последнего сообщения, изоляция тенантов.
import { beforeAll, describe, expect, test } from "bun:test";
import { POST as registerRoute } from "../../src/app/api/auth/register/route";
import { POST as loginRoute } from "../../src/app/api/auth/login/route";
import { GET as listConversations } from "../../src/app/api/conversations/route";
import { GET as getConversation } from "../../src/app/api/conversations/[id]/route";
import { call, db, resetDb } from "./helpers";

let cookie1 = "";
let cookie2 = "";
let vkAwaiting = "";
let vkReplied = "";
let tgAwaiting = "";

async function createConversation(
  orgId: string,
  connectionId: string,
  contactExternalId: string,
  contactName: string | null,
  messages: Array<{ direction: "IN" | "OUT"; text: string; minutesAgo: number }>,
) {
  const contact = await db.contact.create({
    data: { organizationId: orgId, connectionId, externalId: contactExternalId, name: contactName },
  });
  const conversation = await db.conversation.create({
    data: { organizationId: orgId, connectionId, contactId: contact.id, externalKey: contactExternalId },
  });
  let last: { text: string; direction: string; createdAt: Date } | null = null;
  for (const message of messages) {
    const createdAt = new Date(Date.now() - message.minutesAgo * 60_000);
    await db.message.create({
      data: {
        organizationId: orgId,
        conversationId: conversation.id,
        direction: message.direction,
        text: message.text,
        status: message.direction === "IN" ? "RECEIVED" : "SENT",
        createdAt,
      },
    });
    last = { text: message.text, direction: message.direction, createdAt };
    await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: createdAt } });
  }
  return { conversation, last };
}

beforeAll(async () => {
  await resetDb();
  await registerRoute(call("/api/auth/register", { body: { email: "d2-list@example.com", password: "parol-d2-2026", name: "Оператор" } }));
  const login1 = await loginRoute(call("/api/auth/login", { body: { email: "d2-list@example.com", password: "parol-d2-2026" } }));
  cookie1 = login1.headers.getSetCookie().find((c) => /^better-auth\.session_token=/i.test(c))!.split(";")[0];
  await registerRoute(call("/api/auth/register", { body: { email: "d2-list2@example.com", password: "parol-d2-2026", name: "Чужой" } }));
  const login2 = await loginRoute(call("/api/auth/login", { body: { email: "d2-list2@example.com", password: "parol-d2-2026" } }));
  cookie2 = login2.headers.getSetCookie().find((c) => /^better-auth\.session_token=/i.test(c))!.split(";")[0];

  const org1 = (await db.user.findUniqueOrThrow({ where: { email: "d2-list@example.com" } })).organizationId;
  const org2 = (await db.user.findUniqueOrThrow({ where: { email: "d2-list2@example.com" } })).organizationId;
  const vk = await db.channelConnection.create({ data: { organizationId: org1, type: "VK", externalId: "vk1", status: "ACTIVE", displayName: "Сообщество" } });
  const tg = await db.channelConnection.create({ data: { organizationId: org1, type: "TELEGRAM_BOT", externalId: "tg1", status: "ACTIVE", displayName: "@bot" } });
  const testing = await db.channelConnection.create({ data: { organizationId: org1, type: "TESTING", externalId: "t1", status: "ACTIVE" } });
  await db.channelConnection.create({ data: { organizationId: org2, type: "TESTING", externalId: "other", status: "ACTIVE" } });

  const awaiting = await createConversation(org1, vk.id, "vk-client-1", "Анна Смирнова", [
    { direction: "IN", text: "Здравствуйте! Хочу заказать дизайн", minutesAgo: 30 },
  ]);
  vkAwaiting = awaiting.conversation.id;
  const replied = await createConversation(org1, vk.id, "vk-client-2", "Борис Козлов", [
    { direction: "IN", text: "Есть вопрос", minutesAgo: 60 },
    { direction: "OUT", text: "Здравствуйте! Слушаю вас", minutesAgo: 50 },
  ]);
  vkReplied = replied.conversation.id;
  const tgAwaitingConv = await createConversation(org1, tg.id, "tg-client-1", "Максим Петров", [
    { direction: "IN", text: "Привет, это Telegram", minutesAgo: 20 },
  ]);
  tgAwaiting = tgAwaitingConv.conversation.id;
  await createConversation(org1, testing.id, "cust-empty", null, []);
});

function list(cookie: string, query = "") {
  return listConversations(call(`/api/conversations${query}`, { cookie }));
}

describe("GET /api/conversations: фильтры и пагинация", () => {
  test("без фильтров: все диалоги организации с превью последнего сообщения", async () => {
    const response = await list(cookie1);
    expect(response.status).toBe(200);
    const data = (await response.json()) as { total: number; conversations: Array<{ id: string; lastMessage: { text: string } | null }> };
    expect(data.total).toBe(4);
    expect(data.conversations).toHaveLength(4);
    // Пустой диалог (без сообщений) — с lastMessage: null
    const empty = data.conversations.find((c) => c.lastMessage === null);
    expect(empty).toBeDefined();
    // Превью — последнее по времени
    const vkA = data.conversations.find((c) => c.id === vkAwaiting);
    expect(vkA?.lastMessage?.text).toBe("Здравствуйте! Хочу заказать дизайн");
  });

  test("сортировка по lastMessageAt: самые свежие первыми", async () => {
    const data = (await (await list(cookie1)).json()) as { conversations: Array<{ id: string }> };
    // свежее всего — диалог 20 минут назад (Telegram), затем 30 (VK awaiting), затем 50 (VK replied), затем пустой
    expect(data.conversations[0].id).toBe(tgAwaiting);
    expect(data.conversations[1].id).toBe(vkAwaiting);
    expect(data.conversations[2].id).toBe(vkReplied);
  });

  test("фильтр по каналу", async () => {
    const data = (await (await list(cookie1, "?channel=VK")).json()) as { total: number; conversations: Array<{ channel: string }> };
    expect(data.total).toBe(2);
    expect(data.conversations.every((c) => c.channel === "VK")).toBe(true);
  });

  test("фильтр по нескольким каналам", async () => {
    const data = (await (await list(cookie1, "?channel=VK,TELEGRAM_BOT")).json()) as { total: number };
    expect(data.total).toBe(3);
  });

  test("статус awaiting: последнее сообщение — входящее", async () => {
    const data = (await (await list(cookie1, "?status=awaiting")).json()) as { total: number; conversations: Array<{ id: string }> };
    expect(data.total).toBe(2);
    expect(data.conversations.map((c) => c.id).sort()).toEqual([vkAwaiting, tgAwaiting].sort());
  });

  test("статус replied: последнее сообщение — исходящее", async () => {
    const data = (await (await list(cookie1, "?status=replied")).json()) as { total: number; conversations: Array<{ id: string }> };
    expect(data.total).toBe(1);
    expect(data.conversations[0].id).toBe(vkReplied);
  });

  test("мульти-статус awaiting,replied: все диалоги с сообщениями (дропдаун «Статус», D2)", async () => {
    const data = (await (await list(cookie1, "?status=awaiting,replied")).json()) as { total: number };
    // Три диалога с сообщениями; пустой (без последнего сообщения) не попадает.
    expect(data.total).toBe(3);
  });

  test("поиск по имени контакта и по externalId", async () => {
    const byName = (await (await list(cookie1, "?q=Максим")).json()) as { total: number };
    expect(byName.total).toBe(1);
    const byId = (await (await list(cookie1, "?q=vk-client-2")).json()) as { total: number };
    expect(byId.total).toBe(1);
  });

  test("пагинация: limit/offset и total", async () => {
    const page1 = (await (await list(cookie1, "?limit=2&offset=0")).json()) as { total: number; conversations: Array<{ id: string }> };
    expect(page1.total).toBe(4);
    expect(page1.conversations).toHaveLength(2);
    const page2 = (await (await list(cookie1, "?limit=2&offset=2")).json()) as { conversations: Array<{ id: string }> };
    expect(page2.conversations).toHaveLength(2);
    const ids = new Set([...page1.conversations, ...page2.conversations].map((c) => c.id));
    expect(ids.size).toBe(4);
  });

  test("изоляция тенантов: чужая организация не видит диалогов", async () => {
    const data = (await (await list(cookie2)).json()) as { total: number };
    expect(data.total).toBe(0);
  });

  test("некорректные параметры не ломают запрос (fallback на дефолты)", async () => {
    const data = (await (await list(cookie1, "?limit=999&offset=-5&status=bogus&channel=HACK")).json()) as { total: number };
    expect(data.total).toBe(4);
  });
});

describe("GET /api/conversations/:id: карточка контакта", () => {
  test("возвращает контакт и подключение", async () => {
    const response = await getConversation(call(`/api/conversations/${vkAwaiting}`, { cookie: cookie1 }), {
      params: Promise.resolve({ id: vkAwaiting }),
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { conversation: { contact: { name: string }; connection: { type: string; name: string } } };
    expect(data.conversation.contact.name).toBe("Анна Смирнова");
    expect(data.conversation.connection.type).toBe("VK");
    expect(data.conversation.connection.name).toBe("Сообщество");
  });

  test("чужой диалог → 404", async () => {
    const response = await getConversation(call(`/api/conversations/${vkAwaiting}`, { cookie: cookie2 }), {
      params: Promise.resolve({ id: vkAwaiting }),
    });
    expect(response.status).toBe(404);
  });
});
