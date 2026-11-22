// Мини-клиент API для клиентских компонентов: JSON + ошибки с кодом ответа
// (по образцу api() из workspace.tsx V1).
export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    let payload: unknown = null;
    try {
      payload = await response.json();
      if (payload && typeof payload === "object" && "message" in payload) {
        message = String((payload as { message: unknown }).message);
      }
    } catch {
      // тело не JSON — оставляем дефолтное сообщение
    }
    throw new ApiError(message, response.status, payload);
  }
  return (await response.json()) as T;
}
