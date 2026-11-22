"use client";

// Табы (подчёркнутые и «пилюли») — порт из прототипа.
export type TabItem = { id: string; label: string; count?: number };

export default function Tabs({
  items,
  active,
  onChange,
  variant = "underline",
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  variant?: "underline" | "pills";
}) {
  return (
    <div className={`tabs tabs--${variant}`} role="tablist">
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={active === it.id}
          className={`tabs__item ${active === it.id ? "is-active" : ""}`}
          onClick={() => onChange(it.id)}
        >
          {it.label}
          {it.count != null && <span className="tabs__count">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}
