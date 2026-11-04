import { getAuth } from "../../../../server/auth/auth";
import {
  checkOrigin,
  errorResponse,
  parseEmail,
  readJsonBody,
} from "../../../../server/auth/validate";

// Запрос ссылки для смены пароля. Ответ всегда одинаковый — независимо от того,
// существует ли email (Better Auth также имитирует генерацию токена по времени,
// чтобы не раскрывать существование аккаунта).
export async function POST(request: Request): Promise<Response> {
  const originError = checkOrigin(request);
  if (originError) return originError;
  try {
    const body = await readJsonBody(request);
    const email = parseEmail(body.email);

    const authResponse = await getAuth().api.requestPasswordReset({
      body: { email, redirectTo: "/login" },
      headers: request.headers,
      asResponse: true,
    });
    if (authResponse.status === 429) {
      return Response.json({ message: "Слишком много запросов. Попробуйте позже." }, { status: 429 });
    }
    if (!authResponse.ok) {
      console.error(
        `forgot-password: ошибка для ${email}: status=${authResponse.status} ${(await authResponse.text()).slice(0, 200)}`,
      );
    }
    return Response.json({ message: "Если аккаунт существует, мы отправили ссылку для смены пароля." });
  } catch (error) {
    return errorResponse(error);
  }
}
