"use client";

// Область контента каркаса (план D1/D2). Три режима:
//  - workspace-страницы (Чаты) — «во всю bleed»: от сайдбара до края экрана,
//    без max-width и отступов — рабочая область мессенджера не должна
//    ограничиваться колонкой (замечание владельца на широком экране);
//  - будущие «широкие» страницы (Воронка, Задачи) — широкая колонка;
//  - остальные — обычная колонка.
import { usePathname } from "next/navigation";

const BLEED_PREFIXES = ["/chats"];
const WIDE_PREFIXES = ["/funnel", "/tasks"];

export default function ContentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (BLEED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return <div className="content--bleed">{children}</div>;
  }
  const wide = WIDE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  return <div className={`content ${wide ? "content--wide" : ""}`}>{children}</div>;
}
