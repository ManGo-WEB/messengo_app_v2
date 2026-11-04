import { getAuth } from "../../../../server/auth/auth";
import { checkOrigin, errorResponse } from "../../../../server/auth/validate";

export async function POST(request: Request): Promise<Response> {
  const originError = checkOrigin(request);
  if (originError) return originError;
  try {
    const response = await getAuth().api.signOut({ headers: request.headers, asResponse: true });
    const headers = new Headers();
    for (const cookie of response.headers.getSetCookie()) headers.append("set-cookie", cookie);
    return new Response(null, { status: 204, headers });
  } catch (error) {
    return errorResponse(error);
  }
}
