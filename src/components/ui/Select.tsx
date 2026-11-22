// Выпадающий список — нового в прототипе нет, спроектировано в его визуальном
// языке: нативный select со стрелкой-шевроном (план D1 п.2).
import type { SelectHTMLAttributes } from "react";
import Icon from "../icons/Icon";

export type SelectOption = { value: string; label: string };

export default function Select({
  options,
  className = "",
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { options: SelectOption[] }) {
  return (
    <span className={`select ${className}`}>
      <select className="select__field" {...rest}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={14} className="select__chevron" />
    </span>
  );
}
