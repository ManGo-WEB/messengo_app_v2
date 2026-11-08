// Флоу подключения VK (план B1): OAuth c PKCE через id.vk.ru.
// Связку state↔verifier держим в HttpOnly-печеньке (10 минут), как nonce в V1.
import { requireSession } from "../../../../../server/auth/session";
import { ChannelError } from "../../../../../server/channels/adapter";
import { buildUserAuthorizeUrl, vkPkce, vkEnv } from "../../../../../server/channels/vk";
import { checkOrigin } from "../../../../../server/auth/validate";

export type VkOauthCookie = {
  purpose: "user" | "community";
  state: string;
  verifier?: string;
  connectionId?: string;
  groupId?: number;
};

export const VK_OAUTH_COOKIE = "vk_oauth";

export function vkOauthCookie(value: VkOauthCookie): string {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${VK_OAUTH_COOKIE}=${body}; Path=/api/channels/vk/callback; HttpOnly; SameSite=Lax; Max-Age=600${
    process.env.NODE_ENV === "production" ? "; Secure" : ""
  }`;
}

export function vkOauthClearCookie(): string {
  return `${VK_OAUTH_COOKIE}=; Path=/api/channels/vk/callback; HttpOnly; SameSite=Lax; Max-Age=0${
    process.env.NODE_ENV === "production" ? "; Secure" : ""
  }`;
}

export function readVkOauthCookie(request: Request): VkOauthCookie | null {
  const cookie = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${VK_OAUTH_COOKIE}=`));
  if (!cookie) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cookie.slice(VK_OAUTH_COOKIE.length + 1), "base64url").toString()) as VkOauthCookie;
    if (typeof parsed.state !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(parsed.state)) return null;
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
    vkEnv(); // проверяем, что VK_APP_ID/SECRET/REDIRECT_URL заданы
    const { state, verifier } = vkPkce();
    const url = buildUserAuthorizeUrl({ state, verifier });
    return Response.json(
      { url },
      { headers: { "Set-Cookie": vkOauthCookie({ purpose: "user", state, verifier }) } },
    );
  } catch (error) {
    if (error instanceof ChannelError) {
      return Response.json({ message: error.code }, { status: error.status });
    }
    throw error;
  }
}
