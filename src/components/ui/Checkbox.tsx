"use client";

// Чекбокс — порт из прототипа.
export default function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}) {
  return (
    <label className={`checkbox ${checked ? "is-checked" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="checkbox__box" aria-hidden="true">
        <svg viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="m1.5 5.2 2.8 2.8 5.7-6" />
        </svg>
      </span>
      {label && <span className="checkbox__label">{label}</span>}
    </label>
  );
}
