"use client";

// Подписка на SSE-канал /api/events (план D2 п.3). Возвращает признак
// «поток подключён»: пока он false, потребители включают запасной опрос
// раз в 10 секунд. Браузер сам переподключается после обрыва (retry из роута).
// Передавайте обработчик в useCallback — он входит в зависимости эффекта.
import { useEffect, useState } from "react";

export type InboxEvent = {
  type: "message.new" | "message.status" | "notification";
  conversationId?: string;
  messageId?: string;
  direction?: "IN" | "OUT";
  status?: string;
  preview?: string;
  contactName?: string;
  channelType?: string;
  threadTitle?: string | null;
  ts: string;
};

export function useEventStream(onEvent: (event: InboxEvent) => void): boolean {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    const source = new EventSource("/api/events");
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data) as InboxEvent);
      } catch {
        // битый payload пропускаем — поток не роняем
      }
    };
    return () => {
      source.close();
    };
  }, [onEvent]);

  return connected;
}
