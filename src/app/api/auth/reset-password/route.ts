import { getAuth } from "../../../../server/auth/auth";
import {
  checkOrigin,
  errorResponse,
  parsePassword,
  readJsonBody,
} from "../../../../server/auth/validate";

// Установка нового пароля по одноразовому токену из письма. Better Auth
// потребляет токен и (revokeSessionsOnPasswordReset) гасит все сессии пользователя.
export async function POST(request: Request): Promise<Response> {
  const originError = checkOrigin(request);
  if (originError) return originError;
  try {
    const body = await readJsonBody(request);
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token || token.length > 256) {
      return Response.json({ message: "Ссылка недействительна или истекла. Запросите новую." }, { status: 400 });
    }
    const newPassword = parsePassword(body.newPassword);

    const authResponse = await getAuth().api.resetPassword({
      body: { token, newPassword },
      headers: request.headers,
      asResponse: true,
    });
    if (authResponse.status === 429) {
      return Response.json({ message: "Слишком много запросов. Попробуйте позже." }, { status: 429 });
    }
    if (!authResponse.ok) {
      return Response.json(
        { message: "Ссылка недействительна или истекла. Запросите новую." },
        { status: 400 },
      );
    }
    return Response.json({ message: "Пароль изменён. Войдите с новым паролем." });
  } catch (error) {
    return errorResponse(error);
  }
}
