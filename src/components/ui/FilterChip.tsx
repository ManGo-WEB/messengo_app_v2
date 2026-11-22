"use client";

// Фильтр-чип «Название ▾» — порт из прототипа.
import Icon from "../icons/Icon";

export default function FilterChip({ label, value, onClick }: { label: string; value?: string; onClick?: () => void }) {
  return (
    <button type="button" className={`fchip ${value ? "is-active" : ""}`} onClick={onClick}>
      {value || label}
      <Icon name="chevronDown" size={13} />
    </button>
  );
}
