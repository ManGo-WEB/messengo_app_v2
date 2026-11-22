// Сводные счётчики для дашборда (план D5 п.2): всего диалогов, ожидают
// ответа (последнее сообщение — входящее, та же семантика статуса, что в
// /api/conversations), новые за сегодня (первое сообщение диалога создано
// сегодня) и SLA-показатели первого ответа (среднее время ответа, доля
// диалогов с ответом в течение часа).
//
// Один параметризованный запрос ($queryRawUnsafe, интерполяция только
// параметра организации — SQL-инъекция невозможна).
import { getDb } from "../../../../server/db/client";
import { requireSession } from "../../../../server/auth/session";

type Row = {
  total: number;
  awaiting: number;
  new_today: number;
  answered: number;
  answered_within_hour: number;
  avg_first_response_seconds: number | null;
};

export async function GET(request: Request): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;

  const db = getDb();
  // Ожидают ответа: последнее сообщение диалога — входящее (LATERAL, как в
  // списке диалогов). SLA первого ответа: (первый OUT − первый IN) по диалогам,
  // где есть оба направления.
  const [row] = await db.$queryRawUnsafe<Row[]>(
    `WITH conv AS (
       SELECT c.id, c."organizationId"
       FROM "Conversation" c
       WHERE c."organizationId" = $1
     ),
     last_msg AS (
       SELECT DISTINCT ON (m."conversationId") m."conversationId", m."direction"
       FROM "Message" m
       JOIN conv ON conv.id = m."conversationId"
       ORDER BY m."conversationId", m."createdAt" DESC, m.id DESC
     ),
     first_in AS (
       SELECT m."conversationId", MIN(m."createdAt") AS at
       FROM "Message" m
       JOIN conv ON conv.id = m."conversationId"
       WHERE m."direction" = 'IN'
       GROUP BY m."conversationId"
     ),
     first_out AS (
       SELECT m."conversationId", MIN(m."createdAt") AS at
       FROM "Message" m
       JOIN conv ON conv.id = m."conversationId"
       WHERE m."direction" = 'OUT'
       GROUP BY m."conversationId"
     )
     SELECT
       (SELECT COUNT(*)::int FROM conv) AS total,
       (SELECT COUNT(*)::int FROM last_msg WHERE "direction" = 'IN') AS awaiting,
       (SELECT COUNT(*)::int
          FROM first_in fi
          WHERE fi.at >= date_trunc('day', now())) AS new_today,
       (SELECT COUNT(*)::int
          FROM first_in fi JOIN first_out fo ON fo."conversationId" = fi."conversationId") AS answered,
       (SELECT COUNT(*)::int
          FROM first_in fi JOIN first_out fo ON fo."conversationId" = fi."conversationId"
          WHERE fo.at - fi.at <= interval '1 hour') AS answered_within_hour,
       (SELECT AVG(EXTRACT(EPOCH FROM (fo.at - fi.at)))
          FROM first_in fi JOIN first_out fo ON fo."conversationId" = fi."conversationId") AS avg_first_response_seconds`,
    session.data.organization.id,
  );

  const answered = row?.answered ?? 0;
  const withinHour = row?.answered_within_hour ?? 0;

  return Response.json({
    total: row?.total ?? 0,
    awaiting: row?.awaiting ?? 0,
    newToday: row?.new_today ?? 0,
    // Среднее время первого ответа — только по диалогам с ответом; null, если
    // отвеченных диалогов ещё нет.
    avgFirstResponseMinutes: row?.avg_first_response_seconds != null
      ? Math.round((row.avg_first_response_seconds / 60) * 10) / 10
      : null,
    // Доля диалогов с первым ответом ≤ 1 часа; null, если отвеченных нет.
    sla1hPercent: answered > 0 ? Math.round((withinHour / answered) * 100) : null,
  });
}
