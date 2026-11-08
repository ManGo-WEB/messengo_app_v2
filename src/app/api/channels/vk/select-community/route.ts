// Выбор сообщества (план B1): проверяем права администратора и отдаём ссылку
// авторизации токена сообщества (oauth.vk.com). Финализация — в callback
// (purpose=community): токен, confirmation-строка, секрет Callback API.
import { getDb } from "../../../../../server/db/client";
import { requireSession } from "../../../../../server/auth/session";
import { ChannelError } from "../../../../../server/channels/adapter";
import { openConfig, sealConfig } from "../../../../../server/secrets/store";
import { buildCommunityAuthorizeUrl, listAdminCommunities, vkPkce } from "../../../../../server/channels/vk";
import { checkOrigin, errorResponse, readJsonBody } from "../../../../../server/auth/validate";
import { vkOauthCookie } from "../connect/route";

export async function POST(request: Request): Promise<Response> {
  const originError = checkOrigin(request);
  if (originError) return originError;
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  try {
    const body = await readJsonBody(request);
    const connectionId = typeof body.connectionId === "string" ? body.connectionId : "";
    const groupId = Number(body.groupId);
    const senderName = typeof body.senderName === "string" && body.senderName.trim() ? body.senderName.trim().slice(0, 100) : undefined;
    if (!connectionId || !Number.isSafeInteger(groupId) || groupId < 1) {
      return Response.json({ message: "Укажите connectionId и groupId." }, { status: 400 });
    }
    const connection = await getDb().channelConnection.findUnique({ where: { id: connectionId } });
    if (!connection || connection.type !== "VK" || connection.organizationId !== session.data.organization.id) {
      return Response.json({ message: "Подключение не найдено." }, { status: 404 });
    }
    const config = openConfig(connection) as { userToken?: string; senderName?: string };
    if (typeof config.userToken !== "string") throw new ChannelError("VK_INVALID_STATE", 403);

    // оператор должен быть администратором выбранного сообщества (по V1)
    let offset: number | null = 0;
    let isAdmin = false;
    for (let pages = 0; offset !== null && pages < 1000; pages++) {
      const page = await listAdminCommunities(config.userToken);
      if (page.items.some((group) => group.id === groupId)) {
        isAdmin = true;
        break;
      }
      offset = page.nextOffset;
    }
    if (!isAdmin) throw new ChannelError("VK_NOT_ADMIN", 403);
    if (senderName) {
      // пересохраняем зашифрованный config, а не поверх него
      await getDb().channelConnection.update({
        where: { id: connection.id },
        data: { config: sealConfig({ ...config, senderName }, connection.id) as unknown as object },
      });
    }

    const { state } = vkPkce();
    const url = buildCommunityAuthorizeUrl({ state, groupId });
    return Response.json(
      { url },
      {
        headers: {
          "Set-Cookie": vkOauthCookie({ purpose: "community", state, connectionId, groupId }),
        },
      },
    );
  } catch (error) {
    if (error instanceof ChannelError) {
      return Response.json({ message: error.code }, { status: error.status });
    }
    return errorResponse(error);
  }
}
