// Экран «Чаты» (план D2): трёхколоночный Inbox — список диалогов, история с
// композером, карточка контакта. Заменяет заглушку D1.
// Параметр ?conversation=<id> (план D7): ссылка «Открыть диалог» со страницы
// «Память» — сразу открывает нужный диалог.
import InboxWorkspace from "@/components/inbox/InboxWorkspace";

export default async function ChatsPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const conversation = (await searchParams).conversation;
  return <InboxWorkspace initialSelectedId={conversation} />;
}
