import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { getDb } from "../db/client";

function createAuth() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET (32+ символа) обязателен");
  const baseURL = process.env.AUTH_BASE_URL ?? "http://localhost:3000";
  return betterAuth({
    appName: "Messengo",
    baseURL,
    secret,
    trustedOrigins: [baseURL],
    database: prismaAdapter(getDb(), { provider: "postgresql", transaction: true }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
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
