import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "prisma/config";

// `bun run` загружает .env сам, но CLI Prisma из bunx выполняется под Node —
// подгружаем .env вручную, не вводя зависимость dotenv.
if (!process.env.DATABASE_URL && existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://unused:unused@localhost:5432/unused",
  },
});
