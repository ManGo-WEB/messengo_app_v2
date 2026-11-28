// Продуктовый лендинг (план D6 п.1) — главная страница. Заменяет временную
// заглушку со списком разделов. Тексты — landing/structure.md.
import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";

// «Заголовок вкладки» и «Описание для поиска» — landing/structure.md.
export const metadata: Metadata = {
  title: "Messengo — все клиентские переписки в одном окне",
  description:
    "Подключите Telegram, MAX, WhatsApp*, ВКонтакте, Instagram* и Facebook* и отвечайте клиентам из одного окна. 7 дней бесплатно, без карты.",
};

export default function HomePage() {
  return <LandingPage />;
}
