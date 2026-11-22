// Черновик композера (план D2 п.2): GET — загрузка, PUT — автосохранение.
// Оптимистичная блокировка по revision (по образцу V1): PUT с устаревшим
// expectedRevision получает 409 и серверную версию черновика — UI показывает
// предупреждение о конфликте правки.
import { getDb } from "../../../../../server/db/client";
import { requireSession } from "../../../../../server/auth/session";
import { errorResponse, readJsonBody, ValidationError } from "../../../../../server/auth/validate";

const MAX_TEXT_LENGTH = 16384; // как у сообщений

type RouteContext = { params: Promise<{ id: string }> };

async function loadConversation(orgId: string, id: string) {
  return getDb().conversation.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true },
  });
}

type DraftRow = { text: string; revision: number };

function findDraft(orgId: string, conversationId: string) {
  // MANUAL — черновик оператора; AI-черновики (фаза E) живут отдельно.
  return getDb().draft.findFirst({
    where: { organizationId: orgId, conversationId, source: "MANUAL" },
    select: { id: true, text: true, revision: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { id } = await context.params;
  const conversation = await loadConversation(session.data.organization.id, id);
  if (!conversation) return Response.json({ message: "Диалог не найден." }, { status: 404 });
  const draft = await findDraft(session.data.organization.id, id);
  const data: DraftRow = { text: draft?.text ?? "", revision: draft?.revision ?? 0 };
  return Response.json(data);
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  try {
    const { id } = await context.params;
    const orgId = session.data.organization.id;
    const body = await readJsonBody(request);
    const text = typeof body.text === "string" ? body.text : "";
    if (text.length > MAX_TEXT_LENGTH) throw new ValidationError(`Черновик длиннее ${MAX_TEXT_LENGTH} символов.`);
    const expectedRevision = Number(body.expectedRevision);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new ValidationError("Некорректная версия черновика.");
    }
    const conversation = await loadConversation(orgId, id);
    if (!conversation) return Response.json({ message: "Диалог не найден." }, { status: 404 });

    const db = getDb();
    const draft = await findDraft(orgId, id);
    if (!draft) {
      if (expectedRevision !== 0) {
        return Response.json({ message: "Конфликт черновика.", draft: { text: "", revision: 0 } }, { status: 409 });
      }
      const created = await db.draft.create({
        data: { organizationId: orgId, conversationId: id, text, revision: 1, source: "MANUAL" },
        select: { text: true, revision: true },
      });
      return Response.json(created satisfies DraftRow);
    }
    if (draft.revision !== expectedRevision) {
      return Response.json({ message: "Конфликт черновика.", draft: { text: draft.text, revision: draft.revision } }, { status: 409 });
    }
    const updated = await db.draft.update({
      where: { id: draft.id },
      data: { text, revision: draft.revision + 1 },
      select: { text: true, revision: true },
    });
    return Response.json(updated satisfies DraftRow);
  } catch (error) {
    return errorResponse(error);
  }
}
