// История диалога и отправка исходящего сообщения. Минимальная реализация
// (план C4: сценарий e2e отправляет ответ и наблюдает статус SENT); полные
// версии (пагинация, черновики, SSE-статусы) добавляются в D2 п.2–4.
//
// Отправка = Message(direction=OUT, status=PENDING) + OutboxJob(type=тип
// канала подключения) в одной транзакции; воркер (A4) забирает задание,
// вызывает адаптер канала и переводит сообщение в SENT/FAILED/UNKNOWN.
import { getDb } from "../../../../../server/db/client";
import { requireSession } from "../../../../../server/auth/session";
import { checkOrigin, errorResponse, readJsonBody, ValidationError } from "../../../../../server/auth/validate";

const MAX_TEXT_LENGTH = 16384; // как в TESTING-адаптере (B0); лимиты каналов — на стороне адаптеров

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { id } = await context.params;
  const db = getDb();
  // Изоляция тенантов: чужой диалог организации неотличим от отсутствующего.
  const conversation = await db.conversation.findFirst({
    where: { id, organizationId: session.data.organization.id },
    select: { id: true },
  });
  if (!conversation) return Response.json({ message: "Диалог не найден." }, { status: 404 });

  const messages = await db.message.findMany({
    where: { conversationId: id, organizationId: session.data.organization.id },
    orderBy: { createdAt: "asc" },
    take: 200, // простой лимит вместо пагинации (появится в D2)
    select: { id: true, direction: true, text: true, status: true, externalId: true, createdAt: true },
  });
  return Response.json({
    messages: messages.map((message) => ({
      id: message.id,
      direction: message.direction,
      text: message.text,
      status: message.status,
      externalId: message.externalId,
      createdAt: message.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const originError = checkOrigin(request);
  if (originError) return originError;
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim() || text.length > MAX_TEXT_LENGTH) {
      throw new ValidationError("Введите текст сообщения (до 16384 символов).");
    }

    const db = getDb();
    // Изоляция тенантов: чужой диалог организации неотличим от отсутствующего.
    const conversation = await db.conversation.findFirst({
      where: { id, organizationId: session.data.organization.id },
      select: { connection: { select: { type: true } } },
    });
    if (!conversation) return Response.json({ message: "Диалог не найден." }, { status: 404 });

    const created = await db.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          organizationId: session.data.organization.id,
          conversationId: id,
          direction: "OUT",
          text,
          status: "PENDING",
        },
      });
      const job = await tx.outboxJob.create({
        data: { organizationId: session.data.organization.id, messageId: message.id, type: conversation.connection.type },
      });
      return { message, jobId: job.id };
    });

    return Response.json(
      {
        message: {
          id: created.message.id,
          direction: created.message.direction,
          text: created.message.text,
          status: created.message.status,
          createdAt: created.message.createdAt.toISOString(),
        },
        jobId: created.jobId,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
