export class ValidationError extends Error {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Браузер на POST всегда присылает Origin; несовпадающий источник — CSRF-защита
// (по образцу V1). Запросы без Origin (curl, тесты) не блокируются.
export function checkOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin || !process.env.AUTH_BASE_URL) return null;
  if (origin !== new URL(process.env.AUTH_BASE_URL).origin) {
    return Response.json({ message: "Недопустимый источник запроса." }, { status: 403 });
  }
  return null;
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Некорректный запрос.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Некорректный запрос.");
  }
  return body as Record<string, unknown>;
}

export function parseEmail(value: unknown): string {
  if (typeof value !== "string" || value.trim().length > 254 || !EMAIL_RE.test(value.trim())) {
    throw new ValidationError("Введите корректный email.");
  }
  return value.trim().toLowerCase();
}

export function parsePassword(value: unknown, min = 8): string {
  if (typeof value !== "string" || value.length < min || value.length > 128) {
    throw new ValidationError(`Пароль должен содержать от ${min} до 128 символов.`);
  }
  return value;
}

export function parseName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (name.length < 1 || name.length > 100) throw new ValidationError("Укажите имя (1–100 символов).");
  return name;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ValidationError) {
    return Response.json({ message: error.message }, { status: 400 });
  }
  console.error("auth route error:", error instanceof Error ? error.message : error);
  return Response.json({ message: "Внутренняя ошибка." }, { status: 500 });
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}
