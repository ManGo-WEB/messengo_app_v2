// Список сообществ администратора (план B1): использует user-token,
// сохранённый в PENDING-подключении после user-OAuth.
import { getDb } from "../../../../../server/db/client";
import { requireSession } from "../../../../../server/auth/session";
import { ChannelError } from "../../../../../server/channels/adapter";
import { openConfig } from "../../../../../server/secrets/store";
import { listAdminCommunities } from "../../../../../server/channels/vk";

export async function GET(request: Request): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const connectionId = new URL(request.url).searchParams.get("connectionId");
  if (!connectionId) return Response.json({ message: "connectionId обязателен." }, { status: 400 });
  const connection = await getDb().channelConnection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.type !== "VK" || connection.organizationId !== session.data.organization.id) {
    return Response.json({ message: "Подключение не найдено." }, { status: 404 });
  }
  const config = openConfig(connection) as { userToken?: string };
  if (typeof config.userToken !== "string") {
    throw new ChannelError("VK_INVALID_STATE", 403);
  }
  const offset = Number(new URL(request.url).searchParams.get("offset") ?? "0");
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) {
    return Response.json({ message: "Некорректный offset." }, { status: 400 });
  }
  const page = await listAdminCommunities(config.userToken);
  return Response.json(page);
}
