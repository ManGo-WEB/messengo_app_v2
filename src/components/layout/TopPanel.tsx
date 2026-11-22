"use client";

// Верхняя панель с NotificationPanel (план D1 п.3). Уведомления пока моковые —
// реальное наполнение появится вместе с SSE-каналом в D2 п.3.
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "../icons/Icon";
import Avatar from "../ui/Avatar";
import "./topbar.css";

type Notification = { id: string; icon: IconName; text: string; time: string };

// TODO(D2): заменить моки на живые события SSE-канала /api/events.
const MOCK_NOTIFICATIONS: Notification[] = [
  { id: "n1", icon: "chat", text: "Новое сообщение в диалоге с «Иван Царевич»", time: "2 мин назад" },
  { id: "n2", icon: "send", text: "Подключение WhatsApp требует внимания: инстанс не авторизован", time: "15 мин назад" },
  { id: "n3", icon: "spark", text: "Добро пожаловать в Messengo! Начните с подключения каналов", time: "1 ч назад" },
];

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
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);

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
  const unread = MOCK_NOTIFICATIONS.filter((item) => !readIds.has(item.id));

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
                  <button
                    type="button"
                    className="npanel__clear"
                    onClick={() => setReadIds(new Set(MOCK_NOTIFICATIONS.map((item) => item.id)))}
                  >
                    Отметить всё прочитанным
                  </button>
                )}
              </div>
              {unread.length === 0 ? (
                <div className="npanel__empty">Новых уведомлений нет</div>
              ) : (
                unread.map((item) => (
                  <div key={item.id} className="npanel__item">
                    <span className="npanel__ic">
                      <Icon name={item.icon} size={16} />
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
