// Unit-тесты клиента Green API на моках fetch (план C1 п.4):
// создание инстанса, QR, состояние, отправка, ошибка сети → UNKNOWN.
import { describe, expect, test } from "bun:test";
import { GreenApiError, GreenApiClient, createGreenApiInstance } from "../../src/server/channels/greenapi/client";

type Call = { url: string; init?: RequestInit };

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CLIENT_CONFIG = {
  baseUrl: "https://api.green-api.test",
  idInstance: 1101728000,
  apiTokenInstance: "test-token",
};

describe("createGreenApiInstance", () => {
  test("создаёт инстанс: POST на партнёрский URL с телом настроек", async () => {
    const { fetchImpl, calls } = mockFetch(() =>
      jsonResponse(200, {
        apiTokenInstance: "tok",
        apiUrl: "https://api.green-api.com/",
        idInstance: 1101728000,
        mediaUrl: "https://media.green-api.com/",
        typeInstance: "whatsapp",
      }),
    );
    const created = await createGreenApiInstance(
      { partnerApiUrl: "https://api.green-api.test", partnerToken: "partner-secret", fetchImpl },
      { name: "first instance", incomingWebhook: "yes" },
    );
    expect(created.idInstance).toBe(1101728000);
    expect(created.typeInstance).toBe("whatsapp");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.green-api.test/partner/createInstance/partner-secret");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      name: "first instance",
      incomingWebhook: "yes",
    });
  });

  test("ошибка Green API с HTTP 200 в теле {code, description} → GREEN_API_401", async () => {
    const { fetchImpl } = mockFetch(() => jsonResponse(200, { code: 401, description: "Unauthorized" }));
    expect(
      createGreenApiInstance(
        { partnerApiUrl: "https://api.green-api.test", partnerToken: "t", fetchImpl },
        { name: "x" },
      ),
    ).rejects.toThrow(GreenApiError);
    try {
      await createGreenApiInstance(
        { partnerApiUrl: "https://api.green-api.test", partnerToken: "t", fetchImpl },
        { name: "x" },
      );
    } catch (error) {
      expect((error as GreenApiError).code).toBe("GREEN_API_401");
      expect((error as GreenApiError).httpStatus).toBe(200);
    }
  });

  test("сетевая ошибка → NETWORK", async () => {
    const { fetchImpl } = mockFetch(() => {
      throw new Error("connection refused");
    });
    try {
      await createGreenApiInstance(
        { partnerApiUrl: "https://api.green-api.test", partnerToken: "t", fetchImpl },
        { name: "x" },
      );
      expect.unreachable();
    } catch (error) {
      expect((error as GreenApiError).code).toBe("NETWORK");
    }
  });
});

describe("GreenApiClient", () => {
  test("getQr: qrCode c base64-изображением", async () => {
    const { fetchImpl, calls } = mockFetch(() => jsonResponse(200, { type: "qrCode", message: "aGFsbg==" }));
    const client = new GreenApiClient({ ...CLIENT_CONFIG, fetchImpl });
    const qr = await client.getQr();
    expect(qr).toEqual({ type: "qrCode", message: "aGFsbg==" });
    expect(calls[0].url).toBe("https://api.green-api.test/waInstance1101728000/qr/test-token");
    expect(calls[0].init?.method).toBe("GET");
  });

  test("getQr: уже авторизован → alreadyLogged", async () => {
    const { fetchImpl } = mockFetch(() =>
      jsonResponse(200, { type: "alreadyLogged", message: "instance account already authorized" }),
    );
    const client = new GreenApiClient({ ...CLIENT_CONFIG, fetchImpl });
    expect((await client.getQr()).type).toBe("alreadyLogged");
  });

  test("getStateInstance возвращает состояние инстанса", async () => {
    const { fetchImpl, calls } = mockFetch(() => jsonResponse(200, { stateInstance: "notAuthorized" }));
    const client = new GreenApiClient({ ...CLIENT_CONFIG, fetchImpl });
    expect((await client.getStateInstance()).stateInstance).toBe("notAuthorized");
    expect(calls[0].url).toBe(
      "https://api.green-api.test/waInstance1101728000/getStateInstance/test-token",
    );
  });

  test("sendMessage: POST тела {chatId, message}, ответ с idMessage", async () => {
    const { fetchImpl, calls } = mockFetch(() => jsonResponse(200, { idMessage: "3EB0C767D097B7C7C030" }));
    const client = new GreenApiClient({ ...CLIENT_CONFIG, fetchImpl });
    const sent = await client.sendMessage({ chatId: "79001234567@c.us", message: "Привет!" });
    expect(sent.idMessage).toBe("3EB0C767D097B7C7C030");
    expect(calls[0].url).toBe("https://api.green-api.test/waInstance1101728000/sendMessage/test-token");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      chatId: "79001234567@c.us",
      message: "Привет!",
    });
  });

  test("sendMessageSafe: успех → SENT с externalId", async () => {
    const { fetchImpl } = mockFetch(() => jsonResponse(200, { idMessage: "MSG1" }));
    const client = new GreenApiClient({ ...CLIENT_CONFIG, fetchImpl });
    expect(await client.sendMessageSafe({ chatId: "79001234567@c.us", message: "ок" })).toEqual({
      status: "SENT",
      externalId: "MSG1",
    });
  });

  test("sendMessageSafe: ошибка сети → UNKNOWN (план C1)", async () => {
    const { fetchImpl } = mockFetch(() => {
      throw new Error("connection refused");
    });
    const client = new GreenApiClient({ ...CLIENT_CONFIG, fetchImpl });
    expect(await client.sendMessageSafe({ chatId: "79001234567@c.us", message: "ок" })).toEqual({
      status: "UNKNOWN",
    });
  });

  test("sendMessageSafe: таймаут (AbortError) → UNKNOWN", async () => {
    const { fetchImpl } = mockFetch(() => {
      const abort = new Error("aborted");
      abort.name = "AbortError";
      throw abort;
    });
    const client = new GreenApiClient({ ...CLIENT_CONFIG, fetchImpl });
    expect(await client.sendMessageSafe({ chatId: "79001234567@c.us", message: "ок" })).toEqual({
      status: "UNKNOWN",
    });
  });

  test("HTTP 4xx от API → GreenApiError с кодом HTTP_<status>", async () => {
    const { fetchImpl } = mockFetch(() => jsonResponse(400, { message: "Validation failed" }));
    const client = new GreenApiClient({ ...CLIENT_CONFIG, fetchImpl });
    try {
      await client.sendMessage({ chatId: "x", message: "y" });
      expect.unreachable();
    } catch (error) {
      expect((error as GreenApiError).code).toBe("HTTP_400");
      expect((error as GreenApiError).httpStatus).toBe(400);
    }
  });

  test("setSettings: POST настроек вебхуков, ответ saveSettings=true", async () => {
    const { fetchImpl, calls } = mockFetch(() => jsonResponse(200, { saveSettings: true }));
    const client = new GreenApiClient({ ...CLIENT_CONFIG, fetchImpl });
    expect(
      await client.setSettings({
        webhookUrl: "https://mysite.test/webhook/greenapi/",
        incomingWebhook: "yes",
        outgoingWebhook: "yes",
        stateWebhook: "yes",
      }),
    ).toEqual({ saveSettings: true });
    expect(calls[0].url).toBe("https://api.green-api.test/waInstance1101728000/setSettings/test-token");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      webhookUrl: "https://mysite.test/webhook/greenapi/",
      incomingWebhook: "yes",
      outgoingWebhook: "yes",
      stateWebhook: "yes",
    });
  });

  test("креды не захардкожены: клиент строит URL только из переданной конфигурации", async () => {
    const { fetchImpl, calls } = mockFetch(() => jsonResponse(200, { stateInstance: "authorized" }));
    const client = new GreenApiClient({
      baseUrl: "https://another-host.test/",
      idInstance: "42",
      apiTokenInstance: "secret-token",
      fetchImpl,
    });
    await client.getStateInstance();
    expect(calls[0].url).toBe("https://another-host.test/waInstance42/getStateInstance/secret-token");
  });
});
