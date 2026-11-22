// Дашборд — главная после входа (план D5 п.2): сводка по данным Inbox
// через GET /api/stats/summary. После входа/регистрации редирект сюда.
import DashboardWorkspace from "@/components/dashboard/DashboardWorkspace";

export default function DashboardPage() {
  return <DashboardWorkspace />;
}
