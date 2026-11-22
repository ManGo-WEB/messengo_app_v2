// Экран «Память» (план D7): полнотекстовый поиск по всей истории переписки
// организации. Индекс наполняет worker (src/server/rag/indexer.ts).
import MemoryWorkspace from "@/components/memory/MemoryWorkspace";

export default function MemoryPage() {
  return <MemoryWorkspace />;
}
