// Флоу подключения Meta (план B4): OAuth Facebook Login → страницы → выбор.
import { requireSession } from "../../../../../server/auth/session";
import { ChannelError } from "../../../../../server/channels/adapter";
import { buildMetaAuthorizeUrl, metaEnv, metaState } from "../../../../../server/channels/meta";
import { checkOrigin } from "../../../../../server/auth/validate";

export type MetaOauthCookie = { state: string; platform: "facebook" | "instagram" };
export const META_OAUTH_COOKIE = "meta_oauth";

export function metaOauthCookie(value: MetaOauthCookie): string {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${META_OAUTH_COOKIE}=${body}; Path=/api/channels/meta/callback; HttpOnly; SameSite=Lax; Max-Age=600${
    process.env.NODE_ENV === "production" ? "; Secure" : ""
  }`;
}

export function readMetaOauthCookie(request: Request): MetaOauthCookie | null {
  const cookie = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${META_OAUTH_COOKIE}=`));
  if (!cookie) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cookie.slice(META_OAUTH_COOKIE.length + 1), "base64url").toString()) as MetaOauthCookie;
    if (typeof parsed.state !== "string" || !/^[A-Za-z0-9_-]{20,100}$/.test(parsed.state)) return null;
    if (parsed.platform !== "facebook" && parsed.platform !== "instagram") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const originError = checkOrigin(request);
  if (originError) return originError;
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  try {
    metaEnv();
    const platform = new URL(request.url).searchParams.get("platform") === "instagram" ? "instagram" : "facebook";
    const state = metaState();
    const url = buildMetaAuthorizeUrl(platform, state);
    return Response.json({ url, platform }, { headers: { "Set-Cookie": metaOauthCookie({ state, platform }) } });
  } catch (error) {
    if (error instanceof ChannelError) {
      return Response.json({ message: error.code }, { status: error.status });
    }
    throw error;
  }
}
