// Поиск «Памяти» (план D7): полнотекстовый поиск по всей переписке организации,
// оба направления сообщений. Возврат — до LIMIT результатов, релевантные вперёд.
import { getDb } from "../db/client";

const LIMIT = 20;

export type MemoryItem = {
  messageId: string;
  conversationId: string;
  channel: string;
  sourceTitle: string | null;
  direction: string;
  createdAt: string;
  text: string;
};

export async function searchMemory(organizationId: string, query: string) {
  const q = query.trim();
  if (!q) return { query: null as string | null, items: [] as MemoryItem[] };
  const hits = await getDb().$queryRaw<
    Array<{ messageId: string; conversationId: string; channel: string; contactName: string | null; threadTitle: string | null; direction: string; createdAt: Date; text: string }>
  >`
    SELECT m."id" AS "messageId", m."conversationId", c."type" AS "channel",
           ct."name" AS "contactName", cv."threadTitle",
           m."direction"::text AS "direction", m."createdAt", m."text",
           ts_rank(d."searchVector", query) AS relevance
    FROM "RagDocument" d
    JOIN "Message" m ON m."id" = d."messageId"
    JOIN "Conversation" cv ON cv."id" = d."conversationId"
    JOIN "Contact" ct ON ct."id" = cv."contactId"
    JOIN "ChannelConnection" c ON c."id" = cv."connectionId"
    CROSS JOIN websearch_to_tsquery('russian', ${q}) AS query
    WHERE d."organizationId" = ${organizationId} AND d."searchVector" @@ query
    ORDER BY relevance DESC, m."createdAt" DESC
    LIMIT ${LIMIT}`;
  return {
    query: q,
    items: hits.map((hit) => ({
      messageId: hit.messageId,
      conversationId: hit.conversationId,
      channel: hit.channel,
      sourceTitle: hit.contactName ?? hit.threadTitle,
      direction: hit.direction,
      createdAt: hit.createdAt.toISOString(),
      text: hit.text,
    })),
  };
}
