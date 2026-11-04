import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { POST as register } from "../../src/app/api/auth/register/route";
import { POST as login } from "../../src/app/api/auth/login/route";
import { POST as forgotPassword } from "../../src/app/api/auth/forgot-password/route";
import { POST as resetPassword } from "../../src/app/api/auth/reset-password/route";
import { GET as me } from "../../src/app/api/auth/me/route";
import { mailboxForTests } from "../../src/server/mailer";
import { call, db, resetDb } from "./helpers";

const email = "bob@example.com";
const oldPassword = "staryy-parol-123";
const newPassword = "novyy-parol-456";

function tokenFromLastLetter(): string {
  const letter = mailboxForTests.at(-1);
  if (!letter) throw new Error("письмо не отправлено");
  const match = letter.text.match(/reset-password\?token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`ссылка смены пароля не найдена в письме: ${letter.text}`);
  return match[1];
}

beforeAll(async () => {
  await resetDb();
  mailboxForTests.length = 0;
  const response = await register(
    call("/api/auth/register", { body: { email, password: oldPassword, name: "Боб" } }),
  );
  expect(response.status).toBe(201);
});

afterAll(async () => {
  await db.$disconnect();
});

describe("«напомнить пароль»: запрос ссылки", () => {
  test("существующий email → 200, письмо со ссылкой, Verification-запись", async () => {
    const response = await forgotPassword(call("/api/auth/forgot-password", { body: { email } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.message).toBe("Если аккаунт существует, мы отправили ссылку для смены пароля.");
    expect(mailboxForTests).toHaveLength(1);
    expect(mailboxForTests[0].to).toBe(email);
    expect(mailboxForTests[0].subject).toContain("смены пароля");
    const token = tokenFromLastLetter();
    expect(token.length).toBeGreaterThanOrEqual(16);
    const verification = await db.verification.findFirst({
      where: { identifier: `reset-password:${token}` },
    });
    expect(verification?.value).toBeDefined();
  });

  test("несуществующий email → тот же ответ 200, письма нет (без перечисления аккаунтов)", async () => {
    const response = await forgotPassword(
      call("/api/auth/forgot-password", { body: { email: "ghost@example.com" } }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).message).toBe("Если аккаунт существует, мы отправили ссылку для смены пароля.");
    expect(mailboxForTests).toHaveLength(1);
  });

  test("битый email → 400", async () => {
    const response = await forgotPassword(call("/api/auth/forgot-password", { body: { email: "не-email" } }));
    expect(response.status).toBe(400);
  });
});

describe("«напомнить пароль»: смена пароля по токену", () => {
  test("валидный токен → пароль меняется, сессии пользователя гаснут", async () => {
    const loginBefore = await login(call("/api/auth/login", { body: { email, password: oldPassword } }));
    expect(loginBefore.status).toBe(200);
    const cookieBefore = loginBefore.headers.getSetCookie().find((c) => /^better-auth\.session_token=/i.test(c))!.split(";")[0];
    expect((await me(call("/api/auth/me", { cookie: cookieBefore }))).status).toBe(200);

    const response = await resetPassword(
      call("/api/auth/reset-password", { body: { token: tokenFromLastLetter(), newPassword } }),
    );
    expect(response.status).toBe(200);

    // активная сессия погашена (revokeSessionsOnPasswordReset)
    expect((await me(call("/api/auth/me", { cookie: cookieBefore }))).status).toBe(401);
    // старый пароль больше не работает, новый — работает
    expect((await login(call("/api/auth/login", { body: { email, password: oldPassword } }))).status).toBe(401);
    expect((await login(call("/api/auth/login", { body: { email, password: newPassword } }))).status).toBe(200);
  });

  test("токен одноразовый: повторное использование → 400", async () => {
    const response = await resetPassword(
      call("/api/auth/reset-password", { body: { token: tokenFromLastLetter(), newPassword } }),
    );
    expect(response.status).toBe(400);
  });

  test("мусорный токен → 400, короткий пароль → 400", async () => {
    const badToken = await resetPassword(
      call("/api/auth/reset-password", { body: { token: "nonsense-token", newPassword } }),
    );
    expect(badToken.status).toBe(400);
    await forgotPassword(call("/api/auth/forgot-password", { body: { email } }));
    const shortPassword = await resetPassword(
      call("/api/auth/reset-password", { body: { token: tokenFromLastLetter(), newPassword: "short" } }),
    );
    expect(shortPassword.status).toBe(400);
  });
});
