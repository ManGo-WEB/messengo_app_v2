// Статус подключения личного Telegram (план B3): UI опрашивает после deeplink.
import { getDb } from "../../../../../../server/db/client";
import { requireSession } from "../../../../../../server/auth/session";
import { personalConnectStatus } from "../../../../../../server/channels/telegram-personal";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  const connection = await getDb().channelConnection.findUnique({ where: { id } });
  if (!connection || connection.type !== "TELEGRAM_PERSONAL" || connection.organizationId !== session.data.organization.id) {
    return Response.json({ message: "Подключение не найдено." }, { status: 404 });
  }
  return Response.json(await personalConnectStatus(connection));
}
