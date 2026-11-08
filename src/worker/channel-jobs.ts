// Отправка исходящих через реестр каналов (план B0/B1): воркер берёт адаптер
// только по реестру; OutboxJob.type = тип канала (VK, TELEGRAM_BOT, …).
import { getDb } from "../server/db/client";
import { registerOutboxHandler } from "./handlers";
import { listAdapters } from "../server/channels/registry";

export function registerChannelSendJobs(): void {
  for (const adapter of listAdapters()) {
    registerOutboxHandler(adapter.type, async (job) => {
      const message = await getDb().message.findUniqueOrThrow({
        where: { id: job.messageId },
        include: { conversation: { include: { connection: true } } },
      });
      const result = await adapter.sendMessage(
        message.conversation.connection,
        message.text,
        { conversationKey: message.conversation.externalKey ?? "" },
      );
      if (result.status === "SENT") return { result: "SENT" as const, detail: `externalId=${result.externalId}` };
      if (result.status === "UNKNOWN") return { result: "UNKNOWN" as const, detail: result.externalId };
      throw new Error(result.error);
    });
  }
}
