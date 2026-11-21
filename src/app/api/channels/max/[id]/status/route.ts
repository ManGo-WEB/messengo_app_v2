// Статус MAX-подключения (план C3 п.2): UI опрашивает после выдачи QR.
// По документации MAX QR обновляется каждые 5 с; pendingPassword → twoFaRequired
// (PENDING_2FA): оператор вводит пароль через POST .../twofa.
import { getDb } from "../../../../../../server/db/client";
import { requireSession } from "../../../../../../server/auth/session";
import { maxConnectStatus } from "../../../../../../server/channels/greenapi/max";
import { ChannelError } from "../../../../../../server/channels/adapter";
import { errorResponse } from "../../../../../../server/auth/validate";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  const connection = await getDb().channelConnection.findUnique({ where: { id } });
  if (!connection || connection.type !== "MAX" || connection.organizationId !== session.data.organization.id) {
    return Response.json({ message: "Подключение не найдено." }, { status: 404 });
  }
  try {
    return Response.json(await maxConnectStatus(connection));
  } catch (error) {
    if (error instanceof ChannelError) {
      return Response.json({ message: error.code }, { status: error.status });
    }
    return errorResponse(error);
  }
}
