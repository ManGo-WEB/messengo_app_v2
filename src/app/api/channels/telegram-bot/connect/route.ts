// Подключение Telegram-бота (план B2): { token, channelUsername? } →
// getMe-проверка → (канал+обсуждение при channelUsername) → setWebhook → ACTIVE.
import { requireSession } from "../../../../../server/auth/session";
import { ChannelError } from "../../../../../server/channels/adapter";
import { telegramBotAdapter, telegramToken } from "../../../../../server/channels/telegram-bot";
import { checkOrigin, errorResponse, readJsonBody } from "../../../../../server/auth/validate";

export async function POST(request: Request): Promise<Response> {
  const originError = checkOrigin(request);
  if (originError) return originError;
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  try {
    const body = await readJsonBody(request);
    const token = telegramToken(body.token);
    const channelUsername =
      typeof body.channelUsername === "string" && body.channelUsername ? body.channelUsername : undefined;

    const connected = await telegramBotAdapter.initiateConnect(session.data.organization.id, { token });
    if (connected.status !== "PENDING" || !connected.connectionId) {
      throw new ChannelError("TELEGRAM_CONNECT_FAILED", 500);
    }
    const connection = await telegramBotAdapter.completeConnect(session.data.organization.id, {
      connectionId: connected.connectionId,
      channelUsername,
    });
    return Response.json(
      {
        connection: { id: connection.id, status: connection.status, displayName: connection.displayName },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ChannelError) {
      return Response.json({ message: error.code }, { status: error.status });
    }
    return errorResponse(error);
  }
}
