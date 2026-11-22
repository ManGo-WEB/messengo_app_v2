// Проба сессии для клиентских гейтов (план D2/D6): всегда 200, чтобы
// неавторизованный визит не порождал 401-ошибки в консоли браузера.
// Auth-роуты по-прежнему отдают 401 без сессии — контракт не менялся.
import { getAuth } from "../../../server/auth/auth";

export async function GET(request: Request): Promise<Response> {
  const authSession = await getAuth().api.getSession({ headers: request.headers });
  return Response.json({ authed: Boolean(authSession) });
}
