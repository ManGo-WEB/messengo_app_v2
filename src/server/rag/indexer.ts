// Индексация «Памяти» (план D7): догоняющий проход по Message и периодическая
// сверка. В этой схеме сообщения неизменяемы (правок и мягких удалений нет),
// поэтому индекс только растёт: документы удаляет CASCADE при удалении сообщения.
// Вектор заполняется при записи через to_tsvector('russian', text) — клиент
// Prisma поле searchVector не трогает.
import { randomUUID } from "node:crypto";
import { getDb } from "../db/client";

const CATCH_UP_BATCH = 200, RECONCILE_BATCH = 100, RECONCILE_EVERY_TICKS = 60; // сверка ~раз в 2 минуты при тике 2с

type IndexedRow = { id: string; organizationId: string; conversationId: string; direction: string; text: string; createdAt: Date };

async function upsertDocument(row: IndexedRow): Promise<void> {
  if (!row.text.trim()) return;
  await getDb().$executeRaw`INSERT INTO "RagDocument" ("id", "organizationId", "conversationId", "messageId", "direction", "text", "createdAt", "updatedAt", "searchVector")
    VALUES (${randomUUID()}, ${row.organizationId}, ${row.conversationId}, ${row.id}, ${row.direction}::"MessageDirection", ${row.text}, ${row.createdAt}, now(), to_tsvector('russian', ${row.text}))
    ON CONFLICT ("messageId") DO UPDATE SET "text" = EXCLUDED."text", "searchVector" = to_tsvector('russian', EXCLUDED."text"), "updatedAt" = now()`;
}

// Догоняющая индексация новых сообщений: курсор (createdAt, id) в единственной
// строке RagIndexState; при пустом батче курсор прыгает к голове снимка.
export async function ragCatchUp(batch = CATCH_UP_BATCH): Promise<void> {
  const db = getDb();
  const state = await db.ragIndexState.upsert({ where: { id: "memory" }, create: { id: "memory" }, update: {} });
  const rows = await db.$queryRaw<IndexedRow[]>`
    SELECT "id", "organizationId", "conversationId", "direction"::text AS "direction", "text", "createdAt"
    FROM "Message"
    WHERE ("createdAt", "id") > (${state.lastCreatedAt}, ${state.lastMessageId ?? ""})
    ORDER BY "createdAt" ASC, "id" ASC LIMIT ${batch}`;
  for (const row of rows) await upsertDocument(row);
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    await db.ragIndexState.update({ where: { id: "memory" }, data: { lastCreatedAt: last.createdAt, lastMessageId: last.id } });
    return;
  }
  const head = await db.$queryRaw<Array<{ createdAt: Date; id: string }>>`SELECT "createdAt", "id" FROM "Message" ORDER BY "createdAt" DESC, "id" DESC LIMIT 1`;
  const top = head[0];
  if (top && (top.createdAt > state.lastCreatedAt || (top.createdAt.getTime() === state.lastCreatedAt.getTime() && top.id > (state.lastMessageId ?? "")))) {
    await db.ragIndexState.update({ where: { id: "memory" }, data: { lastCreatedAt: top.createdAt, lastMessageId: top.id } });
  }
}

// Сверка: восстанавливает пропущенные документы и убирает осиротевшие
// (штатно их удаляет CASCADE; сверка — страховка на случай сбоя).
export async function ragReconcile(batch = RECONCILE_BATCH): Promise<void> {
  const db = getDb();
  const missing = await db.$queryRaw<IndexedRow[]>`
    SELECT m."id", m."organizationId", m."conversationId", m."direction"::text AS "direction", m."text", m."createdAt"
    FROM "Message" m LEFT JOIN "RagDocument" d ON d."messageId" = m."id"
    WHERE d."id" IS NULL AND m."text" <> ''
    ORDER BY m."createdAt" ASC, m."id" ASC LIMIT ${batch}`;
  for (const row of missing) await upsertDocument(row);
  const stale = await db.$queryRaw<Array<{ messageId: string }>>`
    SELECT d."messageId" FROM "RagDocument" d LEFT JOIN "Message" m ON m."id" = d."messageId"
    WHERE m."id" IS NULL LIMIT ${batch}`;
  for (const row of stale) await db.ragDocument.deleteMany({ where: { messageId: row.messageId } });
}

let ticks = 0;
export async function runRagMaintenance(): Promise<void> {
  ticks++;
  try {
    await ragCatchUp();
    if (ticks % RECONCILE_EVERY_TICKS === 0) await ragReconcile();
  } catch (error) {
    console.error("worker: индексация памяти отстала, поиск по истории может быть неполным:", error);
  }
}
