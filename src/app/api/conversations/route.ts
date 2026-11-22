// Список диалогов организации (план D2 п.4): пагинация, фильтры по каналу и
// статусу, поиск по имени контакта. Статус «awaiting/replied» вычисляется по
// направлению последнего сообщения диалога (последнее входящее без ответа —
// «ожидает ответа оператора»).
//
// Запрос — параметризованный SQL ($queryRawUnsafe): в текст запроса попадают
// только значения из жёстких белых списков (типы каналов, статус, целые
// limit/offset); поисковая строка — через параметры.
import { getDb } from "../../../server/db/client";
import { requireSession } from "../../../server/auth/session";

const CHANNEL_TYPES = new Set([
  "VK",
  "TELEGRAM_BOT",
  "TELEGRAM_PERSONAL",
  "FACEBOOK",
  "INSTAGRAM",
  "WHATSAPP",
  "MAX",
  "TESTING",
]);
const STATUSES = new Set(["all", "awaiting", "replied"]);

type Row = {
  id: string;
  externalKey: string | null;
  threadTitle: string | null;
  lastMessageAt: Date | null;
  contactName: string | null;
  contactExternalId: string;
  channel: string;
  channelStatus: string;
  connectionName: string | null;
  lastText: string | null;
  lastDirection: string | null;
  lastStatus: string | null;
  lastCreatedAt: Date | null;
};

export async function GET(request: Request): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const url = new URL(request.url);

  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 100);
  const offset = Math.max(Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const channels = (url.searchParams.get("channel") ?? "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item) => CHANNEL_TYPES.has(item));
  const statusRaw = url.searchParams.get("status") ?? "all";
  const status = STATUSES.has(statusRaw) ? statusRaw : "all";

  const params: unknown[] = [session.data.organization.id];
  const where: string[] = [`c."organizationId" = $1`];
  if (channels.length > 0) {
    params.push(channels);
    where.push(`conn.type = ANY($${params.length})`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(ct.name ILIKE $${params.length} OR ct."externalId" ILIKE $${params.length})`);
  }
  if (status === "awaiting") where.push(`lm.direction = 'IN'`);
  if (status === "replied") where.push(`lm.direction = 'OUT'`);
  const whereSql = where.join(" AND ");

  // LATERAL подзапрос — последнее сообщение диалога (превью в списке и
  // вычисление статуса «ожидает ответа»).
  const lateral = `LEFT JOIN LATERAL (
      SELECT m.text, m.direction, m.status, m."createdAt"
      FROM "Message" m
      WHERE m."conversationId" = c.id
      ORDER BY m."createdAt" DESC, m.id DESC
      LIMIT 1
    ) lm ON true`;
  const from = `FROM "Conversation" c
    JOIN "Contact" ct ON ct.id = c."contactId"
    JOIN "ChannelConnection" conn ON conn.id = c."connectionId"
    ${lateral}`;

  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const db = getDb();
  const [rows, counts] = await Promise.all([
    db.$queryRawUnsafe<Row[]>(
      `SELECT c.id, c."externalKey", c."threadTitle", c."lastMessageAt",
              ct.name AS "contactName", ct."externalId" AS "contactExternalId",
              conn.type AS channel, conn.status AS "channelStatus", conn."displayName" AS "connectionName",
              lm.text AS "lastText", lm.direction AS "lastDirection", lm.status AS "lastStatus", lm."createdAt" AS "lastCreatedAt"
       ${from}
       WHERE ${whereSql}
       ORDER BY c."lastMessageAt" DESC NULLS LAST
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      ...params,
    ),
    db.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COUNT(*)::int AS total ${from} WHERE ${whereSql}`,
      ...params.slice(0, -2),
    ),
  ]);

  return Response.json({
    total: counts[0]?.total ?? 0,
    conversations: rows.map((row) => ({
      id: row.id,
      channel: row.channel,
      channelStatus: row.channelStatus,
      connectionName: row.connectionName,
      contactName: row.contactName,
      contactExternalId: row.contactExternalId,
      externalKey: row.externalKey,
      threadTitle: row.threadTitle,
      lastMessageAt: row.lastMessageAt?.toISOString() ?? row.lastCreatedAt?.toISOString() ?? null,
      lastMessage: row.lastText
        ? { text: row.lastText, direction: row.lastDirection, status: row.lastStatus, createdAt: row.lastCreatedAt?.toISOString() ?? null }
        : null,
    })),
  });
}
