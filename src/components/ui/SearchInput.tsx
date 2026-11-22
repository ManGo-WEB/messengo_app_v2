"use client";

// Поиск — порт из прототипа.
import Icon from "../icons/Icon";

export default function SearchInput({
  value,
  onChange,
  placeholder = "Поиск...",
  width = 220,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: number;
}) {
  return (
    <label className="search" style={{ width }}>
      <Icon name="search" size={16} className="search__ic" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}
