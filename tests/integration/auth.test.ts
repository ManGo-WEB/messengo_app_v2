import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { POST as register } from "../../src/app/api/auth/register/route";
import { POST as login } from "../../src/app/api/auth/login/route";
import { POST as logout } from "../../src/app/api/auth/logout/route";
import { GET as me } from "../../src/app/api/auth/me/route";
import { call, db, resetDb, sessionCookieOf } from "./helpers";

const email = "alice@example.com";
const password = "parol-vosim-simvolov";
let cookieRemembered = "";

beforeAll(resetDb);
afterAll(async () => {
  await db.$disconnect();
});

describe("регистрация", () => {
  test("создаёт организацию, пользователя и credential-аккаунт с хешем", async () => {
    const response = await register(
      call("/api/auth/register", { body: { email: "Alice@Example.com", password, name: "Алиса" } }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.user.email).toBe("alice@example.com");
    expect(body.user.passwordHash).toBeUndefined();
    expect(body.organization.id).toBeDefined();

    const user = await db.user.findUniqueOrThrow({
      where: { email },
      include: { organization: true, accounts: true },
    });
    expect(user.role).toBe("ADMIN");
    expect(user.organization.name).toBe("Алиса — организация");
    const account = user.accounts.find((a) => a.providerId === "credential");
    expect(account?.password).toBeTruthy();
    expect(account?.password).not.toContain(password);
    expect(await db.organization.count()).toBe(1);
  });

  test("повторная регистрация того же email → 409 без учёта регистра", async () => {
    const response = await register(
      call("/api/auth/register", { body: { email: "alice@EXAMPLE.com", password, name: "Другой" } }),
    );
    expect(response.status).toBe(409);
    expect(await db.user.count()).toBe(1);
    expect(await db.organization.count()).toBe(1);
  });

  test("короткий пароль и битый email → 400", async () => {
    const short = await register(
      call("/api/auth/register", { body: { email: "bad@example.com", password: "short", name: "X" } }),
    );
    expect(short.status).toBe(400);
    const badEmail = await register(
      call("/api/auth/register", { body: { email: "не-email", password, name: "X" } }),
    );
    expect(badEmail.status).toBe(400);
  });

  test("чужой origin → 403", async () => {
    const response = await register(
      call("/api/auth/register", {
        body: { email: "new@example.com", password, name: "X" },
        origin: "https://evil.invalid",
      }),
    );
    expect(response.status).toBe(403);
    expect(await db.user.count()).toBe(1);
  });
});

describe("вход, «запомнить меня» и сессия", () => {
  test("неверный пароль → 401", async () => {
    const response = await login(call("/api/auth/login", { body: { email, password: "wrong-password-1" } }));
    expect(response.status).toBe(401);
  });

  test("без rememberMe — сессионная кука без Max-Age", async () => {
    const response = await login(call("/api/auth/login", { body: { email, password, rememberMe: false } }));
    expect(response.status).toBe(200);
    const setCookie = sessionCookieOf(response);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).not.toMatch(/Max-Age/i);
    const body = await response.json();
    expect(body.user.email).toBe(email);
    expect(body.organization.name).toBe("Алиса — организация");
  });

  test("с rememberMe — кука с Max-Age 30 дней", async () => {
    const response = await login(call("/api/auth/login", { body: { email, password, rememberMe: true } }));
    expect(response.status).toBe(200);
    const setCookie = sessionCookieOf(response);
    expect(setCookie).toMatch(/Max-Age=2592000/i);
    cookieRemembered = setCookie.split(";")[0];
  });

  test("/api/auth/me: с кукой — пользователь и организация, без куки — 401", async () => {
    const ok = await me(call("/api/auth/me", { cookie: cookieRemembered }));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.user.email).toBe(email);
    expect(body.user.role).toBe("ADMIN");
    expect(body.organization.name).toBe("Алиса — организация");

    const anonymous = await me(call("/api/auth/me"));
    expect(anonymous.status).toBe(401);
  });

  test("logout очищает сессию", async () => {
    const response = await logout(call("/api/auth/logout", { method: "POST", cookie: cookieRemembered }));
    expect(response.status).toBe(204);
    expect(sessionCookieOf(response)).toMatch(/(max-age=0|expires=thu, 01 jan 1970)/i);
    const after = await me(call("/api/auth/me", { cookie: cookieRemembered }));
    expect(after.status).toBe(401);
  });
});
