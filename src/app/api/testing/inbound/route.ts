// Dev-only ручка (план B0 п.6): принимает события TESTING-канала и пишет их
// в общий пайплайн приёма. В production выключена.
//
// Формат: { connectionId?: string, organizationId?: string, events: [...] }
// Если подключение не найдено — создаётся автоматически (при необходимости
// и организация «Организация для тестов»), чтобы можно было вручную создать
// диалог без реального мессенджера.
import { getAdapter } from "../../../../server/channels/registry";
import { handleInboundEvents } from "../../../../server/channels/pipeline";
import { testingAdapter } from "../../../../server/channels/testing";
import { ChannelError } from "../../../../server/channels/adapter";
import { getDb } from "../../../../server/db/client";

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ message: "Не найдено." }, { status: 404 });
  }
  const adapter = getAdapter("TESTING");
  if (!adapter) return Response.json({ message: "TESTING-канал выключен." }, { status: 404 });

  let body: { connectionId?: unknown; organizationId?: unknown; events?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ message: "Некорректный JSON." }, { status: 400 });
  }

  try {
    const db = getDb();
    // C4: при указанном organizationId ищем подключение именно этой организации —
    // глобальный поиск подхватил бы чужое подключение и записал бы диалог не в ту
    // организацию. Без organizationId — прежнее поведение (первое активное TESTING).
    const requestedOrganizationId =
      typeof body.organizationId === "string" && body.organizationId ? body.organizationId : null;
    let connection = requestedOrganizationId
      ? await db.channelConnection.findFirst({
          where: { type: "TESTING", status: "ACTIVE", organizationId: requestedOrganizationId },
        })
      : typeof body.connectionId === "string" && body.connectionId
        ? await db.channelConnection.findUnique({ where: { id: body.connectionId } })
        : await db.channelConnection.findFirst({ where: { type: "TESTING", status: "ACTIVE" } });

    if (!connection) {
      const organizationId = requestedOrganizationId ?? (await db.organization.create({ data: { name: "Организация для тестов" } })).id;
      const connected = await testingAdapter.initiateConnect(organizationId, {});
      if (connected.status !== "ACTIVE") throw new ChannelError("CONNECTION_NOT_FOUND", 404);
      connection = connected.connection;
    }

    const events = await adapter.parseWebhook(connection, request.headers, body);
    const result = await handleInboundEvents(connection, events);
    return Response.json({ connectionId: connection.id, ...result });
  } catch (error) {
    if (error instanceof ChannelError) {
      return Response.json({ message: error.code }, { status: error.status });
    }
    console.error("testing/inbound: ошибка", error instanceof Error ? error.message : error);
    return Response.json({ message: "Внутренняя ошибка." }, { status: 500 });
  }
}
