import { requireSession } from "../../../../server/auth/session";

export async function GET(request: Request): Promise<Response> {
  const session = await requireSession(request);
  return session.ok ? Response.json(session.data) : session.response;
}
