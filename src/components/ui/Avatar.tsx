// Аватар с инициалами — порт из прототипа (пустое имя → иконка-заглушка).
import Icon from "../icons/Icon";

const AV_COLORS = ["#5b8def", "#27ae60", "#f2994a", "#bb6bd9", "#eb5757", "#14b8c9"];

export default function Avatar({ name = "", size = 36, className = "" }: { name?: string; size?: number; className?: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const bg = AV_COLORS[Math.abs(hash) % AV_COLORS.length];
  return (
    <span
      className={`avatar ${className}`}
      style={{ width: size, height: size, background: bg, fontSize: Math.round(size * 0.38) }}
    >
      {initials || <Icon name="user" size={Math.round(size * 0.55)} />}
    </span>
  );
}
