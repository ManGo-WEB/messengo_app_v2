// Тост — нового в прототипе нет, спроектирован в его визуальном языке
// (.card + --shadow-m; иконка по тону). Тосты фиксированы в правом нижнем
// углу: контейнер ToastStack, карточка Toast (план D1 п.2).
import type { ReactNode } from "react";
import Icon, { type IconName } from "../icons/Icon";

export type ToastTone = "success" | "error" | "info";

const TONE_ICONS: Record<ToastTone, IconName> = {
  success: "checks",
  error: "close",
  info: "info",
};

export function ToastStack({ children }: { children: ReactNode }) {
  return <div className="toast-stack">{children}</div>;
}

export default function Toast({
  tone = "info",
  icon,
  children,
  onClose,
}: {
  tone?: ToastTone;
  icon?: IconName;
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className={`toast toast--${tone}`} role="status">
      <span className="toast__ic">
        <Icon name={icon ?? TONE_ICONS[tone]} size={17} />
      </span>
      <div className="toast__body">{children}</div>
      {onClose && (
        <button type="button" className="toast__close" onClick={onClose} aria-label="Закрыть">
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}
