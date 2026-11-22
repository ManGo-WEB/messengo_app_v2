// SSE-канал реального времени (план D2 п.3): новые сообщения, смены статусов,
// уведомления. События приходят из шины на Postgres LISTEN/NOTIFY
// (src/server/events/bus.ts) и фильтруются по организации оператора.
// Heartbeat каждые 25 секунд держит соединение живым; при обрыве клиент
// переподключается сам (retry: 3000), запасной вариант — опрос раз в 10 секунд.
import { requireSession } from "../../../server/auth/session";
import { subscribeBusEvents, type BusEvent } from "../../../server/events/bus";

// Примечание: `export const dynamic` в этом проекте запрещён (nextConfig
// cacheComponents) — роут и так динамический: requireSession читает заголовки.

export async function GET(request: Request): Promise<Response> {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const orgId = session.data.organization.id;
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const enqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      enqueue("retry: 3000\n\n");

      subscribeBusEvents((event: BusEvent) => {
        if (event.orgId !== orgId) return;
        // orgId наружу не отдаём — клиенту он не нужен (undefined выпадает при сериализации)
        enqueue(`data: ${JSON.stringify({ ...event, orgId: undefined })}\n\n`);
      })
        .then((off) => {
          unsubscribe = off;
        })
        .catch((error) => {
          console.error("api/events: подписка не удалась:", error instanceof Error ? error.message : error);
        });

      const heartbeat = setInterval(() => enqueue(": hb\n\n"), 25_000);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe?.();
        closed = true;
        try {
          controller.close();
        } catch {
          // уже закрыт
        }
      });
    },
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
