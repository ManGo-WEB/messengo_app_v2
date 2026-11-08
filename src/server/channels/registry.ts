// Реестр адаптеров каналов: worker и вебхуки получают адаптер ТОЛЬКО здесь.
import { testingAdapter } from "./testing";
import { vkAdapter } from "./vk";
import { telegramBotAdapter } from "./telegram-bot";
import { telegramPersonalAdapter } from "./telegram-personal";
import { metaAdapterFor } from "./meta";
import { ChannelError, type ChannelAdapter, type ResolveConnectionInput } from "./adapter";
import type { ChannelConnection, ChannelType } from "../../generated/prisma/client";

const registry = new Map<ChannelType, ChannelAdapter>();

export function registerAdapter(adapter: ChannelAdapter): void {
  registry.set(adapter.type, adapter);
}

export function getAdapter(type: ChannelType | string): ChannelAdapter | null {
  // Ключи реестра — значения енума (верхний регистр); из URL приходит lowercase.
  const key = (typeof type === "string" ? type.toUpperCase() : type) as ChannelType;
  return registry.get(key) ?? null;
}

export function listAdapters(): ChannelAdapter[] {
  return [...registry.values()];
}

// Вебхук /api/webhooks/telegram общий (B2 бот + B3 личный): диспетчер пробует
// резолверы обоих адаптеров и делегирует тому, кому принадлежит подключение.
function adapterFor(connection: ChannelConnection): ChannelAdapter {
  return connection.type === "TELEGRAM_PERSONAL" ? telegramPersonalAdapter : telegramBotAdapter;
}

const telegramDispatch: ChannelAdapter = {
  type: "TELEGRAM" as ChannelType,
  initiateConnect: async () => {
    throw new ChannelError("TELEGRAM_DISPATCH", 500);
  },
  completeConnect: async () => {
    throw new ChannelError("TELEGRAM_DISPATCH", 500);
  },
  async resolveConnection(input: ResolveConnectionInput) {
    let firstError: unknown = null;
    try {
      const byBot = await telegramBotAdapter.resolveConnection(input);
      if (byBot) return byBot;
    } catch (error) {
      firstError = error;
    }
    try {
      const byPersonal = await telegramPersonalAdapter.resolveConnection(input);
      if (byPersonal) return byPersonal;
    } catch (error) {
      if (!firstError) firstError = error;
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

registerAdapter(vkAdapter);
registerAdapter(telegramBotAdapter);
registerAdapter(telegramPersonalAdapter);
const facebookAdapter = metaAdapterFor("FACEBOOK");
registerAdapter(facebookAdapter);
registerAdapter(metaAdapterFor("INSTAGRAM"));
registry.set("TELEGRAM" as ChannelType, telegramDispatch);
// Вебхук Meta общий для FB и IG: resolveConnection ищет по externalId в обоих типах
registry.set("META" as ChannelType, facebookAdapter);
// TESTING-канал — dev-only (план B0 п.6): выключен в production.
if (process.env.NODE_ENV !== "production") {
  registerAdapter(testingAdapter);
}
