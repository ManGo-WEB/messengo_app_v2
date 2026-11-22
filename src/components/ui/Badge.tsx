// Плашка статуса — порт из прототипа.
import type { HTMLAttributes } from "react";

export type BadgeTone = "green" | "red" | "blue" | "yellow" | "gray" | "outline";

const TONES: Record<BadgeTone, string> = {
  green: "badge--green",
  red: "badge--red",
  blue: "badge--blue",
  yellow: "badge--yellow",
  gray: "badge--gray",
  outline: "badge--outline",
};

export default function Badge({
  tone = "gray",
  children,
  className = "",
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span className={`badge ${TONES[tone]} ${className}`} {...rest}>
      {children}
    </span>
  );
}
