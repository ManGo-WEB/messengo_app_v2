"use client";

// Область контента каркаса (план D1/D2): «рабочие» страницы (Чаты, Воронка,
// Задачи) отдаются в широкой колонке, остальные — в обычной. Класс выбирается
// по текущему маршруту (по образцу wide-мэппинга App.jsx прототипа).
import { usePathname } from "next/navigation";

const WIDE_PREFIXES = ["/chats", "/funnel", "/tasks"];

export default function ContentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wide = WIDE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  return <div className={`content ${wide ? "content--wide" : ""}`}>{children}</div>;
}
