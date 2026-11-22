// Этапы воронки организации (дополнение D5 по замечанию владельца:
// настраиваемые колонки). GET — список по порядку (пустой организации при
// первом обращении засеиваются 7 дефолтовых этапов из прототипа); POST —
// новая колонка в конец; PUT — новый порядок (массив id по позициям).
// Сделки пока моки на клиенте — здесь только конфигурация колонок.
import { getDb } from "../../../../server/db/client";
import { requireSession } from "../../../../server/auth/session";
import {
  ValidationError,
  checkOrigin,
  errorResponse,
  parseName,
  readJsonBody,
} from "../../../../server/auth/validate";
import { DEFAULT_STAGES, parseStageColor } from "./shared";

export async function GET(request: Request): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const db = getDb();
  const organizationId = session.data.organization.id;

  // Первый вход в воронку: засеиваем дефолтные этапы прототипа (идемпотентно
  // внутри транзакции — параллельные GET не задвоят, если один успел раньше).
  const existing = await db.funnelStage.findMany({ where: { organizationId }, select: { id: true } });
  if (existing.length === 0) {
    await db.$transaction(async (tx) => {
      const count = await tx.funnelStage.count({ where: { organizationId } });
      if (count === 0) {
        await tx.funnelStage.createMany({
          data: DEFAULT_STAGES.map((stage, index) => ({
            organizationId,
            label: stage.label,
            color: stage.color,
            position: index + 1,
          })),
        });
      }
    });
  }

  const stages = await db.funnelStage.findMany({
    where: { organizationId },
    orderBy: { position: "asc" },
    select: { id: true, label: true, color: true, position: true },
  });
  return Response.json({ stages });
}

export async function POST(request: Request): Promise<Response> {
  const originError = checkOrigin(request);
  if (originError) return originError;
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  try {
    const body = await readJsonBody(request);
    const label = parseName(body.label);
    const color = body.color === undefined ? undefined : parseStageColor(body.color);

    const db = getDb();
    const organizationId = session.data.organization.id;
    const last = await db.funnelStage.findFirst({
      where: { organizationId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const stage = await db.funnelStage.create({
      data: {
        organizationId,
        label,
        ...(color !== undefined ? { color } : {}),
        position: (last?.position ?? 0) + 1,
      },
      select: { id: true, label: true, color: true, position: true },
    });
    return Response.json({ stage }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

// Новый порядок колонок: ids — все этапы организации по порядку. Валидируем
// состав (без дублей и лишних), затем пишем позиции 1..n транзакционно.
export async function PUT(request: Request): Promise<Response> {
  const originError = checkOrigin(request);
  if (originError) return originError;
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  try {
    const body = await readJsonBody(request);
    const ids = body.ids;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
      throw new ValidationError("Ожидается массив ids.");
    }
    const organizationId = session.data.organization.id;
    const db = getDb();
    const stages = await db.funnelStage.findMany({
      where: { organizationId },
      select: { id: true },
    });
    const known = new Set(stages.map((s) => s.id));
    const submitted = ids as string[];
    if (submitted.length !== stages.length || new Set(submitted).size !== submitted.length || submitted.some((id) => !known.has(id))) {
      throw new ValidationError("Порядок должен содержать все колонки организации без дублей.");
    }

    await db.$transaction(
      submitted.map((id, index) =>
        db.funnelStage.update({ where: { id }, data: { position: index + 1 } }),
      ),
    );
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
