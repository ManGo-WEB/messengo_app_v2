"use client";

// Кнопка — порт из прототипа (design/prototype/src/components/ui/ui.jsx).
import type { ButtonHTMLAttributes } from "react";
import Icon, { type IconName } from "../icons/Icon";

export type ButtonVariant = "primary" | "outline" | "soft" | "success" | "ghost";
export type ButtonSize = "sm" | "md";

export default function Button({
  variant = "primary",
  size = "md",
  icon,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
}) {
  return (
    <button className={`btn btn--${variant} btn--${size} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 15 : 17} />}
      {children}
    </button>
  );
}
