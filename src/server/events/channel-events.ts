// Событие смены статуса/этапа подключения канала (план D3 п.2): идёт в SSE-канал
// /api/events, чтобы экран «Каналы связи» и диалоги подключения обновлялись без
// опроса (например, привязка личного Telegram через вебхук служебного бота).
import { publishBusEvent } from "./bus";
import type { ChannelConnection } from "../../generated/prisma/client";

export async function publishChannelStatus(
  connection: Pick<ChannelConnection, "id" | "organizationId" | "type" | "status" | "displayName">,
): Promise<void> {
  await publishBusEvent({
    type: "channel.status",
    orgId: connection.organizationId,
    connectionId: connection.id,
    connectionName: connection.displayName ?? undefined,
    channelType: connection.type,
    status: connection.status,
  });
}
