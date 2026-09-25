import { NextRequest } from "next/server";
import { loadNewsroomConfig } from "@/newsroom/config/load-config";
import { readXState, updateX, xStatus } from "@/newsroom/browser-x/server";
import { X_SEARCH_URL } from "@/newsroom/browser-x/model";
export const runtime = "nodejs";
function local(request: NextRequest) {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const origin = request.headers.get("origin");
  return (
    /^(127\.0\.0\.1|localhost):(3510|3520)$/.test(host) &&
    (!origin || origin === `http://${host}`) &&
    request.headers.get("x-newsroom-client") === "1"
  );
}
export async function GET(request: NextRequest) {
  if (!local(request)) return Response.json({ error: "Use the local Newsroom app." }, { status: 403 });
  const enabled = (await loadNewsroomConfig()).xBrowser?.enabled === true;
  return Response.json(
    { enabled, ...(enabled ? xStatus(await readXState()) : {}), searchUrl: X_SEARCH_URL, intervalMinutes: 5 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: NextRequest) {
  if (!local(request) || !(await loadNewsroomConfig()).xBrowser?.enabled)
    return Response.json({ error: "Browser collection is not enabled for this local app." }, { status: 403 });
  const text = await request.text();
  if (text.length > 60000) return Response.json({ error: "Batch too large." }, { status: 413 });
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body || !["request", "claim", "complete", "unavailable", "failed"].includes(body.action))
    return Response.json({ error: "Invalid collection action." }, { status: 400 });
  try {
    const state = await updateX(body.action, body.id, body.posts);
    return Response.json(
      { enabled: true, ...xStatus(state), searchUrl: X_SEARCH_URL },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Collection input invalid, already active, or storage unavailable." },
      { status: 409 },
    );
  }
}
