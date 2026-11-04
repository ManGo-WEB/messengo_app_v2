import { getAuth } from "./auth";
import { getDb } from "../db/client";
import type { User } from "../../generated/prisma/client";

export type SessionData = {
  user: { id: string; email: string; name: string; role: User["role"] };
  organization: { id: string; name: string };
};

export type SessionResult = { ok: true; data: SessionData } | { ok: false; response: Response };

// Единственная точка проверки сессии для защищённых роутов: возвращает данные
// пользователя вместе с организацией либо готовый 401-ответ.
export async function requireSession(request: Request): Promise<SessionResult> {
  const authSession = await getAuth().api.getSession({ headers: request.headers });
  if (!authSession) return unauthorized();
  const user = await getDb().user.findUnique({
    where: { id: authSession.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      organization: { select: { id: true, name: true } },
    },
  });
  if (!user) return unauthorized();
  return { ok: true, data: { user, organization: user.organization } };
}

function unauthorized() {
  return { ok: false as const, response: Response.json({ message: "Требуется вход." }, { status: 401 }) };
}
