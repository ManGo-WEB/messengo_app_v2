import { getAuth } from "../../../../server/auth/auth";
import { checkOrigin, errorResponse, parsePassword, readJsonBody } from "../../../../server/auth/validate";

// Смена пароля оператора (план D5 п.3) — обёртка над Better Auth
// changePassword: проверяет текущий пароль, пишет новый. Текущая сессия
// сохраняется (revokeOtherSessions: false — по умолчанию), прочие сессии
// не трогаем: операторов в организации пока один.
export async function POST(request: Request): Promise<Response> {
  const originError = checkOrigin(request);
  if (originError) return originError;
  try {
    const body = await readJsonBody(request);
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = parsePassword(body.newPassword);
    if (!currentPassword || currentPassword.length > 128) {
      return Response.json({ message: "Укажите текущий пароль." }, { status: 400 });
    }

    const authResponse = await getAuth().api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: false },
      headers: request.headers,
      asResponse: true,
    });
    if (!authResponse.ok) {
      // 400 Better Auth — неверный текущий пароль (или новый не прошёл политику).
      const message = authResponse.status === 400 ? "Текущий пароль указан неверно." : "Не удалось сменить пароль.";
      return Response.json({ message }, { status: authResponse.status });
    }
    const headers = new Headers({ "content-type": "application/json" });
    for (const cookie of authResponse.headers.getSetCookie()) headers.append("set-cookie", cookie);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (error) {
    return errorResponse(error);
  }
}
