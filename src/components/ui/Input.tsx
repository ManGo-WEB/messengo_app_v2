// Поле ввода — нового в прототипе нет, спроектировано в его визуальном языке
// (геометрия и фокус — как у .btn--md / .search, план D1 п.2).
import type { InputHTMLAttributes } from "react";

export default function Input({
  className = "",
  error = false,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return <input className={`input ${error ? "input--error" : ""} ${className}`} {...rest} />;
}
