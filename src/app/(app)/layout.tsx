// Каркас приложения по прототипу (план D1 п.3): тёмный сайдбар слева,
// верхняя панель с уведомлениями, баннер пробного периода (на разделах,
// где он есть в прототипе), область контента. Разделы фаз D2–D5 рендерятся
// внутрь .content.
import Sidebar from "@/components/layout/Sidebar";
import TopPanel from "@/components/layout/TopPanel";
import TrialBannerSlot from "@/components/layout/TrialBannerSlot";
import ContentShell from "@/components/layout/ContentShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <TopPanel />
        <TrialBannerSlot />
        <ContentShell>{children}</ContentShell>
      </div>
    </div>
  );
}
