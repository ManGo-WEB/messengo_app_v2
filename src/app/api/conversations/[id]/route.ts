// Информация о диалоге (план D2 п.1: карточка контакта): контакт, канал
// подключения, тема ветки. Изоляция тенантов: чужой диалог → 404.
import { getDb } from "../../../../server/db/client";
import { requireSession } from "../../../../server/auth/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { id } = await context.params;
  const conversation = await getDb().conversation.findFirst({
    where: { id, organizationId: session.data.organization.id },
    select: {
      id: true,
      externalKey: true,
      threadTitle: true,
      lastMessageAt: true,
      contact: { select: { name: true, externalId: true } },
      connection: { select: { type: true, status: true, displayName: true, externalId: true } },
    },
  });
  if (!conversation) return Response.json({ message: "Диалог не найден." }, { status: 404 });

  return Response.json({
    conversation: {
      id: conversation.id,
      externalKey: conversation.externalKey,
      threadTitle: conversation.threadTitle,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      contact: conversation.contact,
      connection: {
        type: conversation.connection.type,
        status: conversation.connection.status,
        name: conversation.connection.displayName ?? conversation.connection.externalId,
      },
    },
  });
}
