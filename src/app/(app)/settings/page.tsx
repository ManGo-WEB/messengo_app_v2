// Заглушка раздела «Настройки» (план D1 КП; экран настроек — D5).
import { EmptyState } from "@/components/ui";

export default function SettingsPage() {
  return (
    <>
      <h1 className="page-title">Настройки</h1>
      <EmptyState
        icon="gear"
        title="Настройки в разработке"
        text="Профиль организации и оператора, смена пароля и управление API-ключом LLM появятся в фазе D5."
      />
    </>
  );
}
