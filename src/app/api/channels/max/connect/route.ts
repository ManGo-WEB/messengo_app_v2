// Подключение MAX через Green API (план C3): инстанс (Developer — креды из
// params; партнёрский — создаётся по ключу из окружения) и первый QR-код.
import { requireSession } from "../../../../../server/auth/session";
import { ChannelError } from "../../../../../server/channels/adapter";
import { maxAdapter } from "../../../../../server/channels/greenapi/max";
import { checkOrigin, errorResponse } from "../../../../../server/auth/validate";

export async function POST(request: Request): Promise<Response> {
  const originError = checkOrigin(request);
  if (originError) return originError;
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  let params: Record<string, unknown> = {};
  try {
    params = (await request.json()) as Record<string, unknown>;
  } catch {
    params = {};
  }
  try {
    const result = await maxAdapter.initiateConnect(session.data.organization.id, params);
    if (result.status !== "PENDING" || !result.connectionId) {
      throw new ChannelError("GREENAPI_SETUP_FAILED", 500);
    }
    return Response.json(
      {
        connectionId: result.connectionId,
        qr: result.qr ?? null,
        expiresAt: result.expiresAt,
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
