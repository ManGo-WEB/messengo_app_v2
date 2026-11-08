// Универсальный роут вебхуков каналов (план B0 п.4):
// подключение ищет адаптер → parseWebhook (валидация подписи) → общий пайплайн.
// GET — верификация вебхуков (Meta hub.challenge), POST — события.
import { getAdapter } from "../../../../server/channels/registry";
import { handleInboundEvents } from "../../../../server/channels/pipeline";
import { ChannelError } from "../../../../server/channels/adapter";

export async function GET(request: Request, { params }: { params: Promise<{ channel: string }> }): Promise<Response> {
  const { channel } = await params;
  const adapter = getAdapter(channel);
  if (!adapter?.handleWebhookGet) return Response.json({ message: "Не найдено." }, { status: 405 });
  return adapter.handleWebhookGet(request);
}

export async function POST(request: Request, { params }: { params: Promise<{ channel: string }> }): Promise<Response> {
  const { channel } = await params;
  const adapter = getAdapter(channel);
  if (!adapter) return Response.json({ message: "Неизвестный канал." }, { status: 404 });

  // сырое тело читаем один раз: подписи (Meta X-Hub-Signature-256) считаются по нему
  const rawBody = await request.text();
  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
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
    // Специальные вебхуки (VK confirmation, Telegram /start-proof на PENDING-
    // подключении) каналы обрабатывают сами — допускаем не-ACTIVE, кроме
    // отключённых/ошибочных; общий путь остаётся только для ACTIVE.
    if (adapter.handleWebhook) {
      if (connection.status === "DISCONNECTED" || connection.status === "ERROR") {
        return Response.json({ message: "Подключение неактивно." }, { status: 409 });
      }
      // return await — иначе реджект промиса пролетает мимо catch этого try
      return await adapter.handleWebhook(connection, request, body, rawBody);
    }
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
