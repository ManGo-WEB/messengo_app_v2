"use client";

// Экран «Чаты» (план D2): трёхколоночный Inbox — список диалогов, история с
// композером, карточка контакта. Заменяет заглушку D1.
// Параметр ?conversation=<id> (план D7): ссылка «Открыть диалог» со страницы
// «Память» — сразу открывает нужный диалог.
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import InboxWorkspace from "@/components/inbox/InboxWorkspace";

function ChatsWorkspace() {
  const conversation = useSearchParams().get("conversation") ?? undefined;
  return <InboxWorkspace initialSelectedId={conversation} />;
}

export default function ChatsPage() {
  return (
    // useSearchParams требует Suspense-границу для статической сборки
    <Suspense fallback={null}>
      <ChatsWorkspace />
    </Suspense>
  );
}
