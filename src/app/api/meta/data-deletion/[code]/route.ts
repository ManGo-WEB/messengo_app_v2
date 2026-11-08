// Флоу удаления данных канала (план B4, обязателен для Meta App Review):
// GET  — страница подтверждения (Meta редиректит пользователя с ?code=…),
// POST — подтверждение запроса на удаление.
import { getDb } from "../../../../../server/db/client";

const page = (title: string, body: string) =>
  new Response(
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
      `<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;color:#111}button{padding:10px 18px;font-size:16px}</style></head>` +
      `<body><h1>${title}</h1>${body}</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await params;
  const deletion = await getDb().metaDeletionRequest.findUnique({ where: { code } });
  if (!deletion) return page("Запрос не найден", "<p>Ссылка недействительна или устарела.</p>", );
  if (deletion.status === "CONFIRMED") {
    return page("Удаление подтверждено", "<p>Запрос на удаление данных канала подтверждён и будет выполнен.</p>");
  }
  return page(
    "Удаление данных",
    `<p>Подтвердите удаление данных этого канала (диалоги и контакты) из Messengo.</p>` +
      `<form method="post"><button type="submit">Подтвердить удаление</button></form>`,
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await params;
  const db = getDb();
  const deletion = await db.metaDeletionRequest.findUnique({ where: { code } });
  if (!deletion) return page("Запрос не найден", "<p>Ссылка недействительна или устарела.</p>");
  if (deletion.status !== "CONFIRMED") {
    await db.metaDeletionRequest.update({
      where: { code },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
    // Фактическое удаление данных канала выполняет фоновая обработка (B5/G):
    // здесь фиксируется подтверждение пользователя.
  }
  return page("Удаление подтверждено", "<p>Запрос на удаление данных канала подтверждён и будет выполнен.</p>");
}
