import type { Metadata } from "next";
import "./globals.css";
// Дизайн-система глобально: примитивы и .ch-icon нужны и вне (app) — auth, лендинг (D6).
import "@/components/ui/ui.css";

export const metadata: Metadata = {
  title: "Messengo V2",
  description: "Единый Inbox для всех мессенджеров",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
