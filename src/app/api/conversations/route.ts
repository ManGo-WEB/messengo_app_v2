// Список диалогов организации. Минимальная реализация (план C4: сценарий e2e
// должен найти диалог); фильтры, поиск и пагинация добавляются в D2 п.4.
import { getDb } from "../../../server/db/client";
import { requireSession } from "../../../server/auth/session";

export async function GET(request: Request): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const conversations = await getDb().conversation.findMany({
    where: { organizationId: session.data.organization.id },
    // lastMessageAt — время последнего входящего (ставит пайплайн приёма B0);
    // в Postgres DESC ставит NULL первыми, поэтому nulls last.
    orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }],
    take: 100, // простой лимит вместо пагинации (появится в D2)
    select: {
      id: true,
      externalKey: true,
      threadTitle: true,
      lastMessageAt: true,
      connection: { select: { type: true, status: true } },
      contact: { select: { name: true, externalId: true } },
    },
  });
  return Response.json({
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      channel: conversation.connection.type,
      channelStatus: conversation.connection.status,
      contactName: conversation.contact.name,
      contactExternalId: conversation.contact.externalId,
      externalKey: conversation.externalKey,
      threadTitle: conversation.threadTitle,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    })),
  });
}
