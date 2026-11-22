// Заглушка раздела «Чаты» (план D1 КП; полноценный Inbox — D2).
import { EmptyState } from "@/components/ui";

export default function ChatsPage() {
  return (
    <>
      <h1 className="page-title">Чаты</h1>
      <EmptyState
        icon="chat"
        title="Диалогов пока нет"
        text="Здесь появится трёхколоночный Inbox: список диалогов, история переписки и карточка контакта."
      />
    </>
  );
}
