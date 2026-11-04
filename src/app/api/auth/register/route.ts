import { hashPassword } from "better-auth/crypto";
import { getDb } from "../../../../server/db/client";
import {
  checkOrigin,
  errorResponse,
  isUniqueViolation,
  parseEmail,
  parseName,
  parsePassword,
  readJsonBody,
} from "../../../../server/auth/validate";

// Регистрация: User и его Organization создаются в одной транзакции;
// пароль хранится только хешем в Account (credential-провайдер Better Auth).
export async function POST(request: Request): Promise<Response> {
  const originError = checkOrigin(request);
  if (originError) return originError;
  try {
    const body = await readJsonBody(request);
    const email = parseEmail(body.email);
    const password = parsePassword(body.password);
    const name = parseName(typeof body.name === "string" && body.name.trim() ? body.name : "Администратор");
    const organizationName =
      typeof body.organizationName === "string" && body.organizationName.trim()
        ? body.organizationName.trim().slice(0, 100)
        : `${name} — организация`;

    const db = getDb();
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) return Response.json({ message: "Пользователь с таким email уже зарегистрирован." }, { status: 409 });

    const passwordHash = await hashPassword(password);
    const created = await db.$transaction(async (tx) => {
      const organization = await tx.organization.create({ data: { name: organizationName } });
      const user = await tx.user.create({ data: { email, name, organizationId: organization.id } });
      await tx.account.create({
        data: { accountId: user.id, providerId: "credential", userId: user.id, password: passwordHash },
      });
      return { organization, user };
    });

    return Response.json(
      {
        user: { id: created.user.id, email: created.user.email, name: created.user.name, role: created.user.role },
        organization: { id: created.organization.id, name: created.organization.name },
      },
      { status: 201 },
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return Response.json({ message: "Пользователь с таким email уже зарегистрирован." }, { status: 409 });
    }
    return errorResponse(error);
  }
}
