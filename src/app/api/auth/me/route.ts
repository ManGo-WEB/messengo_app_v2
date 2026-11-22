import { getDb } from "../../../../server/db/client";
import { requireSession } from "../../../../server/auth/session";
import {
  ValidationError,
  errorResponse,
  parseName,
  readJsonBody,
} from "../../../../server/auth/validate";

export async function GET(request: Request): Promise<Response> {
  const session = await requireSession(request);
  return session.ok ? Response.json(session.data) : session.response;
}

// Профиль оператора и организации (план D5 п.3): обновление имени оператора
// и/или названия организации. Email не меняем — смена email требует своего
// потока подтверждения (вне фазы D5).
export async function PATCH(request: Request): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  try {
    const body = await readJsonBody(request);
    const name = body.name !== undefined ? parseName(body.name) : undefined;
    const organizationName =
      body.organizationName !== undefined ? parseName(body.organizationName) : undefined;
    if (name === undefined && organizationName === undefined) {
      throw new ValidationError("Нечего обновлять: передайте name и/или organizationName.");
    }

    const db = getDb();
    if (organizationName !== undefined) {
      await db.organization.update({
        where: { id: session.data.organization.id },
        data: { name: organizationName },
      });
    }
    if (name !== undefined) {
      await db.user.update({
        where: { id: session.data.user.id },
        data: { name },
      });
    }

    // Свежие данные (роль/имя/организация) — той же формы, что GET.
    const user = await db.user.findUnique({
      where: { id: session.data.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organization: { select: { id: true, name: true } },
      },
    });
    if (!user) return Response.json({ message: "Требуется вход." }, { status: 401 });
    return Response.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, organization: user.organization });
  } catch (error) {
    return errorResponse(error);
  }
}
