// Пустое состояние — по образцу StubPage прототипа (design/prototype/src/App.jsx,
// стили .stub в inbox.css), план D1 п.2.
import type { ReactNode } from "react";
import Icon, { type IconName } from "../icons/Icon";

export default function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: IconName;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="estate">
      <span className="estate__ic">
        <Icon name={icon} size={26} />
      </span>
      <div className="estate__title">{title}</div>
      {text && <p className="estate__text">{text}</p>}
      {action && <div className="estate__action">{action}</div>}
    </div>
  );
}
