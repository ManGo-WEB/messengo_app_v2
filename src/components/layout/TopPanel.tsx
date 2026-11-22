"use client";

// Верхняя панель с NotificationPanel (план D1 п.3 + D2 п.3): уведомления теперь
// живые — приходят по SSE-каналу /api/events на каждое входящее сообщение
// (ш.bus: type="notification"). История уведомлений на сервере — объём D5.
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "../icons/Icon";
import Avatar from "../ui/Avatar";
import ChannelIcon from "../icons/ChannelIcon";
import { useEventStream, type InboxEvent } from "../../hooks/useEventStream";
import "./topbar.css";

type Notification = { id: string; icon: IconName; channelType?: string; text: string; time: string };

const SECTION_TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: "/chats", title: "Чаты" },
  { prefix: "/channels", title: "Каналы связи" },
  { prefix: "/payments", title: "Оплаты" },
  { prefix: "/funnel", title: "Воронка" },
  { prefix: "/tasks", title: "Задачи" },
  { prefix: "/settings", title: "Настройки" },
];

export default function TopPanel() {
  const pathname = usePathname();
  const [panelOpen, setPanelOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [authed, setAuthed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Один probe авторизации на монтирование: SSE открываем только при сессии
  // (EventSource при 401 бесконечно ретраится и шумит в консоли).
  useEffect(() => {
    let alive = true;
    void fetch("/api/auth/me")
      .then((response) => {
        if (alive) setAuthed(response.ok);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const onEvent = useCallback((event: InboxEvent) => {
    if (event.type !== "notification") return;
    setNotifications((prev) => [
      {
        id: `${event.messageId}-${event.ts}`,
        icon: "chat",
        channelType: event.channelType,
        text: event.contactName
          ? `Новое сообщение от «${event.contactName}»: ${event.preview ?? ""}`
          : `Новое сообщение: ${event.preview ?? ""}`,
        time: new Date(event.ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      },
      ...prev.slice(0, 19),
    ]);
  }, []);
  useEventStream(onEvent, authed);

  // Закрытие панели по клику вне её области.
  useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setPanelOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [panelOpen]);

  const title = SECTION_TITLES.find((section) => pathname.startsWith(section.prefix))?.title ?? "";
  const unread = notifications;

  return (
    <div className="topbar" ref={rootRef}>
      <div className="topbar__title">{title}</div>
      <div className="topbar__right">
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className="topbar__btn"
            aria-label="Уведомления"
            onClick={() => setPanelOpen((open) => !open)}
          >
            <Icon name="bell" size={20} />
            {unread.length > 0 && <span className="topbar__badge">{unread.length}</span>}
          </button>

          {panelOpen && (
            <div className="npanel">
              <div className="npanel__header">
                <span className="npanel__title">Уведомления</span>
                {unread.length > 0 && (
                  <button type="button" className="npanel__clear" onClick={() => setNotifications([])}>
                    Отметить всё прочитанным
                  </button>
                )}
              </div>
              {unread.length === 0 ? (
                <div className="npanel__empty">Новых уведомлений нет</div>
              ) : (
                unread.map((item) => (
                  <div key={item.id} className="npanel__item">
                    <span className="npanel__ic npanel__ic--brand">
                      {item.channelType ? <ChannelIcon id={item.channelType} size={26} /> : <Icon name={item.icon} size={16} />}
                    </span>
                    <div className="npanel__body">
                      <div className="npanel__text">{item.text}</div>
                      <div className="npanel__time">{item.time}</div>
                    </div>
                    <span className="npanel__dot" />
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Профиль оператора — заполнится живыми данными в D5 (экран «Настройки»). */}
        <Avatar name="Оператор" size={34} />
      </div>
    </div>
  );
}
