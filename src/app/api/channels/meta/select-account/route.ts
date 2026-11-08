// Выбор страницы/IG-аккаунта (план B4): подписка вебхуков + Page Access Token.
import { getDb } from "../../../../../server/db/client";
import { requireSession } from "../../../../../server/auth/session";
import { ChannelError } from "../../../../../server/channels/adapter";
import { openConfig } from "../../../../../server/secrets/store";
import { listMetaAccounts, selectMetaAccount } from "../../../../../server/channels/meta";
import { checkOrigin, errorResponse, readJsonBody } from "../../../../../server/auth/validate";

export async function POST(request: Request): Promise<Response> {
  const originError = checkOrigin(request);
  if (originError) return originError;
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  try {
    const body = await readJsonBody(request);
    const connectionId = typeof body.connectionId === "string" ? body.connectionId : "";
    const pageId = typeof body.pageId === "string" ? body.pageId : "";
    if (!connectionId || !pageId) {
      return Response.json({ message: "Укажите connectionId и pageId." }, { status: 400 });
    }
    const connection = await getDb().channelConnection.findUnique({ where: { id: connectionId } });
    if (
      !connection ||
      !["FACEBOOK", "INSTAGRAM"].includes(connection.type) ||
      connection.organizationId !== session.data.organization.id
    ) {
      return Response.json({ message: "Подключение не найдено." }, { status: 404 });
    }
    const config = openConfig(connection) as { userToken?: string };
    if (typeof config.userToken !== "string") throw new ChannelError("META_INVALID_STATE", 403);
    // страница должна принадлежать аккаунту оператора
    const accounts = await listMetaAccounts(config.userToken);
    const account = accounts.find((item) => item.pageId === pageId);
    if (!account) throw new ChannelError("META_PAGE_NOT_FOUND", 403);

    const updated = await selectMetaAccount(connection, account);
    return Response.json({
      connection: { id: updated.id, status: updated.status, displayName: updated.displayName, externalId: updated.externalId },
    });
  } catch (error) {
    if (error instanceof ChannelError) {
      return Response.json({ message: error.code }, { status: error.status });
    }
    return errorResponse(error);
  }
}
