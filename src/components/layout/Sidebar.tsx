"use client";

// Тёмный сайдбар с навигацией по разделам (план D1 п.3). Список разделов —
// по плану разработки (Чаты, Каналы связи, Оплаты, Воронка, Задачи, Настройки),
// визуал — порт сайдбара прототипа (design/prototype/src/components/layout/Sidebar.jsx).
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "../icons/Icon";
import "./sidebar.css";

type NavItem = { href: string; icon: IconName; label: string };

const NAV: NavItem[] = [
  { href: "/chats", icon: "chat", label: "Чаты" },
  { href: "/memory", icon: "brain", label: "Память" },
  { href: "/channels", icon: "send", label: "Каналы связи" },
  { href: "/payments", icon: "wallet", label: "Оплаты" },
  { href: "/funnel", icon: "kanban", label: "Воронка" },
  { href: "/tasks", icon: "tasks", label: "Задачи" },
  { href: "/settings", icon: "gear", label: "Настройки" },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="side">
      <nav className="side__nav">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`side__item ${active ? "is-active" : ""}`}
              title={item.label}
            >
              <span className="side__ic">
                <Icon name={item.icon} size={21} />
              </span>
              <span className="side__label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="side__bottom">
        <Link href="/settings" className="side__item" title="Помощь">
          <span className="side__ic">
            <Icon name="help" size={21} />
          </span>
          <span className="side__label">Помощь</span>
        </Link>
      </div>
    </aside>
  );
}
