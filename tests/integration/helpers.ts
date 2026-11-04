import { getDb } from "../../src/server/db/client";

// Интеграционные тесты обязаны идти только против messengo_test,
// иначе resetDb() стёр бы данные dev-базы.
if (!(process.env.DATABASE_URL ?? "").includes("messengo_test")) {
  throw new Error("Интеграционные тесты запускаются только против messengo_test (bun run test:integration).");
}

export const origin = process.env.AUTH_BASE_URL ?? "http://localhost:3000";
export const db = getDb();

export async function resetDb(): Promise<void> {
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE "Organization","User","Session","Account","Verification",` +
      `"ChannelConnection","Contact","Conversation","Message","InboundEvent","OutboxJob","SendAttempt","Draft" CASCADE`,
  );
}

type CallOptions = { method?: string; body?: unknown; cookie?: string; origin?: string };

export function call(path: string, options: CallOptions = {}): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: options.origin ?? origin,
    "x-forwarded-for": "192.0.2.42",
  };
  if (options.cookie) headers.cookie = options.cookie;
  return new Request(origin + path, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

export function sessionCookieOf(response: Response): string {
  const setCookie = response.headers.getSetCookie().find((c) => /^better-auth\.session_token=/i.test(c));
  if (!setCookie) throw new Error("кука сессии не найдена в ответе");
  return setCookie;
}
