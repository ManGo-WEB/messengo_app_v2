// Инфо-баннер — порт из прототипа (тон danger — red alert «не оплачен тариф»,
// план D4).
import type { ReactNode } from "react";

export default function InfoBanner({
  tone = "info",
  icon,
  children,
  action,
}: {
  tone?: "info" | "warning" | "danger";
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
