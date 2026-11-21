// Ввод пароля 2FA для MAX-подключения (план C3 п.2, КП: PENDING_2FA → ввод кода
// → ACTIVE). Пароль отправляется методом sendAuthorizationPassword; результат
// пробрасывается оператору (success / fail + reason).
import { getDb } from "../../../../../../server/db/client";
import { requireSession } from "../../../../../../server/auth/session";
import { submitMaxTwoFaPassword } from "../../../../../../server/channels/greenapi/max";
import { ChannelError } from "../../../../../../server/channels/adapter";
import { checkOrigin, errorResponse } from "../../../../../../server/auth/validate";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const originError = checkOrigin(request);
  if (originError) return originError;
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  const connection = await getDb().channelConnection.findUnique({ where: { id } });
  if (!connection || connection.type !== "MAX" || connection.organizationId !== session.data.organization.id) {
    return Response.json({ message: "Подключение не найдено." }, { status: 404 });
  }
  let body: { password?: unknown };
  try {
    body = (await request.json()) as { password?: unknown };
  } catch {
    return Response.json({ message: "Некорректный JSON." }, { status: 400 });
  }
  try {
    const result = await submitMaxTwoFaPassword(connection, typeof body.password === "string" ? body.password : "");
    return Response.json(result);
  } catch (error) {
    if (error instanceof ChannelError) {
      return Response.json({ message: error.code }, { status: error.status });
    }
    return errorResponse(error);
  }
}
