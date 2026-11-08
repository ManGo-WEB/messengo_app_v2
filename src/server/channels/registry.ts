// Реестр адаптеров каналов: worker и вебхуки получают адаптер ТОЛЬКО здесь.
import type { ChannelAdapter } from "./adapter";
import type { ChannelType } from "../../generated/prisma/client";
import { testingAdapter } from "./testing";
import { vkAdapter } from "./vk";

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

registerAdapter(vkAdapter);
// TESTING-канал — dev-only (план B0 п.6): выключен в production.
if (process.env.NODE_ENV !== "production") {
  registerAdapter(testingAdapter);
}
