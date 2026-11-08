// Страницы пользователя Meta (план B4): me/accounts c IG-аккаунтами.
import { getDb } from "../../../../../server/db/client";
import { requireSession } from "../../../../../server/auth/session";
import { ChannelError } from "../../../../../server/channels/adapter";
import { openConfig } from "../../../../../server/secrets/store";
import { listMetaAccounts } from "../../../../../server/channels/meta";

export async function GET(request: Request): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const connectionId = new URL(request.url).searchParams.get("connectionId");
  if (!connectionId) return Response.json({ message: "connectionId обязателен." }, { status: 400 });
  const connection = await getDb().channelConnection.findUnique({ where: { id: connectionId } });
  if (
    !connection ||
    !["FACEBOOK", "INSTAGRAM"].includes(connection.type) ||
    connection.organizationId !== session.data.organization.id
  ) {
    return Response.json({ message: "Подключение не найдено." }, { status: 404 });
  }
  const config = openConfig(connection) as { userToken?: string; platform?: string };
  if (typeof config.userToken !== "string") throw new ChannelError("META_INVALID_STATE", 403);
  const accounts = await listMetaAccounts(config.userToken);
  return Response.json({
    accounts: config.platform === "instagram" ? accounts.filter((account) => account.igAccountId) : accounts,
  });
}
