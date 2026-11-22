// Сквозной сценарий C4 (план: «организация регистрируется → подключает
// testing-канал → получает сообщение → отвечает → видит SENT»).
//
// UI-фаза D ещё не начата, поэтому сценарий проходит через HTTP-API на
// dev-стенде (docker compose: db + web + worker): Playwright request context
// хранит сессионную куку между шагами. TESTING-канал подключается dev-ручкой
// /api/testing/inbound (план B0 п.6) с указанием organizationId организации
// оператора; исходящее уходит через общий Outbox (A4) и TESTING-адаптер.
import { test, expect } from "@playwright/test";

const POLL_INTERVAL_MS = 500;
const POLL_ATTEMPTS = 30; // воркер забирает задания раз в 2 секунды (A4)

test("регистрация → testing-канал → входящее → ответ → SENT", async ({ request }) => {
  const stamp = Date.now();
  const email = `e2e-${stamp}@messengo.test`;
  const password = "e2e-password-12345";
  const contactExternalId = `e2e-contact-${stamp}`;
  const conversationKey = `e2e-chat-${stamp}`;
  const inboundEventId = `e2e-in-${stamp}`;

  // 1. Регистрация организации и оператора
  const registerResponse = await request.post("/api/auth/register", {
    data: { email, password, name: "E2E Оператор", organizationName: "E2E-организация" },
  });
  expect(registerResponse.status()).toBe(201);
  const registered = (await registerResponse.json()) as { organization: { id: string } };
  const organizationId = registered.organization.id;

  // 2. Вход: сессионная кука оседает в request context
  const loginResponse = await request.post("/api/auth/login", { data: { email, password } });
  expect(loginResponse.ok()).toBeTruthy();

  // 3. Подключение TESTING-канала (создаётся при первом событии) и входящее сообщение
  const inboundResponse = await request.post("/api/testing/inbound", {
    data: {
      organizationId,
      events: [
        {
          externalEventId: inboundEventId,
          contactExternalId,
          contactName: "Клиент E2E",
          conversationKey,
          text: "Здравствуйте! Есть вопрос по вашему продукту.",
        },
      ],
    },
  });
  expect(inboundResponse.ok()).toBeTruthy();
  const inbound = (await inboundResponse.json()) as { connectionId: string; processed: number; duplicates: number };
  expect(inbound.processed).toBe(1);
  expect(inbound.duplicates).toBe(0);

  // Подключение видно в списке каналов (B5) со статусом ACTIVE
  const channelsResponse = await request.get("/api/channels");
  expect(channelsResponse.ok()).toBeTruthy();
  const { connections } = (await channelsResponse.json()) as {
    connections: Array<{ id: string; type: string; status: string }>;
  };
  const testingConnection = connections.find((connection) => connection.id === inbound.connectionId);
  expect(testingConnection).toMatchObject({ type: "TESTING", status: "ACTIVE" });

  // 4. Диалог появился в списке диалогов организации
  const conversationsResponse = await request.get("/api/conversations");
  expect(conversationsResponse.ok()).toBeTruthy();
  const { conversations } = (await conversationsResponse.json()) as {
    conversations: Array<{ id: string; contactExternalId: string; channel: string }>;
  };
  const conversation = conversations.find((item) => item.contactExternalId === contactExternalId);
  expect(conversation, "диалог testing-канала должен появиться в списке").toBeTruthy();
  expect(conversation?.channel).toBe("TESTING");

  // Входящее видно в истории диалога
  const historyResponse = await request.get(`/api/conversations/${conversation!.id}/messages`);
  expect(historyResponse.ok()).toBeTruthy();
  const history = (await historyResponse.json()) as { messages: Array<{ direction: string; text: string }> };
  expect(history.messages.some((message) => message.direction === "IN" && message.text.includes("вопрос"))).toBe(true);

  // 5. Ответ оператора: сообщение уходит в Outbox
  const replyText = "Здравствуйте! Отвечаем на ваш вопрос.";
  const sendResponse = await request.post(`/api/conversations/${conversation!.id}/messages`, {
    data: { text: replyText },
  });
  expect(sendResponse.status()).toBe(201);

  // 6. Воркер обрабатывает задание: PENDING → SENT (статус виден оператору)
  let sentMessage: { status: string; externalId: string | null } | undefined;
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const pollResponse = await request.get(`/api/conversations/${conversation!.id}/messages`);
    expect(pollResponse.ok()).toBeTruthy();
    const { messages } = (await pollResponse.json()) as {
      messages: Array<{ direction: string; text: string; status: string; externalId: string | null }>;
    };
    sentMessage = messages.find((message) => message.direction === "OUT" && message.text === replyText);
    if (sentMessage?.status === "SENT") break;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  expect(sentMessage?.status, "исходящее должно получить статус SENT от воркера").toBe("SENT");
  expect(sentMessage?.externalId, "TESTING-адаптер возвращает externalId отправки").toBeTruthy();
});
