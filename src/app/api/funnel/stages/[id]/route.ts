// Этап воронки (дополнение D5): переименование/смена цвета (PATCH) и
// удаление колонки (DELETE). Изоляция по организации — чужой/несуществующий
// этап неотличим (404). После удаления позиции оставшихся пересчитываются
// 1..n (без «дыр»).
import { getDb } from "../../../../../server/db/client";
import { requireSession } from "../../../../../server/auth/session";
import {
  ValidationError,
  checkOrigin,
  errorResponse,
  parseName,
  readJsonBody,
} from "../../../../../server/auth/validate";
import { parseStageColor } from "../shared";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const originError = checkOrigin(request);
  if (originError) return originError;
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  try {
    const body = await readJsonBody(request);
    const label = body.label !== undefined ? parseName(body.label) : undefined;
    const color = body.color !== undefined ? parseStageColor(body.color) : undefined;
    if (label === undefined && color === undefined) {
      throw new ValidationError("Нечего обновлять: передайте label и/или color.");
    }

    const db = getDb();
    const organizationId = session.data.organization.id;
    // Сначала проверяем принадлежность организации (условие в where —
    // составной уникальный ключ обновления).
    const updated = await db.funnelStage.updateMany({
      where: { id, organizationId },
      data: {
        ...(label !== undefined ? { label } : {}),
        ...(color !== undefined ? { color } : {}),
      },
    });
    if (updated.count === 0) {
      return Response.json({ message: "Колонка не найдена." }, { status: 404 });
    }
    const stage = await db.funnelStage.findUnique({
      where: { id },
      select: { id: true, label: true, color: true, position: true },
    });
    return Response.json({ stage });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const originError = checkOrigin(request);
  if (originError) return originError;
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  try {
    const db = getDb();
    const organizationId = session.data.organization.id;
    const deleted = await db.funnelStage.deleteMany({ where: { id, organizationId } });
    if (deleted.count === 0) {
      return Response.json({ message: "Колонка не найдена." }, { status: 404 });
    }
    // Пересчёт позиций без «дыр»: 1..n по текущему порядку.
    const remaining = await db.funnelStage.findMany({
      where: { organizationId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    await db.$transaction(
      remaining.map((stage, index) =>
        db.funnelStage.update({ where: { id: stage.id }, data: { position: index + 1 } }),
      ),
    );
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
