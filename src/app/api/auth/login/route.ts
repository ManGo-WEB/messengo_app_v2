import { getAuth } from "../../../../server/auth/auth";
import { getDb } from "../../../../server/db/client";
import {
  ValidationError,
  checkOrigin,
  errorResponse,
  parseEmail,
  readJsonBody,
} from "../../../../server/auth/validate";

// 30 дней — синхронизировано с session.expiresIn в auth.ts
const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30;

export async function POST(request: Request): Promise<Response> {
  const originError = checkOrigin(request);
  if (originError) return originError;
  try {
    const body = await readJsonBody(request);
    const email = parseEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    if (!password || password.length > 128) throw new ValidationError("Проверьте email и пароль.");
    const rememberMe = body.rememberMe === true;

    const authResponse = await getAuth().api.signInEmail({
      body: { email, password },
      headers: request.headers,
      asResponse: true,
    });
    if (authResponse.status === 429) {
      return Response.json({ message: "Слишком много попыток входа. Попробуйте позже." }, { status: 429 });
    }
    if (!authResponse.ok) return Response.json({ message: "Неверный email или пароль." }, { status: 401 });

    const { user: authUser } = (await authResponse.json()) as { user: { id: string } };
    const user = await getDb().user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organization: { select: { id: true, name: true } },
      },
    });
    if (!user) return Response.json({ message: "Неверный email или пароль." }, { status: 401 });

    // «Запомнить меня»: true — персистентная кука на 30 дней, false — сессионная
    // кука без Max-Age, которую браузер удаляет при закрытии.
    const headers = new Headers({ "content-type": "application/json" });
    for (const cookie of authResponse.headers.getSetCookie()) {
      headers.append("set-cookie", rememberCookie(cookie, rememberMe));
    }
    return Response.json(
      { user: { id: user.id, email: user.email, name: user.name, role: user.role }, organization: user.organization },
      { headers },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function rememberCookie(setCookie: string, rememberMe: boolean): string {
  if (!/^better-auth\.session_token/i.test(setCookie)) return setCookie;
  const attributes = setCookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => !/^max-age=/i.test(part) && !/^expires=/i.test(part));
  return rememberMe ? `${attributes.join("; ")}; Max-Age=${REMEMBER_MAX_AGE}` : attributes.join("; ");
}
