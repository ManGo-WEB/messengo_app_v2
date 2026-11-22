// Подключение тестового канала (план C4/D3 п.4): dev-only, создаёт сразу ACTIVE
// подключение — используется e2e-сценариями и проверкой каналов на dev-стенде.
import { getDb } from "../../../../../server/db/client";
import { requireSession } from "../../../../../server/auth/session";
import { testingAdapter } from "../../../../../server/channels/testing";
import { ChannelError } from "../../../../../server/channels/adapter";
import { checkOrigin, errorResponse } from "../../../../../server/auth/validate";

export async function POST(request: Request): Promise<Response> {
  // TESTING-канал выключен в production (план B0 п.6) — и на уровне роута тоже
  if (process.env.NODE_ENV === "production") {
    return Response.json({ message: "Подключение не найдено." }, { status: 404 });
  }
  const originError = checkOrigin(request);
  if (originError) return originError;
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  try {
    const result = await testingAdapter.initiateConnect(session.data.organization.id, {});
    if (result.status !== "ACTIVE" || !result.connection) {
      throw new ChannelError("TESTING_CONNECT_FAILED", 500);
    }
    const connection = await getDb().channelConnection.findUnique({ where: { id: result.connection.id } });
    if (!connection) throw new ChannelError("TESTING_CONNECT_FAILED", 500);
    return Response.json(
      { connection: { id: connection.id, type: connection.type, status: connection.status } },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
