"use client";

// Выпадающий мульти-фильтр тулбара инбокса (предложение владельца): кнопка-чип
// «Статус»/«Источники», по клику — панель с чекбоксами; отмеченные пункты
// фильтруют список, пустой выбор = показывать всё. Панель закрывается по клику
// вне её и по Escape; снятие/установка галочек панель не закрывает.
import { useEffect, useRef, useState } from "react";
import Icon from "../icons/Icon";
import { Checkbox } from "../ui";

export type FilterOption = { id: string; label: string };

export default function FilterDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onChange(next);
  };

  return (
    <div className="fdrop" ref={rootRef}>
      <button
        type="button"
        className={`fdrop__btn fchip ${selected.size ? "is-active" : ""} ${open ? "is-open" : ""}`}
        onClick={() => setOpen((current) => !current)}
      >
        {selected.size ? `${label} · ${selected.size}` : label}
        <Icon name="chevronDown" size={13} className="fdrop__chev" />
      </button>

      {open && (
        <div className="fdrop__panel">
          {options.map((option) => (
            <div key={option.id} className="fdrop__row">
              <Checkbox
                checked={selected.has(option.id)}
                onChange={(checked) => toggle(option.id, checked)}
                label={option.label}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
