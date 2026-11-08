// Список подключений организации (план B5 п.1).
import { getDb } from "../../../server/db/client";
import { requireSession } from "../../../server/auth/session";

export async function GET(request: Request): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const connections = await getDb().channelConnection.findMany({
    where: { organizationId: session.data.organization.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, type: true, status: true, displayName: true, externalId: true, createdAt: true },
  });
  return Response.json({
    connections: connections.map((connection) => ({
      id: connection.id,
      type: connection.type,
      status: connection.status,
      externalName: connection.displayName ?? connection.externalId,
      createdAt: connection.createdAt.toISOString(),
    })),
  });
}
