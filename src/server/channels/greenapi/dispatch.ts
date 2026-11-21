// Общий вебхук Green API (план C2/C3): /api/webhooks/greenapi обслуживает
// WhatsApp (WHATSAPP) и MAX (MAX) — форматы уведомлений у Green API едины,
// маршрутизация по instanceData.idInstance (см. runtime.findGreenApiConnectionByIdInstance).
// Аналогично telegramDispatch в registry.ts.
import { ChannelError, type ChannelAdapter, type ResolveConnectionInput } from "../adapter";
import { whatsappAdapter } from "./whatsapp";
import type { ChannelConnection, ChannelType } from "../../../generated/prisma/client";

// C3 добавит сюда maxAdapter; до него MAX-подключения через dispatch не работают.
const adapterByType = new Map<string, ChannelAdapter>([["WHATSAPP", whatsappAdapter]]);

function adapterFor(connection: ChannelConnection): ChannelAdapter {
  const adapter = adapterByType.get(connection.type);
  if (!adapter) throw new ChannelError("GREENAPI_UNSUPPORTED_TYPE", 400);
  return adapter;
}

export const greenApiDispatch: ChannelAdapter = {
  type: "GREENAPI" as ChannelType,
  initiateConnect: async () => {
    // подключение начинается через конкретный канал: POST /api/channels/whatsapp/connect
    throw new ChannelError("GREENAPI_DISPATCH", 500);
  },
  completeConnect: async () => {
    throw new ChannelError("GREENAPI_DISPATCH", 500);
  },
  async resolveConnection(input: ResolveConnectionInput) {
    // C2: только WhatsApp; C3 добавит попытку MAX-адаптера
    let firstError: unknown = null;
    for (const adapter of new Set(adapterByType.values())) {
      try {
        const found = await adapter.resolveConnection(input);
        if (found) return found;
      } catch (error) {
        if (!firstError) firstError = error;
      }
    }
    if (firstError) throw firstError;
    return null;
  },
  async parseWebhook(connection, headers, body) {
    return adapterFor(connection).parseWebhook(connection, headers, body);
  },
  async handleWebhook(connection, request, body, rawBody) {
    return adapterFor(connection).handleWebhook!(connection, request, body, rawBody);
  },
  async sendMessage(connection, text, context) {
    return adapterFor(connection).sendMessage(connection, text, context);
  },
};
