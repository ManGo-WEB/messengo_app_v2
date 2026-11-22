"use client";

// Показ TrialBanner вверху .main на разделах, где он есть в прототипе
// (channels, payments, settings). CTA ведёт на «Оплаты», как в App.jsx прототипа.
import { usePathname, useRouter } from "next/navigation";
import TrialBanner from "./TrialBanner";

const BANNER_PREFIXES = ["/channels", "/payments", "/settings"];

export default function TrialBannerSlot() {
  const pathname = usePathname();
  const router = useRouter();
  if (!BANNER_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
  return <TrialBanner onPay={() => router.push("/payments")} />;
}
