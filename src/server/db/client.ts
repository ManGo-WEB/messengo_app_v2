import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

const globalDb = globalThis as unknown as { messengoDb?: PrismaClient };

export function getDb(): PrismaClient {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return (globalDb.messengoDb ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }));
}
