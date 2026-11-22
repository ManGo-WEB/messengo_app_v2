"use client";

// Степпер количества — порт из прототипа.
import Icon from "../icons/Icon";

export default function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <span className="stepper">
      <button
        type="button"
        className="stepper__btn"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Уменьшить"
      >
        <Icon name="close" size={11} style={{ strokeWidth: 2.6 }} />
      </button>
      <span className="stepper__val">{value}</span>
      <button
        type="button"
        className="stepper__btn"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Увеличить"
      >
        <Icon name="plus" size={12} style={{ strokeWidth: 2.4 }} />
      </button>
    </span>
  );
}
