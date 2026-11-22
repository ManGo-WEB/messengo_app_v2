// Шина событий реального времени (план D2 п.3): публикация через NOTIFY доходит
// до подписчиков LISTEN. Транспорт идёт через реальную БД messengo_test.
// Важно:-publish может уйти раньше, чем LISTEN-клиент подключится, поэтому
// каждый тест сначала дожидается факта подписки (ready), и только потом публикует.
import { describe, expect, test } from "bun:test";
import { publishBusEvent, subscribeBusEvents, type BusEvent } from "../../src/server/events/bus";

async function expectEvent(orgId: string, type: BusEvent["type"], timeoutMs = 3000): Promise<{
  ready: Promise<void>;
  event: Promise<BusEvent>;
  cleanup: () => void;
}> {
  let off: (() => void) | undefined;
  let resolveEvent!: (event: BusEvent) => void;
  let rejectEvent!: (reason: Error) => void;
  const event = new Promise<BusEvent>((resolve, reject) => {
    resolveEvent = resolve;
    rejectEvent = reject;
  });
  const timer = setTimeout(() => {
    off?.();
    rejectEvent(new Error(`событие ${type} не получено за ${timeoutMs} мс`));
  }, timeoutMs);
  const ready = subscribeBusEvents((e) => {
    if (e.orgId === orgId && e.type === type) {
      clearTimeout(timer);
      resolveEvent(e);
      off?.();
    }
  }).then((unsub) => {
    off = unsub;
  });
  return {
    ready,
    event,
    cleanup: () => off?.(),
  };
}

describe("Шина событий (LISTEN/NOTIFY)", () => {
  test("опубликованное событие доставляется подписчику", async () => {
    const { ready, event, cleanup } = await expectEvent("org-bus-1", "message.status");
    await ready;
    await publishBusEvent({
      type: "message.status",
      orgId: "org-bus-1",
      conversationId: "conv-1",
      messageId: "msg-1",
      direction: "OUT",
      status: "SENT",
      preview: "Здравствуйте!",
    });
    const received = await event;
    expect(received.status).toBe("SENT");
    expect(received.conversationId).toBe("conv-1");
    expect(received.ts).toBeTruthy();
    cleanup();
  });

  test("preview длиннее лимита обрезается, событие всё равно доставляется", async () => {
    const { ready, event, cleanup } = await expectEvent("org-bus-2", "message.new");
    await ready;
    await publishBusEvent({
      type: "message.new",
      orgId: "org-bus-2",
      conversationId: "conv-2",
      direction: "IN",
      preview: "х".repeat(500),
    });
    const received = await event;
    expect(received.preview?.length).toBeLessThanOrEqual(160);
    cleanup();
  });

  test("несколько подписчиков получают одно и то же событие", async () => {
    const first = await expectEvent("org-bus-3", "notification");
    const second = await expectEvent("org-bus-3", "notification");
    await Promise.all([first.ready, second.ready]);
    await publishBusEvent({ type: "notification", orgId: "org-bus-3", contactName: "Клиент", preview: "Привет" });
    const [a, b] = await Promise.all([first.event, second.event]);
    expect(a.contactName).toBe("Клиент");
    expect(b.contactName).toBe("Клиент");
    first.cleanup();
    second.cleanup();
  });
});
