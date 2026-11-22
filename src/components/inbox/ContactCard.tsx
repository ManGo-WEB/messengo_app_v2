// Карточка контакта — третья колонка инбокса (план D2 п.1). В прототипе
// карточки нет — спроектирована в его визуальном языке.
import Avatar from "../ui/Avatar";
import Badge from "../ui/Badge";
import ChannelIcon from "../icons/ChannelIcon";
import { formatListTime } from "./format";
import { CONNECTION_STATUS_LABELS, type ConversationInfo } from "./types";

const CHANNEL_LABELS: Record<string, string> = {
  VK: "VK",
  TELEGRAM_BOT: "Telegram-бот",
  TELEGRAM_PERSONAL: "Telegram-личный",
  WHATSAPP: "WhatsApp",
  MAX: "MAX",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  TESTING: "Тестовый канал",
};

const STATUS_TONES: Record<string, "green" | "red" | "yellow" | "gray"> = {
  ACTIVE: "green",
  ERROR: "red",
  PENDING: "yellow",
  DISCONNECTED: "gray",
};

export default function ContactCard({ info }: { info: ConversationInfo }) {
  const name = info.contact.name ?? info.contact.externalId;
  return (
    <aside className="contact">
      <div className="contact__head">
        <div className="contact__avatar">
          <Avatar name={name} size={56} />
        </div>
        <div className="contact__name">{name}</div>
        {info.threadTitle && <div className="contact__thread">Ветка: {info.threadTitle}</div>}
      </div>

      <div className="contact__rows">
        <div className="contact__row">
          <span className="contact__label">Канал</span>
          <span className="contact__value contact__channel">
            <ChannelIcon id={info.connection.type} size={20} />
            {CHANNEL_LABELS[info.connection.type] ?? info.connection.type}
          </span>
        </div>
        <div className="contact__row">
          <span className="contact__label">Подключение</span>
          <span className="contact__value contact__channel">
            <Badge tone={STATUS_TONES[info.connection.status] ?? "gray"}>
              {CONNECTION_STATUS_LABELS[info.connection.status] ?? info.connection.status}
            </Badge>
            <span>{info.connection.name}</span>
          </span>
        </div>
        <div className="contact__row">
          <span className="contact__label">Идентификатор в канале</span>
          <span className="contact__value">{info.contact.externalId}</span>
        </div>
        <div className="contact__row">
          <span className="contact__label">Ключ диалога</span>
          <span className="contact__value">{info.externalKey ?? "—"}</span>
        </div>
        <div className="contact__row">
          <span className="contact__label">Последнее сообщение</span>
          <span className="contact__value">{formatListTime(info.lastMessageAt) || "—"}</span>
        </div>
      </div>
    </aside>
  );
}
