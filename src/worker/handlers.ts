// Реестр обработчиков OutboxJob: ключ — поле OutboxJob.type.
// На этом этапе (A4) один обработчик-заглушка echo; канальные обработчики
// (VK, Telegram, Green API, Meta) регистрируются здесь в фазах B/C.
export type ClaimedJob = {
  id: string;
  type: string;
  attempts: number;
  messageId: string;
};

export type HandlerOutcome = { result: "SENT" | "UNKNOWN"; detail?: string };

export type OutboxHandler = (job: ClaimedJob) => Promise<HandlerOutcome>;

const registry = new Map<string, OutboxHandler>([
  [
    "echo",
    async (job) => {
      console.log(`worker: echo-обработчик, задание ${job.id} (сообщение ${job.messageId})`);
      return { result: "SENT" };
    },
  ],
]);

export function registerOutboxHandler(type: string, handler: OutboxHandler): void {
  registry.set(type, handler);
}

export async function dispatch(job: ClaimedJob): Promise<HandlerOutcome> {
  const handler = registry.get(job.type);
  if (!handler) throw new Error(`Нет обработчика для типа задания «${job.type}»`);
  return handler(job);
}
