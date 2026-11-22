// Заглушка раздела «Задачи» (план D1 КП; экран на моках — D5).
import { EmptyState } from "@/components/ui";

export default function TasksPage() {
  return (
    <>
      <h1 className="page-title">Задачи</h1>
      <EmptyState
        icon="tasks"
        title="Задач пока нет"
        text="Раздел «Задачи» переносится из прототипа на моках в фазе D5."
      />
    </>
  );
}
