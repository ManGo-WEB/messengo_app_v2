// Общие типы экрана «Каналы связи» (план D3).
import type { ToastTone } from "../ui/Toast";

export type ConnectionRow = {
  id: string;
  type: string;
  status: string;
  externalName: string;
  createdAt: string;
  lastEventAt: string | null;
};

export type ChannelKind = "vk" | "telegram-bot" | "telegram-personal" | "whatsapp" | "max" | "facebook" | "instagram";

export type ChannelsDialog =
  | { kind: "vk"; connectionId?: string }
  | { kind: "telegram-bot" }
  | { kind: "telegram-personal" }
  | { kind: "greenapi"; channel: "WHATSAPP" | "MAX"; connectionId?: string }
  | { kind: "meta"; platform: "facebook" | "instagram"; connectionId?: string };

// Канал в сетке «можно подключить» (план D3 п.1: кнопка «Подключить»)
export type ConnectCard = {
  type: string;
  name: string;
  dialog: ChannelsDialog;
};

// SSE-событие channel.status, доносится из workspace в открытые диалоги,
// чтобы привязка личного Telegram и QR-подключения обновлялись без опроса.
export type ChannelStatusEvent = {
  connectionId?: string;
  connectionName?: string;
  channelType?: string;
  status?: string;
};

export type ToastItem = {
  id: number;
  tone: ToastTone;
  text: string;
  link?: { href: string; label: string };
};
