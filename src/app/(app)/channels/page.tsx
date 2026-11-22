// Заглушка раздела «Каналы связи» (план D1 КП; экран подключений — D3).
import { EmptyState, InfoBanner } from "@/components/ui";

export default function ChannelsPage() {
  return (
    <>
      <h1 className="page-title">Каналы связи</h1>
      <InfoBanner tone="info">Подключайте VK, Telegram, WhatsApp, MAX, Facebook и Instagram — флоу подключений появится на экране в фазе D3.</InfoBanner>
      <EmptyState
        icon="send"
        title="Подключений пока нет"
        text="Список подключений организации с флоу подключения каждого канала появится в фазе D3. API подключений уже работает (B5)."
      />
    </>
  );
}
