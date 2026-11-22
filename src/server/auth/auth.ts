import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { getDb } from "../db/client";
import { sendMail } from "../mailer";

// Ссылка в письме ведёт на нашу страницу смены пароля (D6), а не на GET-роут
// Better Auth — он у нас не смонтирован.
function resetPasswordLink(token: string): string {
  return `${process.env.AUTH_BASE_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;
}

function createAuth() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET (32+ символа) обязателен");
  const baseURL = process.env.AUTH_BASE_URL ?? "http://localhost:3000";
  // В dev оператор может открыть приложение и на http://127.0.0.1:3000, и на
  // http://localhost:3000 — доверяем обеим петлевым формам одного и того же
  // адреса (только когда baseURL сам — localhost; в проде с реальным доменом
  // список остаётся строгим).
  const loopbackAliases = (() => {
    try {
      const url = new URL(baseURL);
      if (url.hostname !== "localhost") return [];
      const port = url.port ? `:${url.port}` : "";
      return [`http://127.0.0.1${port}`];
    } catch {
      return [];
    }
  })();
  return betterAuth({
    appName: "Messengo",
    baseURL,
    secret,
    trustedOrigins: [baseURL, ...loopbackAliases],
    database: prismaAdapter(getDb(), { provider: "postgresql", transaction: true }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        const link = resetPasswordLink(token);
        await sendMail({
          to: user.email,
          subject: "Messengo: ссылка для смены пароля",
          text: `Здравствуйте!\n\nКто-то (надеемся, вы) запросил смену пароля в Messengo.\nСсылка действует 1 час: ${link}\n\nЕсли вы не запрашивали смену пароля, просто игнорируйте это письмо.`,
          html: `<p>Здравствуйте!</p><p>Кто-то (надеемся, вы) запросил смену пароля в Messengo.</p><p><a href="${link}">Сменить пароль</a> — ссылка действует 1 час.</p><p>Если вы не запрашивали смену пароля, просто игнорируйте это письмо.</p>`,
        });
      },
    },
    // 30 дней — под «Запомнить меня» (персистентная кука); без чекбокса кука
    // сессионная и умирает вместе с браузером (см. /api/auth/login)
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 * 7 },
    rateLimit: {
      enabled: process.env.NODE_ENV !== "test",
      window: 60,
      max: 100,
      customRules: { "/sign-in/email": { window: 60, max: 10 } },
    },
    advanced: { useSecureCookies: new URL(baseURL).protocol === "https:" },
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  return (instance ??= createAuth());
}
