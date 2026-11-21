// Статус WhatsApp-подключения (план C2 п.1): UI опрашивает после выдачи QR.
// По документации Green API QR обновляется каждые 20 с — опрос раз в 1–2 с
// возвращает актуальный код; authorized → ACTIVE, неавторизован дольше 10 мин → ERROR.
import { getDb } from "../../../../../../server/db/client";
import { requireSession } from "../../../../../../server/auth/session";
import { whatsappConnectStatus } from "../../../../../../server/channels/greenapi/whatsapp";
import { ChannelError } from "../../../../../../server/channels/adapter";
import { errorResponse } from "../../../../../../server/auth/validate";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  const connection = await getDb().channelConnection.findUnique({ where: { id } });
  if (
    !connection ||
    connection.type !== "WHATSAPP" ||
    connection.organizationId !== session.data.organization.id
  ) {
    return Response.json({ message: "Подключение не найдено." }, { status: 404 });
  }
  try {
    return Response.json(await whatsappConnectStatus(connection));
  } catch (error) {
    if (error instanceof ChannelError) {
      return Response.json({ message: error.code }, { status: error.status });
    }
    return errorResponse(error);
  }
}
