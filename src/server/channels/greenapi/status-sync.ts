// Периодическая проверка инстансов Green API (план C2 п.5): каждые 5 минут воркер
// опрашивает getStateInstance подключений WHATSAPP/MAX.
//  - ACTIVE + notAuthorized/blocked/suspended → ERROR (уведомление оператору — лог
//    до появления UI-уведомлений в фазе D);
//  - PENDING + notAuthorized дольше 10 мин → ERROR (КП C2 «отвалившийся QR»);
//  - транзиентные состояния (starting, sleepMode) не меняют статус.
// Сетевые сбои опроса не ломают цикл — статус меняет только факт состояния инстанса.
import { getDb } from "../../db/client";
import { publishChannelStatus } from "../../events/channel-events";
import { clientFor, openGreenApiConfig, sealGreenApiConfig, BROKEN_INSTANCE_STATES, QR_EXPIRY_MS } from "./runtime";
import type { GreenApiConnectionConfig } from "./runtime";
import type { ChannelConnection } from "../../../generated/prisma/client";

export type GreenApiCheckSummary = { checked: number; errored: number; skipped: number };

export async function checkGreenApiInstances(): Promise<GreenApiCheckSummary> {
  const db = getDb();
  const connections = await db.channelConnection.findMany({
    where: { type: { in: ["WHATSAPP", "MAX"] }, status: { in: ["ACTIVE", "PENDING"] } },
  });
  let errored = 0;
  let skipped = 0;
  for (const connection of connections) {
    try {
      const stateInstance = (await clientFor(connection).getStateInstance()).stateInstance;
      const config = openGreenApiConfig(connection);
      const broken = BROKEN_INSTANCE_STATES.has(stateInstance);
      if (connection.status === "ACTIVE") {
        if (broken) {
          await markBroken(connection, config, stateInstance);
          errored++;
        } else if (config.lastState !== stateInstance) {
          await db.channelConnection.update({
            where: { id: connection.id },
            data: { config: await sealGreenApiConfig(connection.id, { ...config, lastState: stateInstance }) },
          });
        }
      } else {
        // PENDING: окно QR 10 мин (КП C2)
        const qrAge = config.qrRequestedAt ? Date.now() - Date.parse(config.qrRequestedAt) : QR_EXPIRY_MS;
        if (broken && (stateInstance === "notAuthorized" ? qrAge > QR_EXPIRY_MS : true)) {
          await markBroken(connection, config, stateInstance);
          errored++;
        } else if (config.lastState !== stateInstance) {
          await db.channelConnection.update({
            where: { id: connection.id },
            data: { config: await sealGreenApiConfig(connection.id, { ...config, lastState: stateInstance }) },
          });
        }
      }
    } catch (error) {
      skipped++;
      console.error(
        `greenapi: проверка ${connection.type} ${connection.id} не удалась:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  if (connections.length > 0) {
    console.log(
      `greenapi: проверка инстансов — всего ${connections.length}, ошибок ${errored}, пропущено ${skipped}`,
    );
  }
  return { checked: connections.length, errored, skipped };
}

async function markBroken(
  connection: ChannelConnection,
  config: GreenApiConnectionConfig,
  stateInstance: string,
): Promise<void> {
  await getDb().channelConnection.update({
    where: { id: connection.id },
    data: {
      status: "ERROR",
      config: await sealGreenApiConfig(connection.id, { ...config, lastState: stateInstance }),
    },
  });
  await publishChannelStatus({ ...connection, status: "ERROR" });
  console.error(
    `greenapi: подключение ${connection.id} (${connection.type}) → ERROR, состояние ${stateInstance}`,
  );
}
