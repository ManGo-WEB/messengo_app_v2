// Черновики композера (план D2 п.2): загрузка, автосохранение с ревизиями,
// конфликт правки 409 (по образцу V1), изоляция тенантов, изоляция source=MANUAL.
import { beforeAll, describe, expect, test } from "bun:test";
import { POST as registerRoute } from "../../src/app/api/auth/register/route";
import { POST as loginRoute } from "../../src/app/api/auth/login/route";
import { GET as getDraft, PUT as putDraft } from "../../src/app/api/conversations/[id]/draft/route";
import { call, db, resetDb } from "./helpers";

let cookie1 = "";
let cookie2 = "";
let conversationId = "";

beforeAll(async () => {
  await resetDb();
  await registerRoute(call("/api/auth/register", { body: { email: "d2-draft@example.com", password: "parol-d2-2026", name: "Оператор" } }));
  const login1 = await loginRoute(call("/api/auth/login", { body: { email: "d2-draft@example.com", password: "parol-d2-2026" } }));
  cookie1 = login1.headers.getSetCookie().find((c) => /^better-auth\.session_token=/i.test(c))!.split(";")[0];

  await registerRoute(call("/api/auth/register", { body: { email: "d2-other@example.com", password: "parol-d2-other", name: "Чужой" } }));
  const login2 = await loginRoute(call("/api/auth/login", { body: { email: "d2-other@example.com", password: "parol-d2-other" } }));
  cookie2 = login2.headers.getSetCookie().find((c) => /^better-auth\.session_token=/i.test(c))!.split(";")[0];

  const user = await db.user.findUniqueOrThrow({ where: { email: "d2-draft@example.com" } });
  const connection = await db.channelConnection.create({
    data: { organizationId: user.organizationId, type: "TESTING", externalId: "t1", status: "ACTIVE" },
  });
  const contact = await db.contact.create({
    data: { organizationId: user.organizationId, connectionId: connection.id, externalId: "cust-1", name: "Иван" },
  });
  const conversation = await db.conversation.create({
    data: { organizationId: user.organizationId, connectionId: connection.id, contactId: contact.id, externalKey: "chat-1" },
  });
  conversationId = conversation.id;
});

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("Черновик композера", () => {
  test("пустой диалог: GET возвращает text='': revision 0", async () => {
    const response = await getDraft(call(`/api/conversations/${conversationId}/draft`, { cookie: cookie1 }), ctx(conversationId));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "", revision: 0 });
  });

  test("первое сохранение с expectedRevision 0 → revision 1; GET возвращает текст", async () => {
    const response = await putDraft(
      call(`/api/conversations/${conversationId}/draft`, { method: "PUT", cookie: cookie1, body: { text: "Здравствуйте!", expectedRevision: 0 } }),
      ctx(conversationId),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "Здравствуйте!", revision: 1 });

    const read = await getDraft(call(`/api/conversations/${conversationId}/draft`, { cookie: cookie1 }), ctx(conversationId));
    expect(await read.json()).toEqual({ text: "Здравствуйте!", revision: 1 });
  });

  test("устаревший expectedRevision → 409 и серверная версия черновика (V1-механика)", async () => {
    const response = await putDraft(
      call(`/api/conversations/${conversationId}/draft`, { method: "PUT", cookie: cookie1, body: { text: "Моя правка", expectedRevision: 0 } }),
      ctx(conversationId),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: "Конфликт черновика.", draft: { text: "Здравствуйте!", revision: 1 } });
  });

  test("свежая ревизия сохраняется (revision 2)", async () => {
    const response = await putDraft(
      call(`/api/conversations/${conversationId}/draft`, { method: "PUT", cookie: cookie1, body: { text: "Здравствуйте, Иван!", expectedRevision: 1 } }),
      ctx(conversationId),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "Здравствуйте, Иван!", revision: 2 });
  });

  test("AI-черновик (source=AI) не мешает черновику оператора", async () => {
    await db.draft.create({
      data: { organizationId: (await db.user.findUniqueOrThrow({ where: { email: "d2-draft@example.com" } })).organizationId, conversationId, text: "AI-вариант", revision: 3, source: "AI" },
    });
    const read = await getDraft(call(`/api/conversations/${conversationId}/draft`, { cookie: cookie1 }), ctx(conversationId));
    expect(await read.json()).toEqual({ text: "Здравствуйте, Иван!", revision: 2 });
  });

  test("изоляция тенантов: чужая организация получает 404", async () => {
    const read = await getDraft(call(`/api/conversations/${conversationId}/draft`, { cookie: cookie2 }), ctx(conversationId));
    expect(read.status).toBe(404);
    const write = await putDraft(
      call(`/api/conversations/${conversationId}/draft`, { method: "PUT", cookie: cookie2, body: { text: "x", expectedRevision: 0 } }),
      ctx(conversationId),
    );
    expect(write.status).toBe(404);
  });

  test("валидация: слишком длинный текст и некорректная ревизия → 400", async () => {
    const tooLong = await putDraft(
      call(`/api/conversations/${conversationId}/draft`, { method: "PUT", cookie: cookie1, body: { text: "x".repeat(16385), expectedRevision: 2 } }),
      ctx(conversationId),
    );
    expect(tooLong.status).toBe(400);
    const badRevision = await putDraft(
      call(`/api/conversations/${conversationId}/draft`, { method: "PUT", cookie: cookie1, body: { text: "ok", expectedRevision: -1 } }),
      ctx(conversationId),
    );
    expect(badRevision.status).toBe(400);
  });

  test("несуществующий диалог → 404", async () => {
    const read = await getDraft(call("/api/conversations/missing-id/draft", { cookie: cookie1 }), ctx("missing-id"));
    expect(read.status).toBe(404);
  });
});
