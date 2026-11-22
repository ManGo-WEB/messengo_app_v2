// «Память» (план D7): интеграция индексации и поиска — изоляция организаций,
// поиск по обоим направлениям, идемпотентность индексации и восстановление
// пропущенных документов сверкой.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { POST as register } from "../../src/app/api/auth/register/route";
import { POST as login } from "../../src/app/api/auth/login/route";
import { GET as memorySearch } from "../../src/app/api/memory/search/route";
import { ragCatchUp, ragReconcile } from "../../src/server/rag/indexer";
import { searchMemory } from "../../src/server/rag/memory";
import { call, db, resetDb, sessionCookieOf } from "./helpers";

// Register куку не выдаёт (см. auth.test.ts): сессию получаем отдельным логином.
// Email — латиница: better-auth signInEmail отклоняет не-ASCII в адресе.
async function registerOrg(name: string) {
  const email = `${name}-${randomUUID().slice(0, 8)}@example.com`, password = "parol-vosim-simvolov";
  const registered = await register(call("/api/auth/register", { body: { email, password, name } }));
  expect(registered.status).toBe(201);
  const organizationId = (await registered.json()).organization.id as string;
  const loggedIn = await login(call("/api/auth/login", { body: { email, password } }));
  expect(loggedIn.status).toBe(200);
  return { cookie: sessionCookieOf(loggedIn), organizationId };
}

async function message(organizationId: string, conversationId: string, direction: "IN" | "OUT", text: string, offsetSeconds: number) {
  return db.message.create({
    data: { organizationId, conversationId, direction, text, status: direction === "IN" ? "RECEIVED" : "SENT", createdAt: new Date(Date.now() + offsetSeconds * 1000) },
  });
}

async function conversationFor(organizationId: string, contactName: string) {
  const connection = await db.channelConnection.create({ data: { organizationId, type: "TESTING", externalId: contactName } });
  const contact = await db.contact.create({ data: { organizationId, connectionId: connection.id, externalId: contactName, name: contactName } });
  return db.conversation.create({ data: { organizationId, connectionId: connection.id, contactId: contact.id, externalKey: contactName, threadTitle: contactName } });
}

async function reindexAll() {
  await db.ragIndexState.upsert({ where: { id: "memory" }, create: { id: "memory", lastCreatedAt: new Date(0) }, update: { lastCreatedAt: new Date(0), lastMessageId: null } });
  await ragCatchUp();
}

beforeAll(resetDb);
afterAll(async () => {
  await db.$disconnect();
});

describe("память организации", () => {
  test("находит вопрос и ответ, не выходит за пределы организации", async () => {
    const a = await registerOrg("alisa");
    const b = await registerOrg("boris");
    const chatA = await conversationFor(a.organizationId, "Клиент А");
    const chatB = await conversationFor(b.organizationId, "Клиент Б");
    await message(a.organizationId, chatA.id, "IN", "Сколько стоит абонемент", -10);
    await message(a.organizationId, chatA.id, "OUT", "Абонемент стоит 3000 рублей", -9);
    await message(b.organizationId, chatB.id, "IN", "Сколько стоит абонемент", -10);
    await reindexAll();

    const found = await searchMemory(a.organizationId, "сколько стоит абонемент");
    expect(found.query).toBe("сколько стоит абонемент");
    expect(found.items.length).toBe(2);
    expect(found.items.every((item) => item.conversationId === chatA.id)).toBe(true);
    expect(found.items.some((item) => item.direction === "IN")).toBe(true);
    expect(found.items.some((item) => item.direction === "OUT")).toBe(true);
    expect(found.items[0].sourceTitle).toBe("Клиент А");

    const foreign = await searchMemory(b.organizationId, "сколько стоит абонемент");
    expect(foreign.items.length).toBe(1);
    expect(foreign.items.every((item) => item.conversationId === chatB.id)).toBe(true);
  });

  test("API требует входа и отдаёт результаты своей организации", async () => {
    const a = await registerOrg("galya");
    const unauthenticated = await memorySearch(call("/api/memory/search?q=test"));
    expect(unauthenticated.status).toBe(401);

    const chat = await conversationFor(a.organizationId, "Клиент Г");
    await message(a.organizationId, chat.id, "IN", "Когда начинается занятие", -5);
    await reindexAll();
    const authorized = await memorySearch(call("/api/memory/search?q=занятие", { cookie: a.cookie }));
    expect(authorized.status).toBe(200);
    const body = await authorized.json();
    expect(body.items.length).toBe(1);
    expect(body.items[0].text).toBe("Когда начинается занятие");
  });

  test("индексация идемпотентна, сверка восстанавливает пропущенные документы", async () => {
    const a = await registerOrg("darya");
    const chat = await conversationFor(a.organizationId, "Клиент Д");
    await message(a.organizationId, chat.id, "IN", "Можно ли оплатить картой", -10);
    await message(a.organizationId, chat.id, "OUT", "Да, принимаем карты", -9);
    await reindexAll();
    expect(await db.ragDocument.count({ where: { conversationId: chat.id } })).toBe(2);
    await reindexAll();
    expect(await db.ragDocument.count({ where: { conversationId: chat.id } })).toBe(2);

    await db.ragDocument.deleteMany({ where: { conversationId: chat.id } });
    await ragReconcile();
    expect(await db.ragDocument.count({ where: { conversationId: chat.id } })).toBe(2);
    const empty = await searchMemory(a.organizationId, "   ");
    expect(empty).toEqual({ query: null, items: [] });
  });
});
