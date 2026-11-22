// Заглушка раздела «Воронка» (план D1 КП; экран на моках — D5).
import { EmptyState } from "@/components/ui";

export default function FunnelPage() {
  return (
    <>
      <h1 className="page-title">Воронка</h1>
      <EmptyState
        icon="kanban"
        title="Канбан-доска появится позже"
        text="Раздел «Воронка» переносится из прототипа на моках в фазе D5."
      />
    </>
  );
}
