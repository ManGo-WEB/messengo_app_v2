// Диагностика подключения (план B5 п.3): время последнего входящего,
// последняя попытка отправки, число исчерпанных заданий.
import { getDb } from "../../../../../server/db/client";
import { requireSession } from "../../../../../server/auth/session";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  const db = getDb();
  const connection = await db.channelConnection.findUnique({
    where: { id },
    select: { id: true, organizationId: true, type: true, status: true, displayName: true, externalId: true },
  });
  if (!connection || connection.organizationId !== session.data.organization.id) {
    return Response.json({ message: "Подключение не найдено." }, { status: 404 });
  }

  const [lastInbound, lastSend, failedJobs] = await Promise.all([
    db.inboundEvent.findFirst({
      where: { connectionId: id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    db.sendAttempt.findFirst({
      where: { outboxJob: { message: { conversation: { connectionId: id } } } },
      orderBy: { createdAt: "desc" },
      select: { result: true, detail: true, createdAt: true },
    }),
    db.outboxJob.count({
      where: { status: "FAILED", message: { conversation: { connectionId: id } } },
    }),
  ]);

  return Response.json({
    id: connection.id,
    type: connection.type,
    status: connection.status,
    externalName: connection.displayName ?? connection.externalId,
    lastInboundAt: lastInbound?.createdAt.toISOString() ?? null,
    lastSend: lastSend
      ? { result: lastSend.result, detail: lastSend.detail, createdAt: lastSend.createdAt.toISOString() }
      : null,
    failedJobs,
  });
}
