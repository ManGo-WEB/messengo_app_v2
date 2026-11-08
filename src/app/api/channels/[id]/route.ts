// Отключение подключения (план B5 п.2): статус DISCONNECTED, секреты затираются
// (шифр-текст → пустое значение). Для Meta — предлагается флоу удаления данных
// (B4): создаётся запрос и возвращается ссылка на страницу подтверждения.
import { randomBytes } from "node:crypto";
import { Prisma } from "../../../../generated/prisma/client";
import { getDb } from "../../../../server/db/client";
import { requireSession } from "../../../../server/auth/session";
import { disconnectTelegramBot } from "../../../../server/channels/telegram-bot";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const { id } = await params;
  const db = getDb();
  // изоляция тенантов: чужое/несуществующее подключение неотличимо — 404
  const connection = await db.channelConnection.findUnique({ where: { id } });
  if (!connection || connection.organizationId !== session.data.organization.id) {
    return Response.json({ message: "Подключение не найдено." }, { status: 404 });
  }

  if (connection.type === "TELEGRAM_BOT") {
    // deleteWebhook + DISCONNECTED + секреты затёрты (механика B2)
    await disconnectTelegramBot(connection);
  } else {
    await db.channelConnection.update({
      where: { id: connection.id },
      data: { status: "DISCONNECTED", config: Prisma.JsonNull },
    });
  }

  let dataDeletionUrl: string | undefined;
  if (connection.type === "FACEBOOK" || connection.type === "INSTAGRAM") {
    const code = randomBytes(16).toString("hex");
    await db.metaDeletionRequest.create({ data: { code, connectionId: connection.id } });
    dataDeletionUrl = `${process.env.AUTH_BASE_URL ?? "http://localhost:3000"}/api/meta/data-deletion/${code}`;
  }

  return Response.json({ status: "DISCONNECTED", ...(dataDeletionUrl ? { dataDeletionUrl } : {}) });
}
