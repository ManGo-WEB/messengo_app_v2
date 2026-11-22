// Общие типы экрана «Чаты» (план D2).
export type ConversationItem = {
  id: string;
  channel: string;
  channelStatus: string;
  connectionName: string | null;
  contactName: string | null;
  contactExternalId: string;
  externalKey: string | null;
  threadTitle: string | null;
  lastMessageAt: string | null;
  lastMessage: { text: string; direction: string; status: string; createdAt: string | null } | null;
};

export type MessageItem = {
  id: string;
  direction: "IN" | "OUT";
  text: string;
  status: string;
  externalId: string | null;
  createdAt: string;
};

export type ConversationInfo = {
  id: string;
  externalKey: string | null;
  threadTitle: string | null;
  lastMessageAt: string | null;
  contact: { name: string | null; externalId: string };
  connection: { type: string; status: string; name: string };
};

export type DraftRow = { text: string; revision: number };

export const CONNECTION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Активно",
  PENDING: "Ожидает подключения",
  ERROR: "Ошибка",
  DISCONNECTED: "Отключено",
};
