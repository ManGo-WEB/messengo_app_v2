// Тонкий REST-клиент Green API на fetch (план C1). Креды не хранятся в коде:
// apiUrl/idInstance/apiTokenInstance передаются в конструктор, партнёрский ключ —
// из окружения (GREEN_API_PARTNER_TOKEN). Спецификации сверены с официальной
// документацией green-api.com/docs (2026-11-21), расхождения с research-доком
// учтены в types.ts.
import type {
  GreenApiCreateInstanceResponse,
  GreenApiInstanceState,
  GreenApiInstanceSettings,
  GreenApiQrResponse,
  GreenApiSendAuthorizationPasswordResponse,
  GreenApiSendMessageRequest,
  GreenApiSendMessageResponse,
} from "./types";

export class GreenApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
    public readonly details?: unknown,
  ) {
    super(code);
  }
}

export type GreenApiConfig = {
  /** Хост instance-API, например https://api.green-api.com (GREEN_API_BASE_URL). */
  baseUrl: string;
  idInstance: number | string;
  apiTokenInstance: string;
  timeoutMs?: number;
  /** Подмена fetch в тестах. */
  fetchImpl?: typeof fetch;
};

export type GreenApiPartnerConfig = {
  /** Хост партнёрского API — {{partnerApiUrl}} из личного кабинета. */
  partnerApiUrl: string;
  partnerToken: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

const DEFAULT_TIMEOUT_MS = 30_000;

/** Результат безопасной отправки (маппится в SendResult адаптера канала). */
export type SafeSendResult =
  | { status: "SENT"; externalId: string }
  | { status: "UNKNOWN"; externalId?: string };

export class GreenApiClient {
  private readonly baseUrl: string;
  private readonly idInstance: string;
  private readonly apiTokenInstance: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: GreenApiConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.idInstance = String(config.idInstance);
    this.apiTokenInstance = config.apiTokenInstance;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  /** URL метода instance-API: {{apiUrl}}/waInstance{{idInstance}}/{{method}}/{{token}}. */
  private waUrl(method: string): string {
    return `${this.baseUrl}/waInstance${this.idInstance}/${method}/${this.apiTokenInstance}`;
  }

  private async request(method: "GET" | "POST", url: string, body?: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      let parsed: unknown = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          // Green API иногда отдаёт не-JSON тело; сохраняем как текст.
          parsed = text;
        }
      }
      if (!response.ok) {
        throw new GreenApiError(`HTTP_${response.status}`, response.status, parsed);
      }
      return parsed;
    } catch (error) {
      if (error instanceof GreenApiError) throw error;
      // Таймаут AbortController и сетевые ошибки → единый NETWORK.
      if (error instanceof Error && error.name === "AbortError") {
        throw new GreenApiError("NETWORK", 0, `таймаут ${this.timeoutMs} мс`);
      }
      throw new GreenApiError("NETWORK", 0, error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timer);
    }
  }

  /** Получение QR-кода (инстанс должен быть неавторизован; QR обновляется каждые 20 с). */
  async getQr(): Promise<GreenApiQrResponse> {
    const data = await this.request("GET", this.waUrl("qr"));
    if (!isRecord(data) || typeof data.type !== "string" || typeof data.message !== "string") {
      throw new GreenApiError("INVALID_RESPONSE", 0, data);
    }
    return data as GreenApiQrResponse;
  }

  /** Состояние инстанса. */
  async getStateInstance(): Promise<{ stateInstance: GreenApiInstanceState }> {
    const data = await this.request("GET", this.waUrl("getStateInstance"));
    if (!isRecord(data) || typeof data.stateInstance !== "string") {
      throw new GreenApiError("INVALID_RESPONSE", 0, data);
    }
    return data as { stateInstance: GreenApiInstanceState };
  }

  /** Отправка текстового сообщения. Ошибки (в т.ч. NETWORK) пробрасываются. */
  async sendMessage(request: GreenApiSendMessageRequest): Promise<GreenApiSendMessageResponse> {
    const data = await this.request("POST", this.waUrl("sendMessage"), request);
    if (!isRecord(data) || typeof data.idMessage !== "string") {
      throw new GreenApiError("INVALID_RESPONSE", 0, data);
    }
    return data as GreenApiSendMessageResponse;
  }

  /**
   * Отправка с маппингом в результат адаптера: сетевые ошибки и таймауты →
   * UNKNOWN (примирение через outgoingMessageStatus); клиентские 4xx → UNKNOWN
   * с деталями — по правилу B0 «сеть не ломает диалог».
   */
  async sendMessageSafe(request: GreenApiSendMessageRequest): Promise<SafeSendResult> {
    try {
      const sent = await this.sendMessage(request);
      return { status: "SENT", externalId: sent.idMessage };
    } catch (error) {
      if (error instanceof GreenApiError && error.code === "INVALID_RESPONSE") throw error;
      return { status: "UNKNOWN" };
    }
  }

  /** Настройки инстанса и вебхуков (после вызова инстанс перезапускается). */
  async setSettings(settings: GreenApiInstanceSettings): Promise<{ saveSettings: boolean }> {
    const data = await this.request("POST", this.waUrl("setSettings"), settings);
    if (!isRecord(data) || data.saveSettings !== true) {
      throw new GreenApiError("INVALID_RESPONSE", 0, data);
    }
    return { saveSettings: true };
  }

  /**
   * Пароль 2FA для MAX после сканирования QR (состояние pendingPassword).
   * Ошибки (invalid_password и др.) приходят с HTTP 200 — возвращаются как есть.
   */
  async sendAuthorizationPassword(password: string): Promise<GreenApiSendAuthorizationPasswordResponse> {
    const data = await this.request("POST", this.waUrl("sendAuthorizationPassword"), { password });
    if (!isRecord(data) || typeof data.status !== "boolean") {
      throw new GreenApiError("INVALID_RESPONSE", 0, data);
    }
    return data as GreenApiSendAuthorizationPasswordResponse;
  }
}

/**
 * Партнёрское создание инстанса: POST {{partnerApiUrl}}/partner/createInstance/{{partnerToken}}.
 * Особенность Green API: ошибка приходит с HTTP 200 в теле {code, description}.
 */
export async function createGreenApiInstance(
  partner: GreenApiPartnerConfig,
  settings: GreenApiInstanceSettings,
): Promise<GreenApiCreateInstanceResponse> {
  const timeoutMs = partner.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = partner.fetchImpl ?? fetch;
  const url = `${partner.partnerApiUrl.replace(/\/+$/, "")}/partner/createInstance/${partner.partnerToken}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  let parsed: unknown;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
      signal: controller.signal,
    });
    const text = await response.text();
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new GreenApiError("NETWORK", 0, `таймаут ${timeoutMs} мс`);
    }
    throw new GreenApiError("NETWORK", 0, error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new GreenApiError(`HTTP_${response.status}`, response.status, parsed);
  }
  if (!isRecord(parsed)) throw new GreenApiError("INVALID_RESPONSE", 200, parsed);
  if (typeof parsed.code === "number" && typeof parsed.description === "string") {
    throw new GreenApiError(`GREEN_API_${parsed.code}`, 200, parsed.description);
  }
  if (
    typeof parsed.apiTokenInstance !== "string" ||
    typeof parsed.apiUrl !== "string" ||
    typeof parsed.idInstance !== "number" ||
    typeof parsed.mediaUrl !== "string" ||
    typeof parsed.typeInstance !== "string"
  ) {
    throw new GreenApiError("INVALID_RESPONSE", 200, parsed);
  }
  return parsed as GreenApiCreateInstanceResponse;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
