// Приём кода Meta OAuth (план B4): обмен на user-token → PENDING-подключение
// с зашифрованным токеном; выбор аккаунта — select-account.
import { getDb } from "../../../../../server/db/client";
import { requireSession } from "../../../../../server/auth/session";
import { ChannelError } from "../../../../../server/channels/adapter";
import { exchangeMetaCode } from "../../../../../server/channels/meta";
import { sealConfig } from "../../../../../server/secrets/store";
import { readMetaOauthCookie } from "../connect/route";

export async function GET(request: Request): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const cookie = readMetaOauthCookie(request);
  const query = new URL(request.url).searchParams;
  const redirect = (code: string) => {
    const url = new URL("/settings/channels", process.env.AUTH_BASE_URL ?? "http://localhost:3000");
    url.searchParams.set("meta", code);
    return new Response(null, { status: 303, headers: { Location: url.href } });
  };
  try {
    if (!cookie) throw new ChannelError("META_INVALID_STATE", 403);
    if (query.get("state") !== cookie.state) throw new ChannelError("META_INVALID_STATE", 403);
    if (query.has("error")) throw new ChannelError(query.get("error") === "access_denied" ? "META_CANCELLED" : "META_AUTH_FAILED", 403);
    const code = query.get("code");
    if (!code || code.length > 4096) throw new ChannelError("META_INVALID_REQUEST", 400);

    const userToken = await exchangeMetaCode(code);
    const connection = await getDb().channelConnection.create({
      data: {
        organizationId: session.data.organization.id,
        type: cookie.platform === "instagram" ? "INSTAGRAM" : "FACEBOOK",
        externalId: "pending",
        status: "PENDING",
      },
    });
    await getDb().channelConnection.update({
      where: { id: connection.id },
      data: { config: sealConfig({ platform: cookie.platform, userToken }, connection.id) as unknown as object },
    });
    return redirect(`connection:${connection.id}`);
  } catch (error) {
    const code = error instanceof ChannelError ? error.code : "META_OPERATION_FAILED";
    return redirect(code);
  }
}
