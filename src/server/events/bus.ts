// Шина событий реального времени (план D2 п.3): веб-процесс и воркер — разные
// процессы, поэтому транспорт — Postgres LISTEN/NOTIFY. Подписчики (SSE-роут)
// фильтруют события по организации.
import { Client } from "pg";
import { getDb } from "../db/client";

const CHANNEL = "messengo_events";
const NOTIFY_LIMIT_BYTES = 7000; // лимит pg_notify — 8000 байт, оставляем запас

export type BusEventType = "message.new" | "message.status" | "notification" | "channel.status";

export type BusEvent = {
  type: BusEventType;
  orgId: string;
  conversationId?: string;
  messageId?: string;
  // channel.status: какое подключение изменилось (план D3)
  connectionId?: string;
  connectionName?: string;
  direction?: "IN" | "OUT";
  status?: string;
  preview?: string;
  contactName?: string;
  channelType?: string;
  threadTitle?: string | null;
  ts: string;
};

type Subscriber = (event: BusEvent) => void;

const globalBus = globalThis as unknown as {
  messengoBusSubscribers?: Set<Subscriber>;
  messengoBusListener?: Client;
  messengoBusStarting?: Promise<void>;
};

function subscribers(): Set<Subscriber> {
  return (globalBus.messengoBusSubscribers ??= new Set());
}

// Публикация: pg_notify через общий пул Prisma. Preview обрезаем — полные тексты
// клиент добирает своими запросами.
export async function publishBusEvent(event: Omit<BusEvent, "ts"> & { ts?: string }): Promise<void> {
  const full: BusEvent = {
    ...event,
    preview: event.preview?.slice(0, 160),
    ts: event.ts ?? new Date().toISOString(),
  };
  let payload = JSON.stringify(full);
  if (payload.length > NOTIFY_LIMIT_BYTES) payload = JSON.stringify({ ...full, preview: undefined });
  try {
    // pg_notify возвращает void, который Prisma не десериализует — подзапрос
    // отдаёт наружу обычную единицу.
    await getDb().$queryRaw`SELECT 1 AS sent FROM (SELECT pg_notify(${CHANNEL}, ${payload})) AS n`;
  } catch (error) {
    // События — вспомогательный механизм реального времени; сбой публикации
    // не должен ломать основной поток обработки (клиенты доберут данные опросом).
    console.error("events/bus: не опубликовано событие:", error instanceof Error ? error.message : error);
  }
}

async function ensureListener(): Promise<void> {
  if (globalBus.messengoBusListener) return;
  if (globalBus.messengoBusStarting) return globalBus.messengoBusStarting;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  globalBus.messengoBusStarting = (async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    client.on("notification", (message) => {
      if (!message.payload) return;
      try {
        const event = JSON.parse(message.payload) as BusEvent;
        for (const handler of subscribers()) handler(event);
      } catch {
        // битый payload не должен ронять слушателя
      }
    });
    client.on("error", (error) => {
      console.error("events/bus: слушатель отвалился:", error.message);
      globalBus.messengoBusListener = undefined;
      // переподключение ленивое — по следующей подписке/событию
    });
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    globalBus.messengoBusListener = client;
  })().finally(() => {
    globalBus.messengoBusStarting = undefined;
  });
  return globalBus.messengoBusStarting;
}

// Подписка на события; возвращает функцию отписки. Слушатель переживает HMR
// через globalThis (по образцу db/client).
export async function subscribeBusEvents(handler: Subscriber): Promise<() => void> {
  subscribers().add(handler);
  await ensureListener();
  return () => subscribers().delete(handler);
}
