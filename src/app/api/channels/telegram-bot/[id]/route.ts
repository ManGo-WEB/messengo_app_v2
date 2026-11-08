// Отключение Telegram-бота (план B2): deleteWebhook + DISCONNECTED, секреты затёрты.
import { getDb } from "../../../../../server/db/client";
import { requireSession } from "../../../../../server/auth/session";
import { ChannelError } from "../../../../../server/channels/adapter";
import { disconnectTelegramBot } from "../../../../../server/channels/telegram-bot";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  const connection = await getDb().channelConnection.findUnique({ where: { id } });
  if (!connection || connection.type !== "TELEGRAM_BOT" || connection.organizationId !== session.data.organization.id) {
    return Response.json({ message: "Подключение не найдено." }, { status: 404 });
  }
  try {
    await disconnectTelegramBot(connection);
    return Response.json({ status: "DISCONNECTED" });
  } catch (error) {
    if (error instanceof ChannelError) {
      return Response.json({ message: error.code }, { status: error.status });
    }
    throw error;
  }
}
