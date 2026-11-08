// Универсальный роут вебхуков каналов (план B0 п.4):
// подключение ищет адаптер → parseWebhook (валидация подписи) → общий пайплайн.
import { getAdapter } from "../../../../server/channels/registry";
import { handleInboundEvents } from "../../../../server/channels/pipeline";
import { ChannelError } from "../../../../server/channels/adapter";

export async function POST(request: Request, { params }: { params: Promise<{ channel: string }> }): Promise<Response> {
  const { channel } = await params;
  const adapter = getAdapter(channel);
  if (!adapter) return Response.json({ message: "Неизвестный канал." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Некорректный JSON." }, { status: 400 });
  }

  try {
    const connection = await adapter.resolveConnection({
      query: new URL(request.url).searchParams,
      headers: request.headers,
      body,
    });
    if (!connection) return Response.json({ message: "Подключение не найдено." }, { status: 404 });
    if (connection.status !== "ACTIVE") {
      return Response.json({ message: "Подключение неактивно." }, { status: 409 });
    }
    const events = await adapter.parseWebhook(connection, request.headers, body);
    const result = await handleInboundEvents(connection, events);
    return Response.json(result);
  } catch (error) {
    if (error instanceof ChannelError) {
      return Response.json({ message: error.code }, { status: error.status });
    }
    console.error("webhook: ошибка обработки", error instanceof Error ? error.message : error);
    return Response.json({ message: "Внутренняя ошибка." }, { status: 500 });
  }
}
