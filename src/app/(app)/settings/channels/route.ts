// GET /settings/channels — адрес, на который OAuth-callback VK/Meta (B1/B4)
// возвращает оператора с результатом в query (?vk=…|?meta=…). Экран подключений
// живёт на /channels (план D3) — сохраняем query и переносим туда (307).
// Route-handler, а не страница: redirect() в серверном компоненте при
// cacheComponents ломает пререндер (страница отдаёт 404). Location —
// ОТНОСИТЕЛЬНЫЙ: редирект остаётся на том хосте, с которого пришёл оператор
// (абсолютный из AUTH_BASE_URL уводит на другой домен → кука сессии не приложится).
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  return new Response(null, {
    status: 307,
    headers: { Location: `/channels${url.search}` },
  });
}
