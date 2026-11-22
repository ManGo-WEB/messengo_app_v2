// Список подключений организации (план B5 п.1; D3 — время последнего события).
import { getDb } from "../../../server/db/client";
import { requireSession } from "../../../server/auth/session";

export async function GET(request: Request): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const orgId = session.data.organization.id;
  const connections = await getDb().channelConnection.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "asc" },
    select: { id: true, type: true, status: true, displayName: true, externalId: true, createdAt: true },
  });
  // время последнего события канала (план D3 п.1) — одним агрегатом по организации
  const lastEvents = await getDb().inboundEvent.groupBy({
    by: ["connectionId"],
    where: { organizationId: orgId, connectionId: { in: connections.map((c) => c.id) } },
    _max: { createdAt: true },
  });
  const lastEventByConnection = new Map(lastEvents.map((row) => [row.connectionId, row._max.createdAt]));

  return Response.json({
    connections: connections.map((connection) => ({
      id: connection.id,
      type: connection.type,
      status: connection.status,
      externalName: connection.displayName ?? connection.externalId,
      createdAt: connection.createdAt.toISOString(),
      lastEventAt: lastEventByConnection.get(connection.id)?.toISOString() ?? null,
    })),
  });
}
