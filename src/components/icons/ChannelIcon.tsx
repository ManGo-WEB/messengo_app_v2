// Круглые брендированные иконки каналов связи — порт из прототипа
// (design/prototype/src/components/icons/ChannelIcon.jsx, план D2 п.5).
// mono=true — «неактивный» серо-голубой вариант (как в тарифной сетке).
import type { CSSProperties } from "react";
import type { ChannelType } from "../../generated/prisma/client";

const GLYPHS = {
  phone: (
    <path
      d="M6.8 10.9c1.3 2.6 3.7 5 6.3 6.3l2.1-2.1c.3-.3.7-.4 1-.3 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1v3.3c0 .6-.4 1-1 1-8.8 0-16.4-7.6-16.4-16.4 0-.6.4-1 1-1h3.3c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.3 0 .7-.3 1l-2.1 2.1Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  send: <path d="M3 20.2 21.5 12 3 3.8v6.3L15 12 3 13.9v6.3Z" fill="currentColor" stroke="none" />,
  envelope: (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4.5 7.5 7.5 5.6 7.5-5.6" />
    </g>
  ),
  camera: (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3.8" y="3.8" width="16.4" height="16.4" rx="4.5" />
      <circle cx="12" cy="12" r="3.6" />
      <circle cx="16.9" cy="7.1" r="1" fill="currentColor" stroke="none" />
    </g>
  ),
  chat: (
    <path
      d="M12 3.6c4.9 0 8.9 3.2 8.9 7.2s-4 7.2-8.9 7.2c-.9 0-1.9-.1-2.7-.3L5 19.9l.9-2.9c-1.7-1.3-2.8-3.4-2.8-6.2 0-4 4-7.2 8.9-7.2Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  bolt: <path d="M12.6 2.5 5.5 13h4.6l-1.2 8.5L16.8 11h-4.7l.5-8.5Z" fill="currentColor" stroke="none" />,
  user: (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8.2" r="3.4" />
      <path d="M4.8 20c.8-3.4 3.7-5.3 7.2-5.3s6.4 1.9 7.2 5.3" />
    </g>
  ),
  logoOff: (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2" />
    </g>
  ),
} as const;

const BRANDS = {
  whatsapp: { bg: "#25D366", glyph: "phone" },
  telegram: { bg: "#229ED9", glyph: "send" },
  vk: { bg: "#0077FF", text: "VK" },
  instagram: { bg: "linear-gradient(45deg,#f7c948 0%,#ee2a7b 55%,#6228d7 100%)", glyph: "camera" },
  max: { bg: "linear-gradient(135deg,#8b5cf6,#4e7cff)", text: "M" },
  email: { bg: "#7b68ee", glyph: "envelope" },
  messenger: { bg: "linear-gradient(180deg,#00b2ff,#006aff)", glyph: "bolt" },
  facebook: { bg: "#1877F2", text: "f" },
  chatsite: { bg: "#14b8c9", glyph: "chat" },
  operator: { bg: "#8395AB", glyph: "user" },
  logo: { bg: "#b7c3d4", glyph: "logoOff" },
} as const;

type BrandId = keyof typeof BRANDS;

// Типы подключений V2 → брендовые иконки прототипа.
const CHANNEL_BRAND: Record<ChannelType, BrandId> = {
  VK: "vk",
  TELEGRAM_BOT: "telegram",
  TELEGRAM_PERSONAL: "telegram",
  WHATSAPP: "whatsapp",
  MAX: "max",
  FACEBOOK: "facebook",
  INSTAGRAM: "instagram",
  TESTING: "logo",
};

export type ChannelIconBrand = BrandId;

export default function ChannelIcon({
  id,
  size = 32,
  mono = false,
  className = "",
  style,
}: {
  /** Тип подключения V2 (VK, TELEGRAM_BOT, …) или бренд прототипа (vk, telegram, …). */
  id: string;
  size?: number;
  mono?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const brandId: BrandId =
    id in BRANDS
      ? (id as BrandId)
      : id in CHANNEL_BRAND
        ? CHANNEL_BRAND[id as ChannelType]
        : "logo"; // неизвестный тип — серая нейтральная иконка
  const brand = BRANDS[brandId];
  const bg = mono ? "#e9f0fd" : brand.bg;
  const fg = mono ? "#7aa5f2" : "#ffffff";
  const glyph = "glyph" in brand && brand.glyph && (
    <svg
      width={Math.round(size * 0.58)}
      height={Math.round(size * 0.58)}
      viewBox="0 0 24 24"
      style={{ color: fg }}
      aria-hidden="true"
    >
      {GLYPHS[brand.glyph]}
    </svg>
  );
  const text = "text" in brand && brand.text && (
    <span
      style={{
        color: fg,
        fontSize: Math.round(size * 0.4),
        fontWeight: 800,
        lineHeight: 1,
      }}
    >
      {brand.text}
    </span>
  );
  return (
    <span
      className={`ch-icon ${className}`}
      style={{ width: size, height: size, background: bg, fontSize: size, ...style }}
      aria-hidden="true"
    >
      {glyph || text}
    </span>
  );
}
