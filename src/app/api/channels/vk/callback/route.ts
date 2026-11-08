// Приём кода от VK (план B1). Два захода (по purpose в печеньке):
//  «user»     — обмен кода на user-token, создаётся PENDING-подключение;
//  «community»— обмен кода на токен сообщества, настройка Callback API → ACTIVE.
import { getDb } from "../../../../../server/db/client";
import { requireSession } from "../../../../../server/auth/session";
import { ChannelError } from "../../../../../server/channels/adapter";
import { openConfig, sealConfig } from "../../../../../server/secrets/store";
import {
  configureCommunity,
  exchangeCommunityCode,
  exchangeUserCode,
  listAdminCommunities,
} from "../../../../../server/channels/vk";
import { readVkOauthCookie, vkOauthClearCookie } from "../connect/route";

function redirect(code: string, clearCookie = false): Response {
  const url = new URL("/settings/channels", process.env.AUTH_BASE_URL ?? "http://localhost:3000");
  url.searchParams.set("vk", code);
  return new Response(null, {
    status: 303,
    headers: { Location: url.href, ...(clearCookie ? { "Set-Cookie": vkOauthClearCookie() } : {}) },
  });
}

export async function GET(request: Request): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const cookie = readVkOauthCookie(request);
  const query = new URL(request.url).searchParams;
  try {
    if (!cookie) throw new ChannelError("VK_INVALID_STATE", 403);
    if (query.get("state") !== cookie.state) throw new ChannelError("VK_INVALID_STATE", 403);
    if (query.has("error")) {
      throw new ChannelError(query.get("error") === "access_denied" ? "VK_CANCELLED" : "VK_AUTH_FAILED", 403);
    }
    const code = query.get("code");
    if (!code || code.length > 4096) throw new ChannelError("VK_INVALID_REQUEST", 400);

    if (cookie.purpose === "user") {
      const deviceId = query.get("device_id");
      if (!deviceId || deviceId.length > 4096 || !cookie.verifier) throw new ChannelError("VK_INVALID_REQUEST", 400);
      const userToken = await exchangeUserCode({ code, state: cookie.state, verifier: cookie.verifier, deviceId });
      const connection = await getDb().channelConnection.create({
        data: { organizationId: session.data.organization.id, type: "VK", externalId: "pending", status: "PENDING" },
      });
      await getDb().channelConnection.update({
        where: { id: connection.id },
        data: { config: sealConfig({ userToken, deviceId }, connection.id) as unknown as object },
      });
      return redirect(`connection:${connection.id}`);
    }

    // purpose === "community": финальный шаг — токен сообщества и Callback API
    if (!cookie.connectionId || !Number.isSafeInteger(cookie.groupId)) {
      throw new ChannelError("VK_INVALID_REQUEST", 400);
    }
    const connection = await getDb().channelConnection.findUnique({ where: { id: cookie.connectionId } });
    if (!connection || connection.type !== "VK" || connection.organizationId !== session.data.organization.id) {
      throw new ChannelError("NOT_FOUND", 404);
    }
    const userConfig = openConfig(connection) as { userToken?: string };
    if (typeof userConfig.userToken !== "string") throw new ChannelError("VK_INVALID_STATE", 403);
    const admin = await listAdminCommunities(userConfig.userToken);
    const community = admin.items.find((group) => group.id === cookie.groupId);
    if (!community) throw new ChannelError("VK_NOT_ADMIN", 403);

    const communityToken = await exchangeCommunityCode(code);
    const previous = openConfig(connection) as { senderName?: string };
    const config = await configureCommunity(connection.id, cookie.groupId!, communityToken);
    await getDb().channelConnection.update({
      where: { id: connection.id },
      data: {
        externalId: String(config.groupId),
        status: "ACTIVE",
        displayName: community.name,
        config: sealConfig({ ...config, ...(previous.senderName ? { senderName: previous.senderName } : {}) }, connection.id) as unknown as object,
      },
    });
    return redirect("connected", true);
  } catch (error) {
    const code = error instanceof ChannelError ? error.code : "VK_OPERATION_FAILED";
    return redirect(code, true);
  }
}
