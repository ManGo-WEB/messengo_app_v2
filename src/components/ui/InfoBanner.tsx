// Инфо-баннер — порт из прототипа.
import type { ReactNode } from "react";

export default function InfoBanner({
  tone = "info",
  icon,
  children,
  action,
}: {
  tone?: "info" | "warning";
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`ibanner ibanner--${tone}`}>
      {icon}
      <div className="ibanner__body">{children}</div>
      {action}
    </div>
  );
}
