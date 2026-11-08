// Подключение личного Telegram (план B3): выдаёт deeplink служебного бота.
import { requireSession } from "../../../../../server/auth/session";
import { ChannelError } from "../../../../../server/channels/adapter";
import { telegramPersonalAdapter } from "../../../../../server/channels/telegram-personal";
import { checkOrigin, errorResponse } from "../../../../../server/auth/validate";

export async function POST(request: Request): Promise<Response> {
  const originError = checkOrigin(request);
  if (originError) return originError;
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  try {
    const result = await telegramPersonalAdapter.initiateConnect(session.data.organization.id, {});
    if (result.status !== "PENDING" || !result.deeplink) throw new ChannelError("TELEGRAM_PERSONAL_SETUP_FAILED", 500);
    return Response.json(
      { connectionId: result.connectionId, deeplink: result.deeplink, expiresAt: result.expiresAt },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ChannelError) {
      return Response.json({ message: error.code }, { status: error.status });
    }
    return errorResponse(error);
  }
}
