// Поиск «Памяти» (план D7): GET /api/memory/search?q=… — полнотекстовый поиск
// по всей переписке организации; права — как у остальных защищённых роутов.
import { requireSession } from "../../../../server/auth/session";
import { searchMemory } from "../../../../server/rag/memory";

export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  try {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return Response.json(await searchMemory(session.data.organization.id, q), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("memory: поиск не выполнен:", error);
    return Response.json({ message: "Поиск недоступен. Попробуйте позже." }, { status: 500 });
  }
}
